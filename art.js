// AI活用レーダー 試作（2026-11-14・万屋）— 号ごとの色と、カードの絵
// 絵は 320×180 の SVG。色は下のクラスだけを使う（カードの色に合わせて自動で変わる）:
//   a-on / s-on   … カードの上の文字色（白か墨）
//   a-pop / s-pop … 差し色（同じ号の別のカードの色）
//   a-deep        … カードの色を濃くした色      a-tint … カードの色を薄くした色
//   a-paper       … 白                          a-ink / s-ink … 墨

/* ── 号ごとの色（号番号で順に回る。3色＝深掘り3本、bg＝紙の色） ── */
const PALETTES = [
  { bg: "#EEF1F9", c: ["#2B4EFF", "#FF7A1A", "#12B886"] },
  { bg: "#F6EFF8", c: ["#6B3BF5", "#FF3D8B", "#FFC914"] },
  { bg: "#EEF5EE", c: ["#0E7A4B", "#FF5A4E", "#2F9BF0"] },
  { bg: "#F8F0E8", c: ["#E5322D", "#1B2A6B", "#F2B53A"] },
  { bg: "#ECF4F4", c: ["#008C8C", "#D61F8C", "#FF9A1F"] },
  { bg: "#F1F0FA", c: ["#3A2FBF", "#A8D916", "#FF6FA5"] },
  { bg: "#F4F1EA", c: ["#C2266B", "#147D99", "#8FBF2F"] }, // 創刊からの3色
];
const INK = "#1B1D22";
function lum(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const onColor = (hex) => (contrast(hex, "#FFFFFF") >= contrast(hex, INK) ? "#FFFFFF" : INK);
function paletteOf(issue) { return PALETTES[(issue.no || 0) % PALETTES.length]; }
function applyPalette(issue) {
  const p = paletteOf(issue), st = document.documentElement.style;
  st.setProperty("--base", p.bg);
  p.c.forEach((c, i) => {
    st.setProperty(`--c${i}`, c);
    st.setProperty(`--c${i}-on`, onColor(c));
    st.setProperty(`--c${i}-pop`, p.c[(i + 1) % 3]);
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.bg);
}

/* ── 絵の部品 ── */
const svg = (inner) => `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
// 人の上半身（証明写真などに使う）
const bust = (x, y, s, cls = "a-ink") => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-9" r="7.5" class="${cls}"/><path d="M-15 16 C-15 3 -8 0 0 0 C8 0 15 3 15 16 Z" class="${cls}"/></g>`;

/* ── ジャンルごとの図（絵が付いていない号・短信の印に使う。固定8種） ── */
const MOTIF = {
  "Claude Code・エージェント技法": svg(`
    <rect x="52" y="30" width="216" height="126" rx="14" class="a-deep"/>
    <circle cx="72" cy="48" r="4.5" class="a-pop"/><circle cx="87" cy="48" r="4.5" class="a-tint"/><circle cx="102" cy="48" r="4.5" class="a-on" opacity=".6"/>
    <path d="M78 82 L102 100 L78 118" class="s-on" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="116" y="110" width="44" height="10" rx="3" class="a-pop"/>
    <rect x="172" y="78" width="72" height="8" rx="4" class="a-on" opacity=".35"/><rect x="172" y="96" width="50" height="8" rx="4" class="a-on" opacity=".35"/>`),
  "ゲーム・創作・個人開発": svg(`
    <path d="M70 60 h180 a36 36 0 0 1 36 36 v8 a36 36 0 0 1 -62 25 l-16 -17 h-96 l-16 17 a36 36 0 0 1 -62 -25 v-8 a36 36 0 0 1 36 -36 z" class="a-deep"/>
    <path d="M92 78 h14 v14 h14 v14 h-14 v14 h-14 v-14 h-14 v-14 h14 z" class="a-on"/>
    <circle cx="212" cy="86" r="11" class="a-pop"/><circle cx="238" cy="108" r="11" class="a-tint"/>
    <path d="M150 22 l5 12 l13 2 l-10 8 l3 13 l-11 -7 l-11 7 l3 -13 l-10 -8 l13 -2 z" class="a-pop"/>`),
  "新ツール・新サービス": svg(`
    <path d="M96 96 L160 74 L224 96 L224 150 L160 172 L96 150 Z" class="a-deep"/>
    <path d="M96 96 L160 118 L224 96 L160 74 Z" class="a-tint"/>
    <path d="M160 118 L160 172" class="s-on" stroke-width="3" opacity=".5"/>
    <path d="M160 14 C164 38 172 46 196 50 C172 54 164 62 160 86 C156 62 148 54 124 50 C148 46 156 38 160 14 Z" class="a-pop"/>
    <path d="M236 30 C238 40 241 43 251 45 C241 47 238 50 236 60 C234 50 231 47 221 45 C231 43 234 40 236 30 Z" class="a-on"/>
    <circle cx="84" cy="50" r="6" class="a-on" opacity=".7"/>`),
  "自動化パイプライン": svg(`
    <path d="M62 126 H128 V58 H196 V126 H262" fill="none" class="s-deep" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M62 126 H128 V58 H196 V126 H262" fill="none" class="s-on" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/>
    <circle cx="62" cy="126" r="20" class="a-paper"/><circle cx="162" cy="58" r="20" class="a-pop"/><circle cx="262" cy="126" r="20" class="a-tint"/>
    <path d="M54 126 l6 6 l11 -12" fill="none" class="s-ink" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M254 118 v16 l13 -8 z" class="a-ink"/>`),
  "AI×家庭・生活": svg(`
    <circle cx="246" cy="48" r="20" class="a-pop"/>
    <path d="M84 96 L160 34 L236 96 Z" class="a-deep"/>
    <rect x="100" y="94" width="120" height="68" class="a-paper"/>
    <rect x="146" y="118" width="28" height="44" rx="3" class="a-deep"/>
    <rect x="112" y="108" width="24" height="22" rx="2" class="a-tint"/><rect x="184" y="108" width="24" height="22" rx="2" class="a-tint"/>
    <rect x="40" y="160" width="240" height="6" rx="3" class="a-on" opacity=".5"/>`),
  "画像・動画生成": svg(`
    <rect x="64" y="26" width="192" height="128" rx="10" class="a-paper"/>
    <rect x="76" y="38" width="168" height="104" rx="4" class="a-tint"/>
    <circle cx="208" cy="68" r="15" class="a-pop"/>
    <path d="M76 142 L124 84 L156 118 L180 96 L244 142 Z" class="a-deep"/>
    <circle cx="96" cy="56" r="3" class="a-paper"/><circle cx="112" cy="50" r="2" class="a-paper"/>
    <path d="M150 74 v34 l28 -17 z" class="a-paper" opacity=".92"/>`),
  "AI×ハードウェア・3Dプリント": svg(`
    <g class="s-on" stroke-width="7" stroke-linecap="round">
      <path d="M124 34 v22 M148 34 v22 M172 34 v22 M196 34 v22 M124 124 v22 M148 124 v22 M172 124 v22 M196 124 v22"/>
      <path d="M92 66 h22 M92 90 h22 M92 114 h22 M206 66 h22 M206 90 h22 M206 114 h22"/>
    </g>
    <rect x="108" y="48" width="104" height="84" rx="12" class="a-deep"/>
    <rect x="132" y="66" width="56" height="48" rx="6" class="a-pop"/>
    <circle cx="122" cy="62" r="3.5" class="a-on"/>`),
  "AI×仕事の現場": svg(`
    <rect x="58" y="28" width="204" height="118" rx="10" class="a-paper"/>
    <rect x="82" y="96" width="26" height="34" rx="3" class="a-tint"/><rect x="120" y="76" width="26" height="54" rx="3" class="a-deep"/>
    <rect x="158" y="58" width="26" height="72" rx="3" class="a-pop"/><rect x="196" y="86" width="26" height="44" rx="3" class="a-deep"/>
    <path d="M82 60 L126 50 L164 38 L228 46" fill="none" class="s-ink" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="132" y="146" width="56" height="8" class="a-on" opacity=".6"/><rect x="104" y="154" width="112" height="8" rx="4" class="a-on"/>`),
};
const motifOf = (genre) => MOTIF[genre] || MOTIF["新ツール・新サービス"];

/* ── 号の記事に合わせて描いた絵（試作: 第112号の深掘り3本ぶん。「日付/記事ID」で引く） ──
   本番にするなら、日次ジョブが深掘り1本ごとに art を1点描いて issues.json に入れる想定（未配線） */
const ART_SAMPLE = {
  // d1 モニターの上のガラスの箱に住む「Lump」
  "2026-11-13/d1": svg(`
    <rect x="34" y="132" width="252" height="70" rx="12" class="a-deep"/>
    <rect x="46" y="144" width="228" height="50" rx="5" class="a-tint" opacity=".28"/>
    <rect x="60" y="154" width="70" height="6" rx="3" class="a-on" opacity=".55"/><rect x="60" y="167" width="110" height="6" rx="3" class="a-on" opacity=".35"/>
    <rect x="108" y="122" width="104" height="12" rx="4" class="a-on"/>
    <rect x="116" y="30" width="88" height="94" rx="10" class="a-paper" opacity=".16"/>
    <rect x="116" y="30" width="88" height="94" rx="10" fill="none" class="s-on" stroke-width="3"/>
    <path d="M128 44 v26" class="s-on" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="160" cy="86" rx="27" ry="25" class="a-pop"/>
    <ellipse cx="143" cy="112" rx="8" ry="5" class="a-pop"/><ellipse cx="177" cy="112" rx="8" ry="5" class="a-pop"/>
    <circle cx="150" cy="80" r="4.2" class="a-ink"/><circle cx="170" cy="80" r="4.2" class="a-ink"/>
    <circle cx="151.4" cy="78.6" r="1.4" class="a-paper"/><circle cx="171.4" cy="78.6" r="1.4" class="a-paper"/>
    <path d="M155 90 q5 4 10 0" fill="none" class="s-ink" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M146 96 h28 l3 14 h-34 z" class="a-ink"/>
    <rect x="140" y="110" width="40" height="4.5" rx="2" class="a-paper"/>
    <circle cx="160" cy="103" r="2.4" class="a-paper" opacity=".85"/>
    <g class="s-on" stroke-width="4" stroke-linecap="round"><path d="M218 40 l14 -9"/><path d="M222 60 h17"/><path d="M218 80 l14 9"/></g>
    <circle cx="262" cy="52" r="17" class="a-pop"/>
    <rect x="259.5" y="41" width="5" height="14" rx="2.5" class="a-ink"/><circle cx="262" cy="61" r="3" class="a-ink"/>
    <g class="a-on" opacity=".85"><rect x="62" y="86" width="16" height="5" rx="2.5"/><rect x="50" y="100" width="28" height="5" rx="2.5"/><rect x="66" y="114" width="12" height="5" rx="2.5"/></g>`),
  // d2 物語つきの麻雀ゲーム
  "2026-11-13/d2": svg(`
    <path d="M24 200 L64 118 H256 L296 200 Z" class="a-pop"/>
    <path d="M64 118 H256" class="s-ink" stroke-width="3" opacity=".25"/>
    <g>
      <g transform="translate(64 40)"><rect x="3" y="5" width="36" height="52" rx="5" class="a-deep"/><rect width="36" height="52" rx="5" class="a-paper"/><circle cx="18" cy="26" r="9" class="a-pop"/><circle cx="18" cy="26" r="3.5" class="a-paper"/></g>
      <g transform="translate(104 40)"><rect x="3" y="5" width="36" height="52" rx="5" class="a-deep"/><rect width="36" height="52" rx="5" class="a-paper"/><circle cx="18" cy="15" r="6" class="a-ink"/><circle cx="18" cy="37" r="6" class="a-ink"/></g>
      <g transform="translate(144 40)"><rect x="3" y="5" width="36" height="52" rx="5" class="a-deep"/><rect width="36" height="52" rx="5" class="a-paper"/><g class="s-pop" stroke-width="5" stroke-linecap="round"><path d="M11 12 v28"/><path d="M18 12 v28"/><path d="M25 12 v28"/></g></g>
      <g transform="translate(184 40)"><rect x="3" y="5" width="36" height="52" rx="5" class="a-deep"/><rect width="36" height="52" rx="5" class="a-paper"/><rect x="9" y="17" width="18" height="16" rx="2" fill="none" stroke="#D8322D" stroke-width="3.5"/><path d="M18 9 v34" stroke="#D8322D" stroke-width="3.5" stroke-linecap="round"/></g>
      <g transform="translate(224 26) rotate(9)"><rect x="3" y="5" width="36" height="52" rx="5" class="a-deep"/><rect width="36" height="52" rx="5" class="a-paper"/>
        <g transform="translate(18 25)"><circle cx="-6" cy="-6" r="6.5" fill="#F06FA0"/><circle cx="6" cy="-6" r="6.5" fill="#F06FA0"/><circle cx="-6" cy="6" r="6.5" fill="#F06FA0"/><circle cx="6" cy="6" r="6.5" fill="#F06FA0"/><circle r="3.4" class="a-paper"/></g></g>
    </g>
    <g transform="translate(118 132)"><rect x="2" y="3" width="26" height="36" rx="4" class="a-ink" opacity=".25"/><rect width="26" height="36" rx="4" class="a-paper"/><rect x="6" y="6" width="14" height="24" rx="2" class="a-deep" opacity=".5"/></g>
    <g transform="translate(150 132)"><rect x="2" y="3" width="26" height="36" rx="4" class="a-ink" opacity=".25"/><rect width="26" height="36" rx="4" class="a-paper"/><rect x="6" y="6" width="14" height="24" rx="2" class="a-deep" opacity=".5"/></g>
    <g transform="translate(182 132)"><rect x="2" y="3" width="26" height="36" rx="4" class="a-ink" opacity=".25"/><rect width="26" height="36" rx="4" class="a-paper"/><rect x="6" y="6" width="14" height="24" rx="2" class="a-deep" opacity=".5"/></g>
    <g transform="translate(40 126)"><rect width="20" height="20" rx="4" class="a-paper"/><circle cx="6" cy="6" r="2.2" class="a-ink"/><circle cx="14" cy="14" r="2.2" class="a-ink"/><circle cx="10" cy="10" r="2.2" fill="#D8322D"/></g>
    <g transform="translate(262 134) rotate(14)"><rect width="20" height="20" rx="4" class="a-paper"/><circle cx="6" cy="6" r="2.2" class="a-ink"/><circle cx="14" cy="6" r="2.2" class="a-ink"/><circle cx="6" cy="14" r="2.2" class="a-ink"/><circle cx="14" cy="14" r="2.2" class="a-ink"/></g>`),
  // d3 スナップ写真から証明写真のL判シートへ
  "2026-11-13/d3": svg(`
    <g transform="translate(74 92) rotate(-15)">
      <rect x="-44" y="-52" width="88" height="104" rx="5" class="a-ink" opacity=".18" transform="translate(4 5)"/>
      <rect x="-44" y="-52" width="88" height="104" rx="5" class="a-paper"/>
      <rect x="-37" y="-45" width="74" height="78" class="a-tint"/>
      <circle cx="18" cy="-28" r="9" fill="#FFC914"/>
      <path d="M-37 33 L-12 6 L6 22 L20 10 L37 33 Z" class="a-deep" opacity=".55"/>
      <g transform="rotate(14)">${bust(-4, 12, 1.5)}</g>
    </g>
    <path d="M134 92 h28" class="s-on" stroke-width="6" stroke-linecap="round"/><path d="M158 80 l16 12 l-16 12 z" class="a-on"/>
    <rect x="189" y="23" width="110" height="142" rx="4" class="a-ink" opacity=".18"/>
    <rect x="185" y="19" width="110" height="142" rx="4" class="a-paper"/>
    ${[[197, 31], [245, 31], [197, 87], [245, 87]].map(([x, y]) => `<rect x="${x}" y="${y}" width="38" height="48" class="a-tint"/>${bust(x + 19, y + 29, 0.92, "a-pop")}<circle cx="${x + 19}" cy="${y + 20.7}" r="6.9" class="a-paper"/><path d="M${x + 15} ${y + 29} l4 8 l4 -8 z" class="a-paper"/>`).join("")}
    <g class="s-ink" stroke-width="1.6" opacity=".7"><path d="M191 81 h6 M283 81 h6 M240 23 v6 M240 137 v6"/></g>
    <path d="M205 150 h70" class="s-ink" stroke-width="2"/><path d="M205 146 v8 M275 146 v8 M240 147 v6" class="s-ink" stroke-width="2"/>`),
};
/*ART-CHECK-BEGIN*/
/* 毎朝のジョブが描いた絵（issues.json の deep[].art）の検査。scripts/validate.mjs もこの区間を読んで同じ検査をする。
   art は <svg> の中身だけ（外枠は svg() が付ける）。図形の要素と、下の属性だけを通す。
   文字・リンク・スクリプト・style・外部参照は書けない（公開ページにそのまま差し込むため）。問題があれば理由を返し、なければ null。 */
const ART_EL = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const ART_AT = new Set(["class", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points",
  "transform", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "opacity", "fill-opacity", "stroke-opacity", "fill-rule"]);
const ART_CLASS = new Set(["a-on", "s-on", "a-pop", "s-pop", "a-deep", "s-deep", "a-tint", "a-paper", "a-ink", "s-ink"]);
const ART_MAX = 6000;
function artProblem(s) {
  if (typeof s !== "string" || !s.trim()) return "空か、文字列でない";
  if (s.length > ART_MAX) return `長すぎる（${s.length}字。上限 ${ART_MAX}字）`;
  const tag = /\s*<(\/?)([A-Za-z]+)((?:\s+[A-Za-z0-9-]+="[^"<>&]*")*)\s*(\/?)>\s*/y;
  const open = [];
  let pos = 0, count = 0;
  while (pos < s.length) {
    tag.lastIndex = pos;
    const m = tag.exec(s);
    if (!m) return `図形のタグ以外が書かれている（${pos}字目あたり「${s.slice(pos, pos + 24)}」）`;
    pos = tag.lastIndex;
    const [, close, name, attrs, self] = m;
    if (!ART_EL.has(name)) return `使えない要素 <${name}>`;
    if (close) {
      if (attrs || self || open.pop() !== name) return `閉じタグ </${name}> が合わない`;
      continue;
    }
    count++;
    for (const a of attrs.matchAll(/([A-Za-z0-9-]+)="([^"]*)"/g)) {
      const [, k, v] = a;
      if (!ART_AT.has(k)) return `使えない属性 ${k}`;
      if (k === "class") { if (!v.split(/\s+/).filter(Boolean).every((c) => ART_CLASS.has(c))) return `使えないクラス「${v}」`; }
      else if (k === "fill" || k === "stroke") { if (!/^(none|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6})$/.test(v)) return `${k} は none か #RRGGBB（今「${v}」）`; }
      else if (!/^[A-Za-z0-9\s.,%()+-]*$/.test(v) || /url|script/i.test(v)) return `属性 ${k} の値「${v.slice(0, 24)}」`;
    }
    if (!self) open.push(name);
  }
  if (open.length) return `<${open[open.length - 1]}> が閉じていない`;
  if (count < 3) return "図形が少なすぎる（3つ以上）";
  return null;
}
/*ART-CHECK-END*/
function artFor(issue, item) {
  if (item.art && !artProblem(item.art)) return svg(item.art); // 検査に落ちた絵は使わず、下の図に戻す
  return ART_SAMPLE[`${issue.date}/${item.id}`] || motifOf(item.genre);
}
