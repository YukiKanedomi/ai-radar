#!/usr/bin/env node
// Reddit 投稿の本文と上位コメントを平文で取り出す（無人実行の WebFetch が Reddit を読めないための補助）。
// 使い方: node scripts/reddit-post.mjs <投稿URL> [出力ファイル]
// 仕組み: 投稿URL + "/.rss" はブラウザUAなら通り、本文と全コメントが Atom で返る（2026-09-12 実測: 本文+155コメント）。
import { writeFileSync } from "node:fs";

const [url, outFile] = process.argv.slice(2);
if (!url) { console.error("usage: node scripts/reddit-post.mjs <url> [outFile]"); process.exit(2); }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_COMMENTS = 12;

const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const toText = (html) => unesc(html || "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

const rssUrl = url.replace(/[?#].*$/, "").replace(/\/$/, "") + "/.rss";
const res = await fetch(rssUrl, { headers: { "User-Agent": UA } });
if (!res.ok) { console.error(`HTTP ${res.status} ${rssUrl}`); process.exit(1); }
const xml = await res.text();
const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
if (!entries.length) { console.error("NO_ENTRIES"); process.exit(1); }

const pick = (b, tag) => { const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1] : ""; };
const post = entries[0];
let out = `# ${unesc(pick(post, "title"))}\n`;
out += `author: ${pick(post, "name")} / updated: ${pick(post, "updated")}\n\n`;
out += `## 本文\n${toText(pick(post, "content")) || "(本文なし: 画像・リンクのみの投稿)"}\n\n`;
out += `## コメント（先頭${Math.min(MAX_COMMENTS, entries.length - 1)}件 / 全${entries.length - 1}件）\n`;
for (const c of entries.slice(1, 1 + MAX_COMMENTS)) {
  const t = toText(pick(c, "content"));
  if (!t) continue;
  out += `- [${pick(c, "name")}] ${t.slice(0, 700)}\n`;
}
if (outFile) { writeFileSync(outFile, out, "utf8"); console.log(`wrote ${outFile} (${out.length} chars)`); }
else process.stdout.write(out);
