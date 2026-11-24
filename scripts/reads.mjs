#!/usr/bin/env node
// 読んだ記録の集計（2026-11-23）。受け皿（scripts/reads-receiver.gs を Google Apps Script に置いた物）から
// 直近60日の記録を取り、号のデータと照らして scripts/out/reads-summary.txt に書く。毎朝の選定が参考に読む。
// 受け皿の URL と合言葉はリポジトリに置かない: C:\Users\kanedomi\.claude-jobs\air-reads.json に {"url":"…/exec","key":"…"}
// 集計は公開しない（scripts/out は git に入らない）。どんな失敗でも exit 0（発行を止めない）。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "scripts/out/reads-summary.txt";
const CONF = process.env.AIR_READS_CONF || "C:/Users/kanedomi/.claude-jobs/air-reads.json";
let tail = ""; // 本人のひとこと。記録が少なくて集計を出さない日も、これは出す
const finish = (text) => { mkdirSync("scripts/out", { recursive: true }); writeFileSync(OUT, text + tail + "\n"); console.log(text.split("\n")[0] + (tail ? "（ひとこと有り）" : "")); process.exit(0); };

let conf;
try { conf = JSON.parse(readFileSync(CONF, "utf8")); } catch { finish("受け皿が未設定（" + CONF + " が無い）。読んだ記録は使わずに進める。"); }
if (!conf?.url || !conf?.key) finish("受け皿が未設定（url か key が空）。読んだ記録は使わずに進める。");

let rows;
try {
  const res = await fetch(`${conf.url}?key=${encodeURIComponent(conf.key)}&days=60`, { signal: AbortSignal.timeout(30000) });
  const j = await res.json();
  if (!j.ok) throw new Error("合言葉が合わない");
  // シートが日付の列を日付型に変えるので、受け皿は "Mon Nov 23 2026 00:00:00 GMT+0900 …" の形で返してくる（2026-11-23 実測）。日本時間の YYYY-MM-DD に直す
  const ymd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(new Date(s).getTime() + 9 * 3600000).toISOString().slice(0, 10);
  rows = (j.rows || []).map((r) => ({ ...r, date: ymd(r.date) }));
  // ひとこと（2026-11-24）: 本人がアプリの記事末尾・号の末尾から書いた自由記述。直近30日分を新しい順に
  const all = JSON.parse(readFileSync("data/issues.json", "utf8")).issues;
  const since = Date.now() - 30 * 86400000;
  const cm = (j.comments || []).filter((c) => new Date(c.at).getTime() >= since).sort((a, b) => (a.at < b.at ? 1 : -1)).map((c) => {
    const i = all.find((x) => x.date === c.date), x = i && [...i.deep, ...i.log, ...(i.videos || [])].find((y) => y.id === c.id);
    const about = x ? `${c.date} ${c.id}「${x.titleJa || x.title}」［${x.genre}］` : `${c.date} の号全体`;
    return `- ${new Date(new Date(c.at).getTime() + 9 * 3600000).toISOString().slice(0, 10)} に書いた / ${about}\n  ${String(c.text).replace(/\s*\n\s*/g, " / ")}`;
  });
  if (cm.length) tail = `\n\n## 本人のひとこと（直近30日・新しい順。本人が書いた言葉そのまま）\n${cm.join("\n")}`;
} catch (e) { finish(`読んだ記録を取れなかった（${e.message}）。使わずに進める。`); }

const issues = JSON.parse(readFileSync("data/issues.json", "utf8")).issues;
// 記録が始まった日より前の号は「読まれなかった」に数えない
const first = rows.map((r) => r.date).sort()[0];
const seen = new Map(); // "date/id" -> Set(kind)
for (const r of rows) { const k = `${r.date}/${r.id}`; if (!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(r.k); }
const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const span = issues.filter((i) => first && i.date >= first && i.date >= cutoff);
const items = span.flatMap((i) => [
  ...i.deep.map((x) => ({ i, x, type: "深掘り" })), ...i.log.map((x) => ({ i, x, type: x.wild ? "短信（圏外枠）" : "短信" })),
  ...(i.videos || []).map((x) => ({ i, x, type: "映像" })),
]).map((o) => ({ ...o, k: seen.get(`${o.i.date}/${o.x.id}`) || new Set() }));

if (rows.length < 10 || span.length < 3) finish(`記録が少ない（記録${rows.length}件・対象${span.length}号）。まだ選定には使わない。`);

const table = (keyOf) => {
  const m = new Map();
  for (const o of items) { const g = keyOf(o); const t = m.get(g) || { n: 0, o: 0, e: 0, s: 0 }; t.n++; if (o.k.has("o")) t.o++; if (o.k.has("e")) t.e++; if (o.k.has("s")) t.s++; m.set(g, t); }
  return [...m].sort((a, b) => b[1].e / b[1].n - a[1].e / a[1].n)
    .map(([g, t]) => `- ${g}: 届けた${t.n}本 / 開いた${t.o} / 末尾まで読んだ${t.e}（${Math.round(100 * t.e / t.n)}%） / 元記事を開いた${t.s}`).join("\n");
};
const recent = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
const list = (f) => items.filter((o) => o.i.date >= recent && f(o)).map((o) => `- ${o.i.date} ${o.x.id}［${o.type}・${o.x.genre}］${o.x.titleJa || o.x.title}`).join("\n") || "- （なし）";

finish(`読んだ記録の集計（${span.at(-1).date}〜${span[0].date} の${span.length}号・${items.length}本。記録${rows.length}件）
これは本人の端末が自動で送った「開いた・末尾まで読んだ・元記事を開いた」の記録。感想ではない。
読まなかった理由は分からない（忙しかった日もある）。枠を無くす根拠にはしない。

## 種類ごと
${table((o) => o.type)}

## ジャンルごと（末尾まで読んだ割合の高い順）
${table((o) => o.x.genre)}

## 直近14日で末尾まで読んだ記事
${list((o) => o.k.has("e"))}

## 直近14日で元記事まで開いた記事（とくに気になった物）
${list((o) => o.k.has("s"))}

## 直近14日で開いたが途中で閉じた記事
${list((o) => o.k.has("o") && !o.k.has("e"))}`);
