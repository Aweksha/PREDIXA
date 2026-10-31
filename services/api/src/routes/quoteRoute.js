import express from "express";
import { getLatestQuote } from "../controllers/quotesController.js";
import { pool } from "../db/postgresClient.js";
import { virtualTodayString } from "../utils/virtualDate.js";
import { fetchYahooHistory } from "../utils/yahooHistory.js";

const router = express.Router();

// All symbols used across both the landing TickerStrip and the dashboard strip
const ALL_STRIP_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOG", "TSLA", "AMD",
  "PLTR", "NFLX", "JPM", "GS", "BAC", "WMT", "COST", "XOM",
  "CVX", "SNOW", "CRWD", "ORCL", "GOOGL",
];

function stripQuote(symbol, days) {
  const latest = days[0] ?? null;
  const prev = days[1] ?? null;
  const changePercent =
    latest && prev && prev.close
      ? Math.round(((latest.close - prev.close) / prev.close) * 10000) / 100
      : null;
  let signal = "HOLD";
  if (changePercent !== null) {
    if (changePercent > 0.5) signal = "BUY";
    else if (changePercent < -0.5) signal = "SELL";
  }
  return {
    symbol,
    price: latest ? Math.round(latest.close * 100) / 100 : null,
    changePercent,
    signal,
    date: latest?.date ?? null,
  };
}

async function queryStripFromYahoo(symbol, virtualToday) {
  try {
    const points = await fetchYahooHistory(symbol);
    return stripQuote(symbol, points.filter((p) => p.date <= virtualToday).slice(-2).reverse());
  } catch (err) {
    console.warn(`Ticker strip Yahoo fallback failed for ${symbol}:`, err.message);
    return stripQuote(symbol, []);
  }
}

// Shared DB query: last 2 trading days per symbol up to virtualToday
async function queryStripFromDB(symbols, virtualToday) {
  const { rows } = await pool.query(
    `SELECT symbol, date::text, close
     FROM (
       SELECT symbol, date, close,
              ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
       FROM price_eod
       WHERE symbol = ANY($1) AND date <= $2
     ) t
     WHERE rn <= 2
     ORDER BY symbol, date DESC`,
    [symbols, virtualToday]
  );

  const bySymbol = {};
  for (const r of rows) {
    if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
    bySymbol[r.symbol].push({ date: r.date.split("T")[0], close: Number(r.close) });
  }

  return symbols.map((sym) => stripQuote(sym, bySymbol[sym] || []));
}

// GET /api/quotes/ticker-strip
// Single DB call, returns price + changePercent + signal for all strip symbols
router.get("/ticker-strip", async (req, res) => {
  try {
    const virtualToday = virtualTodayString();
    let result;
    try {
      result = await queryStripFromDB(ALL_STRIP_SYMBOLS, virtualToday);
    } catch (dbError) {
      console.warn("Ticker strip DB unavailable, using Yahoo:", dbError.message);
      result = ALL_STRIP_SYMBOLS.map((symbol) => stripQuote(symbol, []));
    }
    // Also covers symbols the DB simply doesn't have yet
    return res.json(
      await Promise.all(
        result.map((quote) =>
          quote.price === null ? queryStripFromYahoo(quote.symbol, virtualToday) : quote
        )
      )
    );
  } catch (err) {
    console.error("Ticker strip error:", err);
    return res.json(ALL_STRIP_SYMBOLS.map((s) => ({ symbol: s, price: null, changePercent: null, signal: "HOLD", date: null })));
  }
});

router.get("/latest", getLatestQuote);

export default router;
