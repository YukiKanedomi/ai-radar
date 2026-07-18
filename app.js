// AI活用レーダー — リキッド・モザイク（ビルド不要・依存なし）
// フィードバックはアプリ内ボタンではなくチャットで直接伝える運用（2026-07-18 ボタン撤去）
let DATA = null, TRIALS = null;
let view = "latest";          // latest | archive | videos | trials
let currentIssue = null;

const $ = (s) => document.querySelector(s);
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PLAY = `<svg class="pl" viewBox="0 0 30 22"><rect width="30" height="22" rx="5" fill="#22242A" opacity=".88"/><path d="M12 6 L21 11 L12 16 Z" fill="#F2F1EC"/></svg>`;
const DEEP_C = ["c0", "c1", "c2"];
const EDGE_C = ["#C2266B", "#1D9EBF", "#8FBF2F", "#2E3138"];
const fmtViews = (n) => n == null ? "" : `視聴 ${Number(n).toLocaleString("ja-JP")}`;

async function boot() {
  try {
    DATA = await (await fetch("data/issues.json?t=" + Date.now())).json();
    try { TRIALS = await (await fetch("data/trials.json?t=" + Date.now())).json(); } catch { TRIALS = { trials: [] }; }
    currentIssue = DATA.meta.currentIssue;
    const params = new URLSearchParams(location.search);
    const vp = params.get("view");
    if (["latest", "archive", "videos", "trials"].includes(vp)) view = vp;
    render();
    // QA用: ?open=deep:0 等でシートを直接開く
    const op = params.get("open");
    if (op) {
      const [t, ix] = op.split(":");
      const issue = issueByDate(DATA.meta.currentIssue);
      const item = t === "deep" ? issue.deep[+ix] : t === "log" ? issue.log[+ix] : (issue.videos || [])[+ix];
      if (item) openSheet(issue, item, t, t === "deep" ? DEEP_C[+ix % 3] : t === "log" ? "cl" : "cv", null);
    }
  } catch (e) {
    $("#main").innerHTML = `<div class="t-empty tile">受信失敗。時間をおいて再読み込みしてください。</div>`;
  }
}

const issueByDate = (d) => DATA.issues.find((i) => i.date === d);

/* ── ナビ ── */
function navTiles() {
  const t = (v, label) => `<button class="tile t-nav${view === v ? " on" : ""}" onclick="go('${v}')">${label}</button>`;
  return t("latest", "最新号") + t("archive", "過去号") + t("videos", "映像室") + t("trials", "試した");
}
window.go = (v) => { view = v; if (v === "latest") currentIssue = DATA.meta.currentIssue; render(); };

function headTile(sub) {
  return `<div class="tile t-head">
    <span class="name">AI活用レーダー<small>LIQUID MOSAIC</small></span>
    <span class="d">${sub}</span>
  </div>`;
}

/* ── 号のモザイク ── */
function issueMosaic(issue) {
  const vids = issue.videos || [];
  let h = headTile(`No.${issue.no} — ${esc(issue.date)}<br><b>深掘り${issue.deep.length} · 短信${issue.log.length} · 映像${vids.length}</b>`);
  h += navTiles();
  h += `<div class="tile t-intro"><div class="hl">${esc(issue.headline)}</div><div class="in">${esc(issue.intro)}</div></div>`;

  issue.deep.forEach((d, i) => {
    h += `<button class="tile t-deep ${DEEP_C[i % 3]}" onclick="openItem('deep',${i})">
      <span class="tag">深掘り · ${esc(d.genre)} · ${esc(d.source)}</span>
      <h2>${esc(d.titleJa || d.title)}</h2>
      <span class="foot">タップで拡大 →</span>
    </button>`;
  });

  issue.log.forEach((l, i) => {
    h += `<button class="tile t-log" onclick="openItem('log',${i})">
      <i class="edge" style="background:${EDGE_C[i % 4]}"></i>
      <span class="tag">${esc(l.genre)} · ${esc(l.source)}</span>
      <h3>${esc(l.titleJa || l.title)}</h3>
    </button>`;
  });

  if (vids.length) {
    h += `<div class="tile t-sec"><span class="s">映像</span><span class="r"></span><span class="n">チャンネルRSSから受信</span></div>`;
    vids.forEach((v, i) => {
      h += `<button class="tile t-video" onclick="openItem('video',${i})">
        <i class="edge"></i>
        <span class="vthumb"><img src="https://i.ytimg.com/vi/${esc(v.videoId)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">${PLAY}</span>
        <h3>${esc(v.titleJa || v.title)}</h3>
        <span class="vm">${esc(v.channel)} · ${fmtViews(v.views)}</span>
      </button>`;
    });
  }

  if (issue.afterword) {
    h += `<div class="tile t-after"><span class="tag">後記</span><p>${esc(issue.afterword)}</p></div>`;
  }
  h += `<div class="tile t-strip"><span class="s">面積＝深さ · 感想はチャットで伝えると選定眼が育つ</span></div>`;
  return h;
}

