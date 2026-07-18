// AI活用レーダー — リキッド・モザイク v2（ビルド不要・依存なし）
// IA: 今日 / 探す（アーカイブ・検索・映像） / 振り返る（週・月） / 試してみた
// URL: ?view=issue&date=YYYY-MM-DD&item=d1 のように日付＋安定IDで状態を表す
let DATA = null, TRIALS = null;

const $ = (s) => document.querySelector(s);
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PLAY = `<svg class="pl" viewBox="0 0 30 22" aria-hidden="true"><rect width="30" height="22" rx="5" fill="#22242A" opacity=".88"/><path d="M12 6 L21 11 L12 16 Z" fill="#F2F1EC"/></svg>`;
const DEEP_C = ["c0", "c1", "c2"]; // 面の識別色（編集的な意味は無し・3本は同格）
const fmtViews = (n) => n == null ? "" : `視聴 ${Number(n).toLocaleString("ja-JP")}`;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ══ 状態とルーター ══ */
const VIEWS = ["today", "explore", "review", "trials", "issue"];
let state = { view: "today", date: null, item: null, period: null, q: "", vf: "issues" };

function parseState() {
  const p = new URLSearchParams(location.search);
  let view = p.get("view") || "today";
  // 旧URL互換
  if (view === "latest") view = "today";
  if (view === "archive") view = "explore";
  if (view === "videos") { view = "explore"; state.vf = "video"; }
  if (!VIEWS.includes(view)) view = "today";
  state = {
    view,
    date: p.get("date"),
    item: p.get("item"),
    period: p.get("period"),
    q: p.get("q") || "",
    vf: p.get("vf") || (view === "explore" ? state.vf || "issues" : "issues"),
  };
}
function buildQuery(s) {
  const p = new URLSearchParams();
  if (s.view !== "today") p.set("view", s.view);
  if (s.date && (s.view === "issue" || s.item)) p.set("date", s.date);
  if (s.item) p.set("item", s.item);
  if (s.period && s.view === "review") p.set("period", s.period);
  if (s.q && s.view === "explore") p.set("q", s.q);
  if (s.vf && s.vf !== "issues" && s.view === "explore") p.set("vf", s.vf);
  const q = p.toString();
  return q ? "?" + q : location.pathname.replace(/\?.*/, "");
}
function navigate(patch, { push = true } = {}) {
  state = { ...state, ...patch };
  const url = buildQuery(state);
  const hist = { hasItem: !!state.item };
  if (push) history.pushState(hist, "", url); else history.replaceState(hist, "", url);
  render();
}
addEventListener("popstate", () => { parseState(); render(); });

/* ══ 起動 ══ */
async function boot() {
  try {
    DATA = await (await fetch("data/issues.json")).json();
    try { TRIALS = await (await fetch("data/trials.json")).json(); } catch { TRIALS = { trials: [] }; }
    parseState();
    history.replaceState({ hasItem: !!state.item }, "", buildQuery(state));
    render();
  } catch (e) {
    $("#main").innerHTML = `<div class="tile t-state">
      <p>受信に失敗しました。通信状態を確認してください。</p>
      <button onclick="location.reload()">再試行</button>
    </div>`;
  }
}

const issueByDate = (d) => DATA.issues.find((i) => i.date === d);
const currentIssue = () => issueByDate(DATA.meta.currentIssue);

function findItem(date, id) {
  const issue = issueByDate(date);
  if (!issue) return null;
  let item = issue.deep.find((x) => x.id === id);
  if (item) return { issue, item, type: "deep", color: DEEP_C[issue.deep.indexOf(item) % 3] };
  item = issue.log.find((x) => x.id === id);
  if (item) return { issue, item, type: "log", color: "cl" };
  item = (issue.videos || []).find((x) => x.id === id);
  if (item) return { issue, item, type: "video", color: "cv" };
  return null;
}

