# AI Katsuyo Radar - daily morning issue launcher (headless, subscription auth)
# Invoked daily 07:15 by Windows Task Scheduler (task: AIRadarDaily). Runs `claude -p`
# which collects candidates via scripts/collect.mjs, writes a new issue into
# data/issues.json and git pushes (GitHub Pages auto-deploys).
# Exit codes: 0 ok / 2 auth failure (no retry) / 3 claude failed / 4 no issue for today /
#             9 launcher error. Non-zero -> one line appended to bridge\knowledge\job-alerts.md.
#             Failures other than auth are retried once after 10 min inside this script.
# Stop:  Unregister-ScheduledTask -TaskName 'AIRadarDaily' -Confirm:$false
# NOTE: keep THIS file ASCII-only (PS 5.1 misreads BOM-less UTF-8 with Japanese).
#       The Japanese prompt lives in daily-collect-prompt.txt, read back as UTF-8 below.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$repo       = 'C:\Users\kanedomi\Desktop\Claude\ai-radar'
$log        = Join-Path $repo 'scripts\run-daily.log'
$promptFile = Join-Path $repo 'scripts\daily-collect-prompt.txt'
$alerts     = 'C:\Users\kanedomi\Desktop\Claude\bridge\knowledge\job-alerts.md'
Set-Location $repo
# Long-lived token for unattended jobs (claude setup-token). Kept outside repos; set for this job process only.
$tokenFile = Join-Path $env:USERPROFILE '.claude-jobs\oauth-token.txt'
if (Test-Path $tokenFile) { $env:CLAUDE_CODE_OAUTH_TOKEN = (Get-Content $tokenFile -Raw).Trim() }

function Log($msg) { "$(Get-Date -Format 'HH:mm:ss') $msg" | Out-File -FilePath $log -Append -Encoding utf8 }
function Alert($code, $reason) {
  # append one line, UTF-8 without BOM (the file is BOM-less); add a newline first if the file lacks one
  try {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $line = "- $(Get-Date -Format 'yyyy-MM-dd HH:mm') | AIRadarDaily | exit=$code | $reason"
    $text = [System.IO.File]::ReadAllText($alerts, $utf8)
    if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $line = "`n" + $line }
    [System.IO.File]::AppendAllText($alerts, $line + "`n", $utf8)
  } catch { Log "alert append failed: $($_.Exception.Message)" }
}
function Invoke-Claude($text) {
  # EAP=Continue only around claude: under Stop, PS 5.1 turns any stderr line (e.g. the 11/05
  # "this sign-in ends ..." warning) into a terminating error and the job died after START.
  $ErrorActionPreference = 'Continue'
  $out = $text | & claude -p --model opus --permission-mode acceptEdits `
    --allowedTools 'WebSearch' 'WebFetch' 'Read' 'Write' 'Edit' 'Bash(node:*)' 'Bash(git:*)' 'Bash(curl:*)' `
    --output-format text 2>&1 | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($null -eq $code) { $code = -1 }
  $out | Out-File -FilePath $log -Append -Encoding utf8
  Log "claude exit=$code"
  return @{ code = $code; out = $out }
}
function Test-TodayIssue($day) {
  # validate.mjs guarantees meta.currentIssue == date of the newest issue
  $json = Get-Content -Raw -Encoding UTF8 (Join-Path $repo 'data\issues.json')
  return ($json -match ('"currentIssue"\s*:\s*"' + $day + '"'))
}

# 2026-10-15: the prompt goes in via stdin. PS 5.1 splits a native argument at a space inside
#   embedded double quotes, which silently cut the prompt mid-instruction (ai-radar 10/12, weekend 10/02).
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') START ====" | Out-File -FilePath $log -Append -Encoding utf8
$exitCode = 9
$reason   = 'launcher stopped before claude ran'
try {
  # scripts/out is gitignored scratch: drop entries older than 30 days
  Get-ChildItem (Join-Path $repo 'scripts\out') | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  # 2026-10-19/20: the model misjudged today's date. Fix it here (JST) and hand it over in the prompt.
  $jst    = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Tokyo Standard Time')
  $today  = $jst.ToString('yyyy-MM-dd')
  $dow    = $jst.ToString('dddd', [System.Globalization.CultureInfo]'ja-JP')
  $prompt = (Get-Content -Raw -Encoding UTF8 $promptFile).Replace('{{TODAY}}', $today).Replace('{{DOW}}', $dow)
  Log "today=$today (JST)"

  for ($attempt = 1; $attempt -le 2; $attempt++) {
    $r = Invoke-Claude $prompt
    if ($r.out -match 'Failed to authenticate|OAuth session expired|not logged in|Please run /login') {
      $exitCode = 2; $reason = 'claude auth failure (run claude setup-token / re-login)'; break
    } elseif ($r.code -ne 0) {
      $exitCode = 3; $reason = "claude exited $($r.code) (attempt $attempt)"
    } elseif (-not (Test-TodayIssue $today)) {
      $exitCode = 4; $reason = "no issue for $today in data/issues.json (attempt $attempt)"
    } else {
      $exitCode = 0; break
    }
    if ($attempt -eq 1) { Log "FAILED: $reason -> retry in 10 min"; Start-Sleep -Seconds 600 }
  }
} catch {
  $exitCode = 9; $reason = "launcher error: $($_.Exception.Message -replace '\s+', ' ')"
  Log $reason
} finally {
  if ($exitCode -ne 0) { Log "FAILED: $reason"; Alert $exitCode $reason }
  "==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') END (exit=$exitCode) ====" | Out-File -FilePath $log -Append -Encoding utf8
}
exit $exitCode
