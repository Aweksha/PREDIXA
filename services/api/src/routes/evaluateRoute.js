import express from "express";
import { pool } from "../db/postgresClient.js";
import { upsertYfinanceHistory } from "../controllers/historyController.js";
import { realTodayString, virtualTodayString } from "../utils/virtualDate.js";
import { fetchYahooHistory } from "../utils/yahooHistory.js";

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

async function ensureHistory(symbol) {
  const latest = await pool.query(
    "SELECT max(date) as d FROM price_eod WHERE symbol=$1",
    [symbol]
  );
  const latestDate = latest.rows[0]?.d;
  const ageDays = latestDate
    ? (Date.now() - new Date(latestDate).getTime()) / 86400000
    : Infinity;

  if (ageDays > 1) await upsertYfinanceHistory(symbol);
}

// Enough for the 5Y chart range plus the 200-day average at its left edge
function candleWindowStart(virtualToday) {
  const start = new Date(virtualToday);
  start.setFullYear(start.getFullYear() - 6);
  return start.toISOString().split("T")[0];
}

async function fetchCandles(symbol, virtualToday) {
  const start = candleWindowStart(virtualToday);

  try {
    await ensureHistory(symbol);
    const { rows } = await pool.query(
      `SELECT date::text, open, high, low, close, volume
       FROM price_eod
       WHERE symbol=$1 AND date>=$2 AND date<=$3
       ORDER BY date ASC`,
      [symbol, start, virtualToday]
    );
    return rows.map((r) => ({
      date: r.date.split("T")[0],
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.volume != null ? Number(r.volume) : null,
    }));
  } catch (dbError) {
    console.warn(`Candles DB unavailable for ${symbol}, using Yahoo:`, dbError.message);
    const points = await fetchYahooHistory(symbol);
    return points.filter((p) => p.date >= start && p.date <= virtualToday);
  }
}

async function fetchNthFutureClose(symbol, asOfDate, offset) {
  const { rows } = await pool.query(
    `SELECT date::text, close
     FROM price_eod
     WHERE symbol=$1 AND date>$2
     ORDER BY date ASC
     OFFSET $3 LIMIT 1`,
    [symbol, asOfDate, offset - 1]
  );

  const row = rows[0];
  if (!row) {
    return { actualPrice: null, actualDate: null };
  }

  return {
    actualPrice: row.close != null ? Number(row.close) : null,
    actualDate: row.date?.split("T")[0] ?? null,
  };
}

async function fetchStoredEvaluation(symbol, asOfDate) {
  try {
    const { rows } = await pool.query(
      `SELECT
         symbol,
         as_of_date::text AS as_of_date,
         current_close,
         predicted_next_close,
         signal_5d,
         prob_up_5d,
         prob_down_5d,
         actual_close_5d,
         direction_correct_5d,
         signal_10d,
         prob_sell_10d,
         prob_hold_10d,
         prob_buy_10d,
         actual_close_10d,
         direction_correct_10d
       FROM prediction_evaluations
       WHERE symbol=$1 AND as_of_date=$2
       LIMIT 1`,
      [symbol, asOfDate]
    );

    return rows[0] ?? null;
  } catch (error) {
    // Stored evaluations are optional; the AI backtest covers a missing table or DB
    if (error?.code !== "42P01") {
      console.warn(`Stored evaluation unavailable for ${symbol}:`, error.message);
    }
    return null;
  }
}

