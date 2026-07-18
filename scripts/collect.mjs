#!/usr/bin/env node
// AI活用レーダー 候補収集スクリプト
// 5源（Reddit / Hacker News / Zenn / Qiita / GitHub）から過去24〜48hの候補を集め、
// scripts/out/candidates-YYYY-MM-DD.json に保存する。外部依存なし（Node 18+ fetch）。

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = { "User-Agent": "ai-radar/1.0 (personal news digest; contact: github.com/YukiKanedomi)" };
const today = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);

const REDDIT_SUBS = ["ClaudeAI", "ChatGPTCoding", "AI_Agents", "StableDiffusion"];
const ZENN_TOPICS = ["ai", "claudecode", "%E7%94%9F%E6%88%90ai"]; // 生成ai
const QIITA_TAGS = ["生成AI", "ClaudeCode"];

async function jget(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { ...UA, ...extraHeaders } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function tget(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// --- Reddit: 各subの過去24hトップ（JSON APIは403のためRSS経路・ブラウザUA必須） ---
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function reddit() {
  const out = [];
  let first = true;
  for (const sub of REDDIT_SUBS) {
    try {
      if (!first) await sleep(12000); // レート制限対策: sub間は12秒空ける
      first = false;
      let res = await fetch(`https://www.reddit.com/r/${sub}/top.rss?t=day&limit=15`, { headers: { "User-Agent": BROWSER_UA } });
      if (res.status === 429) { await sleep(30000); res = await fetch(`https://www.reddit.com/r/${sub}/top.rss?t=day&limit=15`, { headers: { "User-Agent": BROWSER_UA } }); }
      if (!res.ok) throw new Error(`${res.status}`);
      const xml = await res.text();
      for (const item of parseRss(xml, `Reddit r/${sub}`)) {
        // RSSにはスコアが無い。本文HTMLを素朴にテキスト化して冒頭を残す
        out.push({ ...item, discussUrl: item.url });
      }
    } catch (e) { console.error(`[reddit:${sub}] ${e.message}`); }
  }
  return out;
}

// --- Hacker News (Algolia): 過去24hの高得点ストーリー ---
async function hackernews() {
  const out = [];
  const since = Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);
  const queries = ["AI", "LLM", "Claude", "agent"];
  for (const q of queries) {
    try {
      const j = await jget(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i%3E${since},points%3E30&hitsPerPage=15`);
      for (const h of j.hits) {
        out.push({
          source: "Hacker News",
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          discussUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
          score: h.points,
          comments: h.num_comments,
          publishedAt: h.created_at,
          excerpt: "",
        });
      }
    } catch (e) { console.error(`[hn:${q}] ${e.message}`); }
  }
  return out;
}

// --- Zenn: トピックフィード(RSS) ---
function parseRss(xml, sourceName) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>|<entry>[\s\S]*?<\/entry>/g) || [];
  for (const b of blocks) {
    const pick = (tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
    };
    const linkAttr = b.match(/<link[^>]*href="([^"]+)"/);
    const url = linkAttr ? linkAttr[1] : pick("link");
    if (!url) continue;
    items.push({
      source: sourceName,
      title: pick("title"),
      url,
      score: null,
      comments: null,
      publishedAt: pick("pubDate") || pick("published") || "",
      excerpt: (pick("description") || pick("content")).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
    });
  }
  return items;
}
async function zenn() {
  const out = [];
  for (const t of ZENN_TOPICS) {
    try {
      const xml = await tget(`https://zenn.dev/topics/${t}/feed`);
      out.push(...parseRss(xml, "Zenn"));
    } catch (e) { console.error(`[zenn:${t}] ${e.message}`); }
  }
  // 48h以内のみ
  const cutoff = Date.now() - 48 * 3600 * 1000;
  return out.filter((i) => !i.publishedAt || new Date(i.publishedAt).getTime() > cutoff);
}

// --- Qiita: タグ別新着（公開API・認証なし60req/h） ---
async function qiita() {
  const out = [];
  for (const tag of QIITA_TAGS) {
    try {
      const j = await jget(`https://qiita.com/api/v2/items?page=1&per_page=15&query=${encodeURIComponent("tag:" + tag)}`);
      for (const a of j) {
        out.push({
          source: "Qiita",
          title: a.title,
          url: a.url,
          score: a.likes_count,
          comments: a.comments_count,
          publishedAt: a.created_at,
          excerpt: (a.body || "").replace(/[#`\-\*\|]/g, "").slice(0, 300),
        });
      }
    } catch (e) { console.error(`[qiita:${tag}] ${e.message}`); }
  }
  const cutoff = Date.now() - 48 * 3600 * 1000;
  return out.filter((i) => new Date(i.publishedAt).getTime() > cutoff);
}

// --- GitHub: 直近1週間に作られた注目AIリポジトリ ---
async function github() {
  const out = [];
  const weekAgo = ymd(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  try {
    const j = await jget(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(`created:>${weekAgo} topic:ai`)}&sort=stars&order=desc&per_page=15`,
      { Accept: "application/vnd.github+json" }
    );
    for (const r of j.items) {
      if (r.stargazers_count < 30) continue;
      out.push({
        source: "GitHub",
        title: `${r.full_name} — ${r.description || ""}`.slice(0, 200),
        url: r.html_url,
        score: r.stargazers_count,
        comments: null,
        publishedAt: r.created_at,
        excerpt: (r.description || "").slice(0, 300),
      });
    }
  } catch (e) { console.error(`[github] ${e.message}`); }
  return out;
}

// --- main ---
const results = await Promise.all([reddit(), hackernews(), zenn(), qiita(), github()]);
let all = results.flat();

// URL重複除去
const seen = new Set();
all = all.filter((i) => {
  const key = i.url.replace(/[?#].*$/, "").replace(/\/$/, "");
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const outDir = join(__dirname, "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `candidates-${ymd(today)}.json`);
writeFileSync(outPath, JSON.stringify({ collectedAt: today.toISOString(), count: all.length, items: all }, null, 1));

const bySource = {};
for (const i of all) bySource[i.source.split(" ")[0]] = (bySource[i.source.split(" ")[0]] || 0) + 1;
console.log(`candidates: ${all.length}件 → ${outPath}`);
console.log(Object.entries(bySource).map(([k, v]) => `${k}: ${v}`).join(" / "));
