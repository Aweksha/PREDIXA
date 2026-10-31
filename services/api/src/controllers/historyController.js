import { pool } from "../db/postgresClient.js";
import { fetchYahooHistory } from "../utils/yahooHistory.js";

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function upsertYfinanceHistory(symbol) {
  const points = await fetchYahooHistory(symbol);

  await pool.query(
    `INSERT INTO securities(symbol) VALUES ($1) ON CONFLICT DO NOTHING`,
    [symbol]
  );

  const chunkSize = 500;
  for (let i = 0; i < points.length; i += chunkSize) {
    const chunk = points.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const h of chunk) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        symbol,
        h.date,
        toNum(h.open),
        toNum(h.high),
        toNum(h.low),
        toNum(h.close),
        toInt(h.volume),
        null, // vwap not available from yfinance basic history
        null  // changePercent computed on read
      );
    }
    await pool.query(
      `INSERT INTO price_eod(symbol,date,open,high,low,close,volume,vwap,change_percent)
       VALUES ${values.join(",")}
       ON CONFLICT(symbol,date) DO UPDATE SET
         open=excluded.open, high=excluded.high, low=excluded.low,
         close=excluded.close, volume=excluded.volume`,
      params
    );
  }
}

// GET /api/history/eod?symbol=AAPL&limit=365
export const getEodHistory = async (req, res) => {
  const symbol = (req.query.symbol || "").toString().toUpperCase();
  const limit = Math.min(2000, Math.max(10, Number(req.query.limit || 365)));

  if (!symbol) return res.status(400).json({ error: "symbol is required" });

  try {
    await pool.query(
      `INSERT INTO securities(symbol) VALUES ($1) ON CONFLICT DO NOTHING`,
      [symbol]
    );

    const latestRes = await pool.query(
      `SELECT max(date) as latest_date FROM price_eod WHERE symbol = $1`,
      [symbol]
    );

    const latestDateRaw = latestRes.rows[0]?.latest_date;
    const ageDays = latestDateRaw
      ? (Date.now() - new Date(latestDateRaw).getTime()) / 86400000
      : Infinity;

    let refreshed = false;
    if (ageDays > 1) {
      await upsertYfinanceHistory(symbol);
      refreshed = true;
    }

    const out = await pool.query(
      `SELECT date, open, high, low, close, volume
       FROM (
         SELECT * FROM price_eod WHERE symbol=$1 ORDER BY date DESC LIMIT $2
       ) t
       ORDER BY date ASC`,
      [symbol, limit]
    );

    return res.json({ symbol, points: out.rows, source: "db", refreshed });
  } catch (dbError) {
    console.warn(`History DB unavailable for ${symbol}, using Yahoo:`, dbError.message);
    try {
      const points = await fetchYahooHistory(symbol);
      return res.json({ symbol, points: points.slice(-limit), source: "yahoo", refreshed: false });
    } catch (e) {
      return res.status(500).json({ error: "Server error", detail: String(e) });
    }
  }
};
