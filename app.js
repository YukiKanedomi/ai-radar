// AI活用レーダー — フロント（ビルド不要・依存なし）
let DATA = null, TRIALS = null;
let currentIssue = null;
const FB_KEY = "airadar-feedback";
const fb = JSON.parse(localStorage.getItem(FB_KEY) || "{}"); // {"date/id": "good"|"bad"}

const $ = (s) => document.querySelector(s);
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function boot() {
  try {
    DATA = await (await fetch("data/issues.json?t=" + Date.now())).json();
    try { TRIALS = await (await fetch("data/trials.json?t=" + Date.now())).json(); } catch { TRIALS = { trials: [] }; }
    currentIssue = DATA.meta.currentIssue;
    showLatest();
  } catch (e) {
    $("#main").innerHTML = `<div class="empty">受信失敗。時間をおいて再読み込みしてください。</div>`;
  }
}

function issueByDate(d) { return DATA.issues.find((i) => i.date === d); }

function fbButtons(date, id) {
  const k = `${date}/${id}`;
  const v = fb[k] || "";
  return `<div class="fb">
    <button class="${v === "good" ? "good" : ""}" onclick="setFb('${k}','good')">感度良好</button>
    <button class="${v === "bad" ? "bad" : ""}" onclick="setFb('${k}','bad')">ノイズ</button>
  </div>`;
}

window.setFb = (k, v) => {
  fb[k] = fb[k] === v ? "" : v;
  localStorage.setItem(FB_KEY, JSON.stringify(fb));
  render();
  updateFbBar();
};

function updateFbBar() {
  const marked = Object.entries(fb).filter(([, v]) => v);
  $("#fbbar").classList.toggle("show", marked.length > 0);
}

function renderIssue(issue, withSelector) {
  let h = "";
  if (withSelector) {
    h += `<select class="issue-sel" onchange="pickIssue(this.value)">` +
      DATA.issues.map((i) => `<option value="${i.date}" ${i.date === issue.date ? "selected" : ""}>第${i.no}号 — ${i.date}</option>`).join("") +
      `</select>`;
  }
  h += `<div class="issue-head">
    <div class="issue-no">ISSUE No.${issue.no} — ${issue.date}</div>
    <div class="headline">${esc(issue.headline)}</div>
    <p class="intro">${esc(issue.intro)}</p>
  </div>`;

  h += `<div class="seclabel"><span class="t">強電波</span><span class="rule"></span><span class="n">DEEP ×${issue.deep.length}</span></div>`;
  for (const d of issue.deep) {
    h += `<article class="deep">
      <div class="meta-row"><span class="genre">${esc(d.genre)}</span><span class="src">${esc(d.source)}</span>${d.stat ? `<span class="stat">${esc(d.stat)}</span>` : ""}</div>
      <h3><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.titleJa || d.title)}</a></h3>
      ${d.titleJa ? `<p class="orig">${esc(d.title)}</p>` : ""}
      <p>${esc(d.summary)}</p>
      ${d.why ? `<span class="blocklabel">なぜ面白いか</span><p>${esc(d.why)}</p>` : ""}
      ${d.apply ? `<span class="blocklabel">うちへの適用（仮説）</span><div class="apply">${esc(d.apply)}</div>` : ""}
      ${fbButtons(issue.date, d.id)}
    </article>`;
  }

  h += `<div class="seclabel"><span class="t">受信ログ</span><span class="rule"></span><span class="n">LOG ×${issue.log.length}</span></div>`;
  for (const l of issue.log) {
    h += `<article class="log">
      <div class="meta-row"><span class="genre">${esc(l.genre)}</span><span class="src">${esc(l.source)}</span>${l.stat ? `<span class="stat">${esc(l.stat)}</span>` : ""}</div>
      <h4><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titleJa || l.title)}</a></h4>
      ${l.titleJa ? `<p class="orig">${esc(l.title)}</p>` : ""}
      <p class="note">${esc(l.note)}</p>
      ${l.apply ? `<p class="hitokoto"><b>▸</b> ${esc(l.apply)}</p>` : ""}
      ${fbButtons(issue.date, l.id)}
    </article>`;
  }

  if (issue.afterword) {
    h += `<div class="afterword">${esc(issue.afterword)}<div class="sig">— 受信担当より</div></div>`;
  }
  return h;
}

window.pickIssue = (d) => { currentIssue = d; render(); };

let view = "latest";
function showLatest() { view = "latest"; currentIssue = DATA.meta.currentIssue; render(); }
function showArchive() { view = "archive"; render(); }
function showTrials() { view = "trials"; render(); }

function render() {
  ["latest", "archive", "trials"].forEach((t) => $("#tab-" + t).classList.toggle("on",
    (view === t)));
  const m = $("#main");
  if (view === "latest") {
    m.innerHTML = renderIssue(issueByDate(DATA.meta.currentIssue), false);
  } else if (view === "archive") {
    m.innerHTML = DATA.issues.length > 1 || view === "archive"
      ? renderIssue(issueByDate(currentIssue) || issueByDate(DATA.meta.currentIssue), true)
      : `<div class="empty">まだ過去号はありません。</div>`;
  } else {
    if (!TRIALS.trials.length) {
      m.innerHTML = `<div class="empty">「試してみた」第1回は準備中です。<br>気になったネタに感度良好を付けると、検証候補になります。</div>`;
    } else {
      m.innerHTML = TRIALS.trials.map((t) => `<article class="trial">
        <div class="meta-row"><span class="verdict ${t.verdict === "当たり" ? "hit" : "miss"}">${esc(t.verdict)}</span><span class="src">${esc(t.date)}</span></div>
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.report)}</p>
        ${t.proposal ? `<div class="apply"><b>提案:</b> ${esc(t.proposal)}</div>` : ""}
      </article>`).join("");
    }
  }
  updateFbBar();
}

$("#tab-latest").onclick = showLatest;
$("#tab-archive").onclick = showArchive;
$("#tab-trials").onclick = showTrials;

$("#fbcopy").onclick = async () => {
  const lines = ["【AI活用レーダー フィードバック】"];
  for (const [k, v] of Object.entries(fb)) {
    if (!v) continue;
    const [date, id] = k.split("/");
    const issue = issueByDate(date);
    if (!issue) continue;
    const item = [...issue.deep, ...issue.log].find((i) => i.id === id);
    if (!item) continue;
    lines.push(`${v === "good" ? "◎感度良好" : "×ノイズ"}: ${item.titleJa || item.title}（${date}）`);
  }
  const text = lines.join("\n");
  const btn = $("#fbcopy");
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "✓ コピーしました — チャットに貼ってください";
  } catch {
    prompt("コピーしてください:", text);
  }
  setTimeout(() => { btn.textContent = "📡 フィードバックをコピー（チャットに貼って学習させる）"; }, 4000);
};

boot();
