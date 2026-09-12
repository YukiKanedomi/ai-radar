#!/usr/bin/env node
// AI活用レーダー 候補収集スクリプト
// 6源（Reddit / Hacker News / Zenn / Qiita / GitHub / YouTube）＋YouTube検索発見から候補を集め、
// scripts/out/candidates-YYYY-MM-DD.json に保存する。外部依存なし（Node 18+ fetch）。
// Reddit の本文・コメントは scripts/reddit-post.mjs、YouTube の字幕は scripts/yt-transcript.mjs で選定時に読む。

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = { "User-Agent": "ai-radar/1.0 (personal news digest; contact: github.com/YukiKanedomi)" };
const today = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);

const REDDIT_SUBS = ["ClaudeAI", "ChatGPTCoding", "AI_Agents", "StableDiffusion"];
const ZENN_TOPICS = ["ai", "claudecode", "%E7%94%9F%E6%88%90ai", "%E5%80%8B%E4%BA%BA%E9%96%8B%E7%99%BA"]; // 生成ai / 個人開発（作ってみた系の供給源・2026-08-09追加）
const QIITA_QUERIES = ["tag:生成AI", "tag:ClaudeCode", "tag:個人開発 tag:生成AI"]; // AND検索可（2026-08-09 実測済み）
// YouTube: チャンネルRSS方式（キー不要）。ID実在とRSS疎通は2026-07-18 / 2026-09-12 に検証済み。
// 追加時は動画の watch ページHTMLから "channelId":"UC..." を取り（@handle ページは取れないことがある）、
// feeds/videos.xml でチャンネル名と最新動画を必ず目視確認する（ハンドル推測は別チャンネルを掴む事故あり）。
// type: 個人=自分の活用・作品を語る人（最優先）/ 解説=手口の解説 / ニュース=週次まとめ系（号に1本まで）
// days: 遡る日数（個人は投稿が疎なので30日）。filter: 混合チャンネルはAI関連タイトルのみ通す。
const AI_TITLE = /\bAI\b|Claude|ChatGPT|Codex|GPT|Gemini|エージェント|生成AI|LLM|自動化/; // 大文字小文字を区別（/i だと AirPods・Fitbit Air を拾う。2026-09-12 実測）
const YT_CHANNELS = [
  // 個人の活用・作品（2026-09-12 オーナー指定の5本から）
  { id: "UCIB6sLX_RdbgpG1tZiB4khQ", name: "だるまと赤べこ", type: "個人", days: 30 },                        // AIにゲームを作らせて遊ぶ
  { id: "UCz0SS4o79KmEdaHUSZ0XWCQ", name: "建築 AI Studio", type: "個人", days: 30 },                        // 建築業の現場でAIを使う
  { id: "UCho69xUaQCXBNyaCbkhtSjg", name: "ミヤマの資料室", type: "個人", days: 30, filter: AI_TITLE },      // 記録・生活系。AI回のみ
  { id: "UC9AuyS7U4PxeDSNMJ2srarA", name: "AIでサボろうチャンネル", type: "個人", days: 30 },                // 非エンジニア向けのやさしい話
  { id: "UCzH-IRXHeF4jox0P4qBxWAQ", name: "monograph/ 堀口英剛", type: "個人", days: 14, filter: AI_TITLE }, // ガジェット系。AI回のみ
  // 手口の解説（英語）
  { id: "UC_x36zCEGilGpB1m-V4gmjg", name: "IndyDevDan", type: "解説" },   // Claude Code/agentic
  { id: "UCMwVTLZIRRUyyVrkjDpn4pA", name: "Cole Medin", type: "解説" },   // エージェント/自動化
  { id: "UCrXSVX9a1mj8l0CMLwKgMVw", name: "AI Jason", type: "解説" },     // エージェント実装
  // ニュース・動向（量産型に寄りやすいので号に1本まで）
  { id: "UCsBjURrPoezykLs9EqgamOA", name: "Fireship", type: "ニュース" },     // 開発文化・新技術
  { id: "UChpleBmo18P08aKCIgti38g", name: "Matt Wolfe", type: "ニュース" },   // AIツールニュース
  { id: "UCIgnGlGkVRhd4qNFcEwLL4A", name: "AI Search", type: "ニュース" },    // ツール発掘
  { id: "UCNJ1Ymd5yFuUPtn21xtRbbw", name: "AI Explained", type: "ニュース" }, // モデル動向解説
  // 撤去: ClaudeCodeチャンネル（56号で採用0。全動画がLINE誘導・顧問販売つきで毎回除外されていた）
];
// YouTube 検索発見（キー不要・検索結果ページの ytInitialData を読む。2026-09-12 実測）。
// 「今週・視聴数順」で日本語の個人投稿を拾う。量産型講座が多いので視聴数の下限と選定側の目利きが前提。
const YT_SEARCH_QUERIES = ["AI 自作 アプリ", "Claude 使ってみた", "AIで作った ゲーム", "Claude Code 作ってみた"];
const YT_SEARCH_MIN_VIEWS = 1500;
const YT_SEARCH_MIN_SEC = 240; // 4分未満は除外（Shorts・宣伝）

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
  for (const q of QIITA_QUERIES) {
    try {
      const j = await jget(`https://qiita.com/api/v2/items?page=1&per_page=15&query=${encodeURIComponent(q)}`);
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
    } catch (e) { console.error(`[qiita:${q}] ${e.message}`); }
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

// --- YouTube: チャンネルRSS（既定は直近7日・個人チャンネルは30日・視聴数つき） ---
async function youtube() {
  const out = [];
  for (const ch of YT_CHANNELS) {
    const cutoff = Date.now() - (ch.days || 7) * 24 * 3600 * 1000;
    try {
      const xml = await tget(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`);
      const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
      for (const b of blocks) {
        const pick = (re) => { const m = b.match(re); return m ? m[1] : ""; };
        const videoId = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const published = pick(/<published>([^<]+)<\/published>/);
        if (!videoId || new Date(published).getTime() < cutoff) continue;
        // Shorts除外の素朴な判定（タイトルの#shortsのみ。URL判定はRSSからは不可）
        const title = pick(/<title>([^<]+)<\/title>/);
        if (/#shorts/i.test(title)) continue;
        if (ch.filter && !ch.filter.test(title)) continue;
        out.push({
          source: "YouTube",
          channel: ch.name,
          channelType: ch.type,
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          videoId,
          thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          score: Number(pick(/views="(\d+)"/)) || null, // score=視聴数（収集時点）
          comments: null,
          publishedAt: published,
          excerpt: pick(/<media:description>([\s\S]*?)<\/media:description>/).replace(/\s+/g, " ").trim().slice(0, 300),
        });
      }
    } catch (e) { console.error(`[youtube:${ch.name}] ${e.message}`); }
  }
  return out;
}

// --- YouTube 検索発見: 今週・視聴数順の検索結果ページから、登録外の個人投稿を拾う ---
function parseDurationSec(s) { // "1:02:33" / "12:34"
  const p = String(s || "").split(":").map(Number);
  if (p.some(isNaN) || !p.length) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
function approxPublished(txt) { // "3 時間前" / "2 日前" / "1 週間前" → 収集時刻からの概算ISO
  const m = String(txt || "").match(/(\d+)\s*(分|時間|日|週間)/);
  if (!m) return "";
  const unit = { 分: 60e3, 時間: 3600e3, 日: 86400e3, 週間: 7 * 86400e3 }[m[2]];
  return new Date(Date.now() - Number(m[1]) * unit).toISOString();
}
async function youtubeSearch() {
  const out = [];
  let first = true;
  for (const q of YT_SEARCH_QUERIES) {
    try {
      if (!first) await sleep(1500);
      first = false;
      // sp=CAMSBAgCEAE= : 並び=視聴回数 / 期間=今週 / 種類=動画
      const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAMSBAgCEAE%253D`, {
        headers: { "User-Agent": BROWSER_UA, "Accept-Language": "ja", Cookie: "CONSENT=YES+cb; SOCS=CAI; PREF=hl=ja&gl=JP" },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const html = await res.text();
      const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
      if (!m) throw new Error("ytInitialData not found");
      const vids = [];
      (function walk(o) {
        if (!o || typeof o !== "object") return;
        if (o.videoRenderer) { vids.push(o.videoRenderer); return; }
        for (const k in o) walk(o[k]);
      })(JSON.parse(m[1]));
      for (const v of vids) {
        const views = Number(String(v.viewCountText?.simpleText || "").replace(/[^\d]/g, "")) || 0;
        const sec = parseDurationSec(v.lengthText?.simpleText);
        const title = v.title?.runs?.[0]?.text || "";
        if (!v.videoId || views < YT_SEARCH_MIN_VIEWS || sec < YT_SEARCH_MIN_SEC) continue;
        out.push({
          source: "YouTube",
          channel: v.ownerText?.runs?.[0]?.text || "",
          channelType: "検索発見", // 登録外。個人かどうかは選定側が字幕を読んで判断する
          query: q,
          title,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          videoId: v.videoId,
          thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          score: views,
          comments: null,
          publishedAt: approxPublished(v.publishedTimeText?.simpleText),
          excerpt: (v.detailedMetadataSnippets?.[0]?.snippetText?.runs || []).map((r) => r.text).join("").replace(/\s+/g, " ").slice(0, 300),
        });
      }
    } catch (e) { console.error(`[youtube-search:${q}] ${e.message}`); }
  }
  return out;
}

// --- main ---
const results = await Promise.all([reddit(), hackernews(), zenn(), qiita(), github(), youtube(), youtubeSearch()]);
let all = results.flat();

// URL重複除去
const seen = new Set();
all = all.filter((i) => {
  // YouTubeは ?v= が本体なのでvideoIdをキーにする（クエリ除去すると全動画が同一URLに潰れる）
  const key = i.videoId ? `yt:${i.videoId}` : i.url.replace(/[?#].*$/, "").replace(/\/$/, "");
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