/* ══ 描画 ══ */
function render() {
  document.querySelectorAll(".app-nav button").forEach((b) => {
    const v = b.dataset.nav;
    const on = state.view === v || (state.view === "issue" && (state.date === DATA.meta.currentIssue ? v === "today" : v === "explore"));
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const m = $("#main");
  if (state.view === "today") {
    const issue = currentIssue();
    setHeadSub(`No.${issue.no} — ${esc(issue.date)}<br><b>深掘り${issue.deep.length} · 短信${issue.log.length} · 映像${(issue.videos || []).length}</b>`);
    m.innerHTML = issueMosaic(issue);
  } else if (state.view === "issue") {
    const issue = issueByDate(state.date) || currentIssue();
    setHeadSub(`No.${issue.no} — ${esc(issue.date)}`);
    m.innerHTML = `<div class="tile t-back"><button onclick="navTo('explore')">← 探すへ戻る</button></div>` + issueMosaic(issue);
  } else if (state.view === "explore") {
    const total = DATA.issues.reduce((n, i) => n + i.deep.length + i.log.length + (i.videos || []).length, 0);
    setHeadSub(`全${DATA.issues.length}号 · <b>${total}本を収蔵</b>`);
    m.innerHTML = exploreView();
    const inp = $("#search-in");
    if (inp) {
      inp.addEventListener("input", () => {
        state.q = inp.value.trim();
        history.replaceState({ hasItem: false }, "", buildQuery(state));
        $("#explore-body").innerHTML = exploreBody();
      });
      if (state.q) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  } else if (state.view === "review") {
    m.innerHTML = reviewView();
  } else {
    setHeadSub(`週1の検証枠`);
    m.innerHTML = trialsView();
  }
  syncSheet();
}
function setHeadSub(html) { $("#head-sub").innerHTML = html; }
window.navTo = (v) => navigate({ view: v, item: null, q: "", date: null });
document.querySelectorAll(".app-nav button").forEach((b) => {
  b.onclick = () => navigate({ view: b.dataset.nav, item: null, date: null, q: "" });
});

/* ── 号のモザイク ── */
function issueMosaic(issue) {
  let h = `<div class="tile t-intro"><div class="hl">${esc(issue.headline)}</div><div class="in clamp2">${esc(issue.intro)}</div></div>`;
  issue.deep.forEach((d, i) => {
    h += `<button class="tile t-deep ${DEEP_C[i % 3]}" data-item="${esc(d.id)}" onclick="openItem('${esc(issue.date)}','${esc(d.id)}',this)">
      <span class="tag">深掘り · ${esc(d.genre)} · ${esc(d.source)}</span>
      <h2 class="clamp3">${esc(d.titleJa || d.title)}</h2>
      <span class="foot">タップで拡大 →</span>
    </button>`;
  });
  issue.log.forEach((l) => {
    h += `<button class="tile t-log" data-item="${esc(l.id)}" onclick="openItem('${esc(issue.date)}','${esc(l.id)}',this)">
      <span class="tag">${esc(l.genre)} · ${esc(l.source)}</span>
      <h3 class="clamp3">${esc(l.titleJa || l.title)}</h3>
    </button>`;
  });
  const vids = issue.videos || [];
  if (vids.length) {
    h += `<div class="tile t-sec"><span class="s">映像</span><span class="r"></span><span class="n">字幕全文を読んで要約</span></div>`;
    vids.forEach((v) => {
      h += `<button class="tile t-video" data-item="${esc(v.id)}" onclick="openItem('${esc(issue.date)}','${esc(v.id)}',this)">
        <span class="vthumb"><img src="https://i.ytimg.com/vi/${esc(v.videoId)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">${PLAY}</span>
        <h3 class="clamp2">${esc(v.titleJa || v.title)}</h3>
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
window.openItem = (date, id, el) => {
  pendingOrigin = el || null;
  navigate({ item: id, date });
};

/* ── 探す ── */
function exploreView() {
  return `<div class="tile t-search">
      <input id="search-in" type="search" placeholder="全号を検索（タイトル・要約・適用…）" value="${esc(state.q)}" aria-label="アーカイブ検索">
    </div>
    <div class="tile chips" role="group" aria-label="表示切替">
      <button aria-pressed="${state.vf !== "video"}" onclick="setVf('issues')">号一覧</button>
      <button aria-pressed="${state.vf === "video"}" onclick="setVf('video')">映像</button>
    </div>
    <div id="explore-body" style="display:contents">${exploreBody()}</div>`;
}
window.setVf = (vf) => navigate({ vf, q: "" }, { push: false });

function exploreBody() {
  if (state.q) return searchResults(state.q);
  if (state.vf === "video") return allVideos();
  // 月→号の段階アーカイブ
  let h = "", lastMonth = "";
  for (const i of DATA.issues) {
    const month = i.date.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      h += `<div class="tile t-month"><span class="s">${esc(periodLabel(month))}</span><span class="r"></span></div>`;
    }
    h += `<button class="tile t-issue-row" onclick="navigate({view:'issue',date:'${esc(i.date)}',item:null})">
      <span class="no">第${i.no}号 · ${esc(i.date)}</span>
      <h3 class="clamp2">${esc(i.headline)}</h3>
      <span class="cnt">深掘り${i.deep.length} · 短信${i.log.length} · 映像${(i.videos || []).length}</span>
    </button>`;
  }
  return h || `<div class="tile t-empty">まだ号がありません。</div>`;
}
window.navigate = navigate;

function allVideos() {
  const all = [];
  for (const issue of DATA.issues) for (const v of (issue.videos || [])) all.push({ ...v, date: issue.date, no: issue.no });
  all.sort((a, b) => b.date.localeCompare(a.date) || (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  if (!all.length) return `<div class="tile t-empty">まだ映像の受信はありません。</div>`;
  let h = "", lastDate = "";
  for (const v of all) {
    if (v.date !== lastDate) {
      lastDate = v.date;
      h += `<div class="tile t-sec"><span class="s">第${v.no}号</span><span class="r"></span><span class="n">${esc(v.date)}</span></div>`;
    }
    h += `<button class="tile t-vroom" data-item="${esc(v.id)}" onclick="openItem('${esc(v.date)}','${esc(v.id)}',this)">
      <span class="vthumb"><img src="https://i.ytimg.com/vi/${esc(v.videoId)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">${PLAY}</span>
      <span class="vbody">
        <h3 class="clamp2">${esc(v.titleJa || v.title)}</h3>
        <span class="vm">${esc(v.channel)} · ${fmtViews(v.views)} · ${esc(v.publishedAt || "")}</span>
        <span class="note">${esc(v.summary || v.note || "")}</span>
      </span>
    </button>`;
  }
  return h;
}

function searchAll(q) {
  const needle = q.toLowerCase();
  const hit = (...fields) => fields.some((f) => (f || "").toLowerCase().includes(needle));
  const out = [];
  for (const issue of DATA.issues) {
    for (const d of issue.deep) if (hit(d.title, d.titleJa, d.summary, d.why, d.apply, d.genre, d.source))
      out.push({ kind: "深掘り", date: issue.date, id: d.id, title: d.titleJa || d.title, sub: d.genre + " · " + d.source });
    for (const l of issue.log) if (hit(l.title, l.titleJa, l.note, l.apply, l.genre, l.source))
      out.push({ kind: "短信", date: issue.date, id: l.id, title: l.titleJa || l.title, sub: l.genre + " · " + l.source });
    for (const v of (issue.videos || [])) if (hit(v.title, v.titleJa, v.summary, v.note, v.apply, v.genre, v.channel))
      out.push({ kind: "映像", date: issue.date, id: v.id, title: v.titleJa || v.title, sub: v.channel });
  }
  for (const t of (TRIALS.trials || [])) if (hit(t.title, t.report, t.proposal))
    out.push({ kind: "試した", date: t.date, id: null, title: t.title, sub: t.verdict || "" });
  return out;
}
function searchResults(q) {
  const rs = searchAll(q);
  if (!rs.length) return `<div class="tile t-empty">「${esc(q)}」に一致する受信はありません。</div>`;
  return rs.map((r) => {
    const go = r.id
      ? `openItemFromSearch('${esc(r.date)}','${esc(r.id)}',this)`
      : `navigate({view:'trials',item:null,q:''})`;
    return `<button class="tile t-result" onclick="${go}">
      <span class="meta"><span class="kind">${r.kind}</span>${esc(r.date)}${r.sub ? " · " + esc(r.sub) : ""}</span>
      <h3 class="clamp2">${esc(r.title)}</h3>
    </button>`;
  }).join("");
}
window.openItemFromSearch = (date, id, el) => {
  pendingOrigin = el || null;
  navigate({ view: "issue", date, item: id });
};

/* ── 振り返る ── */
function isoWeekStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // 木曜へ
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}
function periodOf(dateStr, mode) { return mode === "week" ? isoWeekStr(dateStr) : dateStr.slice(0, 7); }
function periodLabel(p) {
  if (/W/.test(p)) { const [y, w] = p.split("-W"); return `${y}年 第${Number(w)}週`; }
  const [y, mo] = p.split("-"); return `${y}年${Number(mo)}月`;
}
function reviewView() {
  const mode = state.period && /W/.test(state.period) ? "week" : "month";
  const periods = [...new Set(DATA.issues.map((i) => periodOf(i.date, mode)))].sort().reverse();
  const cur = periods.includes(state.period) ? state.period : periods[0];
  const idx = periods.indexOf(cur);
  setHeadSub(`${esc(periodLabel(cur))}<br><b>${mode === "week" ? "週" : "月"}の振り返り</b>`);

  const issues = DATA.issues.filter((i) => periodOf(i.date, mode) === cur);
  const items = issues.flatMap((i) => [...i.deep, ...i.log]);
  const vids = issues.flatMap((i) => i.videos || []);
  const genres = {};
  for (const it of items) genres[it.genre] = (genres[it.genre] || 0) + 1;
  const sources = {};
  for (const it of items) { const s = (it.source || "").split(" ")[0]; sources[s] = (sources[s] || 0) + 1; }
  const trials = (TRIALS.trials || []).filter((t) => periodOf(t.date, mode) === cur);

  let h = `<div class="tile chips" role="group" aria-label="期間の単位">
      <button aria-pressed="${mode === "week"}" onclick="navigate({period:'${esc(periodOf(DATA.meta.currentIssue, "week"))}'},{push:false})">週</button>
      <button aria-pressed="${mode === "month"}" onclick="navigate({period:'${esc(periodOf(DATA.meta.currentIssue, "month"))}'},{push:false})">月</button>
    </div>
    <div class="tile period-nav">
      <button class="pn" ${idx >= periods.length - 1 ? "disabled" : ""} onclick="navigate({period:'${esc(periods[idx + 1] || cur)}'},{push:false})" aria-label="前の期間">←</button>
      <span class="label">${esc(periodLabel(cur))}</span>
      <button class="pn" ${idx <= 0 ? "disabled" : ""} onclick="navigate({period:'${esc(periods[idx - 1] || cur)}'},{push:false})" aria-label="次の期間">→</button>
    </div>
    <div class="tile t-stat"><span class="num">${issues.length}</span><span class="lb">発行号</span><span class="foot">記事${items.length} · 映像${vids.length}</span></div>
    <div class="tile t-stat"><span class="num">${trials.length}</span><span class="lb">試してみた</span><span class="foot">${trials.length ? "" : "この期間は未実施"}</span></div>`;

  const genreRows = Object.entries(genres).sort((a, b) => b[1] - a[1]);
  h += `<div class="tile t-list rows6"><span class="tag">ジャンルの電波（実受信数）</span><ul>` +
    (genreRows.map(([g, n]) => `<li><b>${esc(g)}</b><span class="n">${n}本</span></li>`).join("") || "<li>受信なし</li>") +
    `</ul></div>`;
  h += `<div class="tile t-list rows4"><span class="tag">源の内訳</span><ul>` +
    (Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<li><b>${esc(s)}</b><span class="n">${n}本</span></li>`).join("") || "<li>受信なし</li>") +
    `</ul></div>`;

  h += `<div class="tile t-sec"><span class="s">この期間の号</span><span class="r"></span></div>`;
  for (const i of issues) {
    h += `<button class="tile t-issue-row" onclick="navigate({view:'issue',date:'${esc(i.date)}',item:null})">
      <span class="no">第${i.no}号 · ${esc(i.date)}</span>
      <h3 class="clamp2">${esc(i.headline)}</h3>
    </button>`;
  }
  if (trials.length) {
    h += `<div class="tile t-sec"><span class="s">この期間の検証</span><span class="r"></span></div>` +
      trials.map((t) => trialTile(t)).join("");
  }
  return h;
}

/* ── 試してみた ── */
function trialTile(t) {
  return `<div class="tile t-trial">
    <span class="tag"><span class="verdict ${t.verdict === "当たり" ? "hit" : "miss"}">${esc(t.verdict)}</span> · ${esc(t.date)}</span>
    <h3>${esc(t.title)}</h3>
    <p style="font-size:var(--fs-sub);margin:8px 0 0;">${esc(t.report)}</p>
    ${t.proposal ? `<p style="font-size:var(--fs-sub);margin:8px 0 0;"><b>提案:</b> ${esc(t.proposal)}</p>` : ""}
  </div>`;
}
function trialsView() {
  if (!TRIALS.trials.length) {
    return `<div class="tile t-empty">「試してみた」第1回は準備中です。<br>気になったネタをチャットで伝えると検証候補になります。</div>`;
  }
  return TRIALS.trials.map((t) => trialTile(t)).join("");
}

/* ══ 記事シート（URL駆動・dialog・液体モーションV2） ══ */
let pendingOrigin = null;   // タップされたタイル（開くアニメの起点）
let openedKey = null;       // "date/id"
let originEl = null;        // 開いた時の起点タイル
let returnFocusEl = null;

function sheetHtml(found) {
  const { issue, item, type, color } = found;
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
  return `<div class="sheet-inner">
    <div class="sheet-head ${color}">
      <div class="hwrap">
        <div><span class="tag">${tagLine}</span><h2>${esc(item.titleJa || item.title)}</h2></div>
        <button class="close" onclick="requestCloseSheet()" aria-label="閉じる">×</button>
      </div>
    </div>
    <div class="sheet-body"><div class="bwrap">${body}</div></div>
  </div>`;
}

function syncSheet() {
  const key = state.item && state.date ? `${state.date}/${state.item}` : null;
  if (key && key !== openedKey) {
    const found = findItem(state.date, state.item);
    if (!found) { openedKey = null; hideOverlayNow(); return; }
    showSheet(found, key);
  } else if (!key && openedKey) {
    animateClose();
  } else if (key && openedKey === key) {
    // 再描画後もタイル参照を更新（閉じアニメの戻り先）
    originEl = document.querySelector(`[data-item="${CSS.escape(state.item)}"]`) || originEl;
  }
}

function showSheet(found, key) {
  const ov = $("#overlay"), sh = $("#sheet");
  openedKey = key;
  originEl = pendingOrigin || document.querySelector(`[data-item="${CSS.escape(found.item.id)}"]`);
  returnFocusEl = pendingOrigin || null;
  pendingOrigin = null;
  sh.setAttribute("aria-label", found.item.titleJa || found.item.title || "記事");
  sh.innerHTML = sheetHtml(found);
  ov.hidden = false;
  document.body.style.overflow = "hidden";

  const finish = () => {
    sh.classList.add("content-in");
    sh.querySelector(".close")?.focus({ preventScroll: true });
  };
  if (originEl && !reduceMotion()) {
    const r = originEl.getBoundingClientRect();
    sh.classList.remove("anim", "anim-close", "content-in");
    sh.style.transform = `translate(${r.left}px,${r.top}px) scale(${r.width / innerWidth},${r.height / innerHeight})`;
    sh.style.borderRadius = "48px";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ov.classList.add("show");
      sh.classList.add("anim");
      sh.style.transform = "none";
      sh.style.borderRadius = "0";
      setTimeout(finish, 330);
    }));
  } else {
    sh.classList.remove("anim", "anim-close");
    sh.style.transform = "none"; sh.style.borderRadius = "0";
    ov.classList.add("show");
    finish();
  }
}

function animateClose() {
  const ov = $("#overlay"), sh = $("#sheet");
  if (ov.hidden) { openedKey = null; return; }
  openedKey = null;
  const el = originEl && document.contains(originEl) ? originEl : null;
  sh.classList.remove("content-in"); // 本文を先にフェードアウト
  const after = () => { hideOverlayNow(); returnFocusEl?.focus?.({ preventScroll: true }); };
  if (el && !reduceMotion()) {
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      sh.classList.remove("anim"); sh.classList.add("anim-close");
      sh.style.transform = `translate(${r.left}px,${r.top}px) scale(${r.width / innerWidth},${r.height / innerHeight})`;
      sh.style.borderRadius = "48px";
      ov.classList.remove("show");
      setTimeout(after, 250);
    }, 140);
  } else {
    ov.classList.remove("show");
    setTimeout(after, reduceMotion() ? 0 : 170);
  }
}
function hideOverlayNow() {
  const ov = $("#overlay"), sh = $("#sheet");
  ov.hidden = true; ov.classList.remove("show");
  sh.classList.remove("anim", "anim-close", "content-in");
  sh.style.transform = ""; sh.style.borderRadius = "";
  document.body.style.overflow = "";
}
window.requestCloseSheet = () => {
  if (history.state && history.state.hasItem) history.back();
  else navigate({ item: null }, { push: false });
};
$("#scrim").onclick = () => requestCloseSheet();
addEventListener("keydown", (e) => {
  if ($("#overlay").hidden) return;
  if (e.key === "Escape") { e.preventDefault(); requestCloseSheet(); }
  if (e.key === "Tab") { // 簡易フォーカストラップ
    const f = [...$("#sheet").querySelectorAll("button, a[href]")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

boot();
