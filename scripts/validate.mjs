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

const d = JSON.parse(readFileSync("data/issues.json", "utf8"));
const issues = d.issues || [];
if (!issues.length) err("issues が空");
if (typeof d.meta?.currentIssue !== "string" || !DATE.test(d.meta.currentIssue)) err(`meta.currentIssue は日付文字列 YYYY-MM-DD にする（今: ${JSON.stringify(d.meta?.currentIssue)}）`);
else if (d.meta.currentIssue !== issues[0]?.date) err(`meta.currentIssue (${d.meta.currentIssue}) が先頭の号 (${issues[0]?.date}) と一致しない`);

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

// 週の読み物: picks が実在の号・記事を指すか
try {
  const w = JSON.parse(readFileSync("data/weekly.json", "utf8"));
  for (const wk of w.weeks || []) {
    const tag = `weekly ${wk.from}〜${wk.to}`;
    if (!DATE.test(wk.to || "") || !DATE.test(wk.from || "")) err(`${tag}: from/to 形式`);
    if (!wk.trend) err(`${tag}: trend が空`);
    for (const p of wk.picks || []) {
      const issue = issues.find((i) => i.date === p.date);
      const hit = issue && [...issue.deep, ...issue.log, ...(issue.videos || [])].some((x) => x.id === p.id);
      if (!hit) err(`${tag}: pick ${p.date}/${p.id} が号に存在しない`);
    }
  }
} catch (e) { err(`weekly.json: ${e.message}`); }

for (const w of warns) console.error(" (警告) " + w);
if (errors.length) { console.error(`NG ${errors.length}件`); for (const e of errors) console.error(" - " + e); process.exit(1); }
console.log(`OK: ${issues.length}号・記事${issues.reduce((n, i) => n + i.deep.length + i.log.length, 0)}本・映像${seenVid.size}本、meta.currentIssue=${d.meta.currentIssue}`);