async function buildBacktestFromStoredEvaluation(symbol, storedRow) {
  if (!storedRow) return null;

  const asOfDate = storedRow.as_of_date?.split("T")[0] ?? null;
  if (!asOfDate) return null;

  const currentClose =
    storedRow.current_close != null ? Number(storedRow.current_close) : null;
  const predictedNextClose =
    storedRow.predicted_next_close != null
      ? Number(storedRow.predicted_next_close)
      : null;

  const [nextDay, fifthDay, tenthDay] = await Promise.all([
    fetchNthFutureClose(symbol, asOfDate, 1),
    fetchNthFutureClose(symbol, asOfDate, 5),
    fetchNthFutureClose(symbol, asOfDate, 10),
  ]);

  let nextDayDirectionCorrect = null;
  if (
    predictedNextClose != null &&
    currentClose != null &&
    nextDay.actualPrice != null
  ) {
    nextDayDirectionCorrect =
      (predictedNextClose >= currentClose) === (nextDay.actualPrice >= currentClose);
  }

  const nextDayAbsErrorPct =
    predictedNextClose != null &&
    nextDay.actualPrice != null &&
    nextDay.actualPrice !== 0
      ? Math.round(
          (Math.abs(predictedNextClose - nextDay.actualPrice) / nextDay.actualPrice) *
            10000
        ) / 100
      : null;

  return {
    symbol,
    virtualToday: asOfDate,
    forecasts: {
      nextDay: {
        predictedPrice: predictedNextClose,
        actualPrice: nextDay.actualPrice,
        actualDate: nextDay.actualDate,
        absErrorPct: nextDayAbsErrorPct,
        directionCorrect: nextDayDirectionCorrect,
      },
      fiveDay: {
        predictedSignal: storedRow.signal_5d,
        probUp: storedRow.prob_up_5d != null ? Number(storedRow.prob_up_5d) : 0,
        probDown: storedRow.prob_down_5d != null ? Number(storedRow.prob_down_5d) : 0,
        actualPrice:
          storedRow.actual_close_5d != null
            ? Number(storedRow.actual_close_5d)
            : fifthDay.actualPrice,
        actualDate: fifthDay.actualDate,
        directionCorrect:
          storedRow.direction_correct_5d == null
            ? null
            : Boolean(storedRow.direction_correct_5d),
      },
      tenDay: {
        predictedSignal: storedRow.signal_10d,
        probabilities: {
          SELL:
            storedRow.prob_sell_10d != null ? Number(storedRow.prob_sell_10d) : 0,
          HOLD:
            storedRow.prob_hold_10d != null ? Number(storedRow.prob_hold_10d) : 0,
          BUY: storedRow.prob_buy_10d != null ? Number(storedRow.prob_buy_10d) : 0,
        },
        actualPrice:
          storedRow.actual_close_10d != null
            ? Number(storedRow.actual_close_10d)
            : tenthDay.actualPrice,
        actualDate: tenthDay.actualDate,
        directionCorrect:
          storedRow.direction_correct_10d == null
            ? null
            : Boolean(storedRow.direction_correct_10d),
      },
    },
  };
}

async function aiGet(path, timeoutMs = 60000) {
  try {
    const r = await fetch(`${AI_SERVICE_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// GET /api/evaluate/:symbol
router.get("/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase().trim();
  const vt = virtualTodayString();
  const rt = realTodayString();

  try {
    const [candles, fundamentals, esg] = await Promise.all([
      fetchCandles(symbol, vt),
      aiGet(`/fundamentals/${encodeURIComponent(symbol)}`, 15000),
      aiGet(`/esg/${encodeURIComponent(symbol)}`, 15000),
    ]);

    const lastCandle = candles[candles.length - 1] ?? null;
    const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;
    const asOfDate = lastCandle?.date ?? vt;

    const storedEvaluation = await fetchStoredEvaluation(symbol, asOfDate);
    const backtest =
      (await buildBacktestFromStoredEvaluation(symbol, storedEvaluation)) ??
      (await aiGet(`/backtest/${encodeURIComponent(symbol)}`, 90000));

    const baseClose =
      backtest?.baseClose ??
      (lastCandle ? Number(lastCandle.close) : null);

    const changePercent =
      lastCandle && prevCandle && prevCandle.close
        ? Math.round(((lastCandle.close - prevCandle.close) / prevCandle.close) * 10000) / 100
        : null;

    // The decision is the 10-day model's call, reported with its own probability
    let signal = "HOLD";
    let signalConfidence = null;
    if (backtest?.forecasts) {
      const ten = backtest.forecasts.tenDay;
      signal = ten?.predictedSignal ?? "HOLD";
      const probability = ten?.probabilities?.[signal];
      signalConfidence = probability != null ? Math.round(probability * 100) : null;
    }

    return res.json({
      symbol,
      virtualToday: backtest?.virtualToday ?? vt,
      realToday: rt,
      baseClose,
      lastClose: lastCandle ? Number(lastCandle.close) : null,
      changePercent,
      volume: lastCandle?.volume ?? null,
      signal,
      signalConfidence,
      candles,
      fundamentals: fundamentals ?? null,
      esg: esg ?? null,
      forecasts: backtest?.forecasts ?? null,
    });
  } catch (err) {
    console.error("Evaluate error:", err.message);
    return res.status(500).json({ error: "Evaluate failed", detail: err.message });
  }
});

export default router;
