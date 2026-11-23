// AI活用レーダー「読んだ記録」の受け皿（Google Apps Script）。2026-11-23
// 置き場所: 記録用のスプレッドシートを1枚作り、拡張機能 → Apps Script に、これを貼る。
// 公開: デプロイ → 新しいデプロイ → 種類「ウェブアプリ」→ 実行するユーザー「自分」・アクセス「全員」。
//       出てきた URL（…/exec）を app.js の READS_URL と、PC の C:\Users\kanedomi\.claude-jobs\air-reads.json に入れる。
// 合言葉: 下の KEY を自分だけの文字列に書き換える（リポジトリには書かない）。合言葉の合わない書き込み・読み出しは捨てる。
const KEY = "ここに合言葉";

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("reads");
  if (!sh) { sh = ss.insertSheet("reads"); sh.appendRow(["at", "date", "no", "id", "type", "genre", "kind", "wild"]); }
  return sh;
}
const out_ = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// アプリからの記録。kind: o=開いた / e=末尾まで読んだ / s=元記事を開いた
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.key !== KEY) return out_({ ok: false });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^[dlv]\d$/.test(d.id) || !/^[oes]$/.test(d.k)) return out_({ ok: false });
    sheet_().appendRow([new Date(), d.date, Number(d.no) || "", d.id, String(d.type || "").slice(0, 10), String(d.genre || "").slice(0, 40), d.k, d.wild ? 1 : 0]);
    return out_({ ok: true });
  } catch (err) { return out_({ ok: false }); }
}

// 毎朝のジョブからの読み出し。?key=合言葉&days=60
function doGet(e) {
  if (!e.parameter || e.parameter.key !== KEY) return out_({ ok: false });
  const since = Date.now() - (Number(e.parameter.days) || 60) * 86400000;
  const rows = sheet_().getDataRange().getValues().slice(1)
    .filter((r) => new Date(r[0]).getTime() >= since)
    .map((r) => ({ at: new Date(r[0]).toISOString(), date: r[1] instanceof Date ? Utilities.formatDate(r[1], "Asia/Tokyo", "yyyy-MM-dd") : String(r[1]), id: r[3], type: r[4], genre: r[5], k: r[6], wild: r[7] }));
  return out_({ ok: true, rows: rows });
}
