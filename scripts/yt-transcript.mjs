#!/usr/bin/env node
// yt-transcript.mjs — YouTube動画の字幕（自動生成含む）を平文で取り出す
// 使い方: node scripts/yt-transcript.mjs <videoId|URL> [出力ファイル]
// 依存: yt-dlp（pip install --user yt-dlp 済み。python -m yt_dlp で呼ぶ）
// 方式: 言語を1つずつ試す（原語優先）。一括指定だと1言語の429で全体が中断するため。
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const arg = process.argv[2];
if (!arg) { console.error("usage: node scripts/yt-transcript.mjs <videoId|URL> [outFile]"); process.exit(1); }
const m = arg.match(/[?&]v=([\w-]{11})/) || arg.match(/youtu\.be\/([\w-]{11})/) || arg.match(/^([\w-]{11})$/);
if (!m) { console.error("videoIdを認識できません"); process.exit(1); }
const id = m[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 原語（-orig）を自動翻訳より優先。日本語動画なら ja-orig/ja が先に当たる。
const LANGS = ["ja-orig", "en-orig", "ja", "en"];

const work = mkdtempSync(join(tmpdir(), "ytsub-"));
let picked = null, lastErr = "";
try {
  for (const lang of LANGS) {
    try {
      execFileSync("python", ["-m", "yt_dlp", "--skip-download", "--write-auto-subs", "--write-subs",
        "--sub-langs", lang, "--sub-format", "json3", "-o", join(work, "%(id)s"),
        `https://www.youtube.com/watch?v=${id}`], { stdio: ["ignore", "ignore", "pipe"], timeout: 120000 });
    } catch (e) {
      lastErr = (e.stderr || "").toString().split("\n").filter((l) => l.startsWith("ERROR")).join(" ") || e.message;
    }
    const f = readdirSync(work).find((f) => f.includes(`.${lang}.`) && f.endsWith(".json3"));
    if (f) { picked = { f, lang }; break; }
    await sleep(3000); // レート制限に礼儀
  }

  if (!picked) { console.log(`NO_CAPTIONS ${id} ${lastErr}`); process.exit(0); }

  const j = JSON.parse(readFileSync(join(work, picked.f), "utf8"));
  const text = (j.events || []).map((e) => (e.segs || []).map((s) => s.utf8).join("")).join(" ")
    .replace(/\s+/g, " ").trim();
  const head = `TRANSCRIPT ${id} lang=${picked.lang} chars=${text.length}`;
  if (process.argv[3]) {
    writeFileSync(process.argv[3], `${head}\n${text}\n`, "utf8");
    console.log(`${head} -> ${process.argv[3]}`);
  } else {
    console.log(head);
    console.log(text);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
