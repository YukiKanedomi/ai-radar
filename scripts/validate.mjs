#!/usr/bin/env node
// data/ の整合性検証。JSON構文だけでなく「アプリが落ちない形か」を見る。
// 背景: 自動配信が meta.currentIssue に号番号(数値)を書き続け、今日/振り返るタブが落ちていた（2026-09-12 発覚）。
// 使い方: node scripts/validate.mjs  → 問題があれば一覧を出して exit 1
import { readFileSync } from "node:fs";

const GENRES = ["Claude Code・エージェント技法", "自動化パイプライン", "画像・動画生成", "AI×ハードウェア・3Dプリント",
  "AI×家庭・生活", "ゲーム・創作・個人開発", "AI×仕事の現場", "新ツール・新サービス"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m); // 過去号どうしの重複は警告どまり（既に公開済み。新号が過去と重複したらエラー）

// 深掘りの絵（deep[].art）の検査は、画面側（art.js）と同じ関数を使う（食い違いを作らない）
const artProblem = new Function(readFileSync("art.js", "utf8").split("/*ART-CHECK-BEGIN*/")[1].split("/*ART-CHECK-END*/")[0] + "; return artProblem;")();

const d = JSON.parse(readFileSync("data/issues.json", "utf8"));
const issues = d.issues || [];
if (!issues.length) err("issues が空");
if (typeof d.meta?.currentIssue !== "string" || !DATE.test(d.meta.currentIssue)) err(`meta.currentIssue は日付文字列 YYYY-MM-DD にする（今: ${JSON.stringify(d.meta?.currentIssue)}）`);
else if (d.meta.currentIssue !== issues[0]?.date) err(`meta.currentIssue (${d.meta.currentIssue}) が先頭の号 (${issues[0]?.date}) と一致しない`);

function markProblem(text) {
  if (!text) return null;
  for (const line of String(text).split(/\n+/)) {
    const head = line.startsWith("## ");
    if (!head && line.includes("## ")) return "「## 」は行頭にだけ書く（前に改行を入れる）";
    if (head && /\*\*|==/.test(line)) return "小見出しの中で ** や == は使えない";
    for (const m of ["**", "=="]) if ((line.split(m).length - 1) % 2) return `${m} が同じ段落の中で閉じていない`;
  }
  return null;
}