/* ── 映像室 ── */
function videosMosaic() {
  let h = headTile(`映像室<br><b>チャンネルRSSで毎朝受信</b>`);
  h += navTiles();
  const all = [];
  for (const issue of DATA.issues) for (const v of (issue.videos || [])) all.push({ ...v, date: issue.date, no: issue.no });
  all.sort((a, b) => b.date.localeCompare(a.date) || (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  if (!all.length) {
    h += `<div class="tile t-empty">まだ映像の受信はありません。</div>`;
    return h;
  }
  let lastDate = "";
  all.forEach((v) => {
    if (v.date !== lastDate) {
      lastDate = v.date;
      h += `<div class="tile t-sec"><span class="s">第${v.no}号</span><span class="r"></span><span class="n">${esc(v.date)}</span></div>`;
    }
    h += `<button class="tile t-vroom" onclick="openVideoFrom('${esc(v.date)}','${esc(v.id)}')">
      <span class="vthumb"><img src="https://i.ytimg.com/vi/${esc(v.videoId)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">${PLAY}</span>
      <span class="vbody">
        <h3>${esc(v.titleJa || v.title)}</h3>
        <span class="vm">${esc(v.channel)} · ${fmtViews(v.views)} · ${esc(v.publishedAt || "")}</span>
        <span class="note">${esc(v.summary || v.note || "")}</span>
      </span>
    </button>`;
  });
  return h;
}

/* ── 試してみた ── */
function trialsMosaic() {
  let h = headTile(`試してみた<br><b>週1の検証枠</b>`);
  h += navTiles();
  if (!TRIALS.trials.length) {
    h += `<div class="tile t-empty">「試してみた」第1回は準備中です。<br>気になったネタをチャットで伝えると検証候補になります。</div>`;
    return h;
  }
  for (const t of TRIALS.trials) {
    h += `<div class="tile t-trial">
      <span class="tag"><span class="verdict ${t.verdict === "当たり" ? "hit" : "miss"}">${esc(t.verdict)}</span> · ${esc(t.date)}</span>
      <h3>${esc(t.title)}</h3>
      <p style="font-size:12px;margin:6px 0 0;">${esc(t.report)}</p>
      ${t.proposal ? `<p style="font-size:12px;margin:6px 0 0;"><b>提案:</b> ${esc(t.proposal)}</p>` : ""}
    </div>`;
  }
  return h;
}

/* ── render ── */
function render() {
  const m = $("#main");
  if (view === "latest") {
    m.innerHTML = issueMosaic(issueByDate(DATA.meta.currentIssue));
  } else if (view === "archive") {
    const issue = issueByDate(currentIssue) || issueByDate(DATA.meta.currentIssue);
    let h = `<select class="issue-sel" onchange="pickIssue(this.value)">` +
      DATA.issues.map((i) => `<option value="${i.date}" ${i.date === issue.date ? "selected" : ""}>第${i.no}号 — ${i.date}「${esc(i.headline)}」</option>`).join("") +
      `</select>`;
    m.innerHTML = h + issueMosaic(issue);
  } else if (view === "videos") {
    m.innerHTML = videosMosaic();
  } else {
    m.innerHTML = trialsMosaic();
  }
}
window.pickIssue = (d) => { currentIssue = d; render(); };

/* ── オーバーレイ（液体拡大） ── */
let sheetCtx = null; // {date, id}
function viewIssue() { return view === "archive" ? (issueByDate(currentIssue) || issueByDate(DATA.meta.currentIssue)) : issueByDate(DATA.meta.currentIssue); }

window.openItem = (type, idx) => {
  const issue = viewIssue();
  const item = type === "deep" ? issue.deep[idx] : type === "log" ? issue.log[idx] : issue.videos[idx];
  const color = type === "deep" ? DEEP_C[idx % 3] : type === "log" ? "cl" : "cv";
  openSheet(issue, item, type, color, event.currentTarget);
};
window.openVideoFrom = (date, id) => {
  const issue = issueByDate(date);
  const item = (issue.videos || []).find((v) => v.id === id);
  if (item) openSheet(issue, item, "video", "cv", event.currentTarget);
};

function sheetHtml(issue, item, type, color) {
  const tagLine = type === "deep" ? `深掘り · ${esc(item.genre)} · ${esc(item.source)}`
    : type === "log" ? `短信 · ${esc(item.genre)} · ${esc(item.source)}`
    : `映像 · ${esc(item.genre)} · ${esc(item.channel)}`;
  let body = "";
  if (type === "video") {
    body += `<img class="bigthumb" src="https://i.ytimg.com/vi/${esc(item.videoId)}/hqdefault.jpg" alt="" onerror="this.remove()">
      <div class="vmeta">${esc(item.channel)} · ${fmtViews(item.views)}（収集時点） · 公開 ${esc(item.publishedAt || "")}</div>`;
    if (item.basis) body += `<div class="basis">${esc(item.basis)}</div>`;
  }
  if (item.titleJa && item.title) body += `<p class="orig">${esc(item.title)}</p>`;
  if (type === "deep") {
    body += `<p>${esc(item.summary)}</p>`;
    if (item.why) body += `<span class="lb">なぜ面白いか</span><p>${esc(item.why)}</p>`;
  } else if (type === "video") {
    body += `<span class="lb">要約（見なくても分かる版）</span><p>${esc(item.summary || item.note || "")}</p>`;
  } else {
    body += `<p>${esc(item.note)}</p>`;
  }
  if (item.apply) body += `<span class="lb">うちへの適用（仮説）</span><div class="apply ${color}">${esc(item.apply)}</div>`;
  body += `<a class="src-link" href="${esc(item.url)}" target="_blank" rel="noopener">${type === "video" ? "YouTubeで観る" : "元記事を読む"} ↗</a>`;
  return `<div class="sheet-head ${color}">
      <div class="row">
        <div><span class="tag">${tagLine}</span><h2>${esc(item.titleJa || item.title)}</h2></div>
        <button class="close" onclick="closeSheet()" aria-label="閉じる">×</button>
      </div>
    </div>
    <div class="sheet-body">${body}</div>`;
}

function openSheet(issue, item, type, color, tileEl) {
  sheetCtx = { issue, item, type, color };
  const ov = $("#overlay"), sh = $("#sheet");
  sh.innerHTML = sheetHtml(issue, item, type, color);
  ov.classList.add("show");
  // 液体拡大: タイル矩形 → 全画面
  if (tileEl && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const r = tileEl.getBoundingClientRect();
    const sx = r.width / innerWidth, sy = r.height / innerHeight;
    sh.classList.remove("anim");
    sh.style.transform = `translate(${r.left}px,${r.top}px) scale(${sx},${sy})`;
    sh.style.borderRadius = "40px";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sh.classList.add("anim");
      sh.style.transform = "none";
      sh.style.borderRadius = "0";
    }));
  } else {
    sh.style.transform = "none"; sh.style.borderRadius = "0";
  }
  document.body.style.overflow = "hidden";
}
window.closeSheet = () => {
  $("#overlay").classList.remove("show");
  document.body.style.overflow = "";
  sheetCtx = null;
};
boot();
