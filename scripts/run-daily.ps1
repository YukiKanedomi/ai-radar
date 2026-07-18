# AI Katsuyo Radar - daily morning issue launcher (headless, subscription auth)
# Invoked daily 07:15 by Windows Task Scheduler (task: AIRadarDaily). Runs `claude -p`
# which collects candidates via scripts/collect.mjs, writes a new issue into
# data/issues.json and git pushes (GitHub Pages auto-deploys).
# Stop:  Unregister-ScheduledTask -TaskName 'AIRadarDaily' -Confirm:$false
# NOTE: keep THIS file ASCII-only (PS 5.1 misreads BOM-less UTF-8 with Japanese).
#       The Japanese prompt lives in daily-collect-prompt.txt, read back as UTF-8 below.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$repo       = 'C:\Users\kanedomi\Desktop\Claude\ai-radar'
$log        = Join-Path $repo 'scripts\run-daily.log'
$promptFile = Join-Path $repo 'scripts\daily-collect-prompt.txt'
Set-Location $repo

$prompt = Get-Content -Raw -Encoding UTF8 $promptFile

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') START ====" | Out-File -FilePath $log -Append -Encoding utf8
& claude -p $prompt --model sonnet --permission-mode acceptEdits `
  --allowedTools 'WebSearch' 'WebFetch' 'Read' 'Write' 'Edit' 'Bash(node:*)' 'Bash(git:*)' 'Bash(curl:*)' `
  --output-format text 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') END (exit=$LASTEXITCODE) ====" | Out-File -FilePath $log -Append -Encoding utf8