const seenUrl = new Map(), seenVid = new Map();
issues.forEach((i, idx) => {
  const tag = `第${i.no}号 ${i.date}`;
  if (!DATE.test(i.date || "")) err(`${tag}: date 形式`);
  if (typeof i.no !== "number") err(`${tag}: no が数値でない`);
  if (idx > 0 && issues[idx - 1].no !== i.no + 1) err(`${tag}: no が連番でない（前の号は ${issues[idx - 1].no}）`);
  if (!i.headline) err(`${tag}: headline が空`);
  for (const [kind, arr, textKey] of [["deep", i.deep || [], "summary"], ["log", i.log || [], "note"], ["videos", i.videos || [], "summary"]]) {
    const ids = new Set();
    for (const it of arr) {
      const t = `${tag} ${kind}/${it.id}`;
      if (!it.id) err(`${t}: id 無し`);
      if (ids.has(it.id)) err(`${t}: id 重複`); ids.add(it.id);
      if (!it.url) err(`${t}: url 無し`);
      if (!GENRES.includes(it.genre)) err(`${t}: genre「${it.genre}」は固定8種にない`);
      if (!(it[textKey] || it.note)) err(`${t}: ${textKey} が空`);
      // 本文の印（2026-11-23 の号から。画面もそれより前の号は印を解釈しない）: ** と == は対で閉じる。小見出しは行頭の「## 」だけ
      for (const f of ["summary", "note", "why", "apply"]) {
        const p = i.date >= "2026-11-23" && markProblem(it[f]); if (p) (idx === 0 ? err : warn)(`${t}: ${f} の印 — ${p}`);
      }
      if (kind === "deep" && idx === 0 && it.why && !it.whyHead) err(`${t}: whyHead（編集部の読みの小見出し）が無い`);
      for (const f of ["titleJa", "basis", "whyHead"]) if (/\*\*|==|^## /m.test(it[f] || "")) (idx === 0 ? err : warn)(`${t}: ${f} に本文の印（** == ##）は使えない`);
      if (it.wild !== undefined && (kind !== "log" || it.wild !== true)) err(`${t}: wild（圏外枠）は受信ログに true でだけ付ける`);
      if (it.art !== undefined) {
        if (kind !== "deep") err(`${t}: art は深掘りにだけ付ける`);
        else { const p = artProblem(it.art); if (p) err(`${t}: art（絵）が使えない — ${p}。直せなければ art を消す（ジャンルの図で代用される）`); }
      } else if (kind === "deep" && idx === 0) warn(`${t}: art（絵）が無い。ジャンルの図で代用される`);
      if (kind === "videos") {
        if (!it.videoId) err(`${t}: videoId 無し`);
        else { if (seenVid.has(it.videoId)) (idx === 0 ? err : warn)(`${t}: videoId が ${seenVid.get(it.videoId)} と重複`); seenVid.set(it.videoId, tag); }
      } else if (it.url) {
        const key = it.url.replace(/[?#].*$/, "").replace(/\/$/, "");
        if (seenUrl.has(key)) (idx === 0 ? err : warn)(`${t}: url が ${seenUrl.get(key)} と重複`); seenUrl.set(key, tag);
      }
    }
  }
});

// 話題の再掲チェック（警告のみ）: 最新号の各記事の titleJa を直近30号と文字2-gramのJaccardで比べる。
// 背景: URL照合だけでは同じ話題の別記事が素通りした（スマートTV広告除去 92号と103号、2026-11 点検）。
// 0.35 は既存106号で較正（完全再掲・同題の言い換えは拾い、「Claude Code」共通程度では鳴らない）。言い換えまでは拾えない。
const norm = (s) => (s || "").normalize("NFKC").toLowerCase().replace(/[\s、。，．・「」『』（）()！？!?,.:：…\-—〜~"]/g, "");
const bigrams = (s) => { const t = norm(s), b = new Set(); for (let k = 0; k < t.length - 1; k++) b.add(t.slice(k, k + 2)); return b; };
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
const items = (i) => [...(i.deep || []), ...(i.log || []), ...(i.videos || [])];
if (issues.length > 1) {
  const past = issues.slice(1, 31).flatMap((p) => items(p).map((x) => ({ tag: `第${p.no}号 ${x.id}`, t: x.titleJa || x.title, b: bigrams(x.titleJa || x.title) })));
  for (const it of items(issues[0])) {
    const b = bigrams(it.titleJa || it.title);
    for (const p of past) { const s = jaccard(b, p.b); if (s >= 0.35) warn(`第${issues[0].no}号 ${it.id}: ${p.tag} と話題が近い（類似${s.toFixed(2)}）「${p.t}」`); }
  }
}

// 週の読み物: picks が実在の号・記事を指すか
try {
  const w = JSON.parse(readFileSync("data/weekly.json", "utf8"));
  for (const [wi, wk] of (w.weeks || []).entries()) {
    const tag = `weekly ${wk.from}〜${wk.to}`;
    for (const f of ["title", "trend"]) if (/\*\*|==|^## /m.test(wk[f] || "")) err(`${tag}: ${f} に本文の印は使えない`);
    if (!DATE.test(wk.to || "") || !DATE.test(wk.from || "")) err(`${tag}: from/to 形式`);
    if (!wk.trend) err(`${tag}: trend が空`);
    for (const p of wk.picks || []) {
      const issue = issues.find((i) => i.date === p.date);
      const hit = issue && [...issue.deep, ...issue.log, ...(issue.videos || [])].find((x) => x.id === p.id);
      if (!hit) err(`${tag}: pick ${p.date}/${p.id} が号に存在しない`);
      // 題が指す先の記事と違う（2026-11-22 の週: 11/20 の記事の理由文に 11/19 の記事の題と日付が付いていた）
      else if (p.title !== (hit.titleJa || hit.title)) (wi === 0 ? err : warn)(`${tag}: pick ${p.date}/${p.id} の title が号の記事の題と違う。理由文がどの記事の話かを確かめ、date・id・title を合わせる`);
    }
  }
} catch (e) { err(`weekly.json: ${e.message}`); }

for (const w of warns) console.error(" (警告) " + w);
if (errors.length) { console.error(`NG ${errors.length}件`); for (const e of errors) console.error(" - " + e); process.exit(1); }
console.log(`OK: ${issues.length}号・記事${issues.reduce((n, i) => n + i.deep.length + i.log.length, 0)}本・映像${seenVid.size}本、meta.currentIssue=${d.meta.currentIssue}`);
