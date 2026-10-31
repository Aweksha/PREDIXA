import { pool } from "../db/postgresClient.js";

function toInt(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function yyyyMm(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 7);
}

async function ensureSecurity(symbol) {
  await pool.query(
    `insert into securities(symbol) values ($1)
     on conflict(symbol) do nothing`,
    [symbol]
  );
}

async function ensureEodBackfill(symbol, apiKey, lookbackYears) {
  // If we already have data, skip
  const exists = await pool.query(`select 1 from price_eod where symbol=$1 limit 1`, [symbol]);
  if (exists.rowCount > 0) return;

  // Fetch EOD full history from FMP stable
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    symbol
  )}&apikey=${apiKey}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`FMP EOD request failed ${r.status}`);

  const data = await r.json();
  const rows = Array.isArray(data) ? data : data?.historical || data?.results || [];
  if (!Array.isArray(rows) || rows.length === 0) return;

  // keep only last N years to reduce storage
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - lookbackYears);

  const filtered = rows.filter((h) => {
    const d = new Date(h.date + "T00:00:00Z");
    return d >= cutoff;
  });

  const chunkSize = 500;
  for (let i = 0; i < filtered.length; i += chunkSize) {
    const chunk = filtered.slice(i, i + chunkSize);

    const values = [];
    const params = [];
    let p = 1;

    for (const h of chunk) {
      values.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
      );
      params.push(
        symbol,
        h.date,
        toNum(h.open),
        toNum(h.high),
        toNum(h.low),
        toNum(h.close),
        toInt(h.volume),
        toNum(h.vwap),
        toNum(h.changePercent ?? h.change_percent)
      );
    }

    await pool.query(
      `
      insert into price_eod(symbol, date, open, high, low, close, volume, vwap, change_percent)
      values ${values.join(",")}
      on conflict(symbol, date) do update set
        open=excluded.open,
        high=excluded.high,
        low=excluded.low,
        close=excluded.close,
        volume=excluded.volume,
        vwap=excluded.vwap,
        change_percent=excluded.change_percent
      `,
      params
    );
  }
}

export const getMonthlyTrends = async (req, res) => {
  const symbol = (req.query.symbol || "").toString().toUpperCase();
  const months = Math.min(60, Math.max(6, Number(req.query.months || 12)));
  const lookbackYears = Math.min(10, Math.max(1, Number(req.query.lookbackYears || 5)));

  if (!symbol) return res.status(400).json({ error: "symbol is required" });

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "FMP_API_KEY missing" });

  try {
    // 0) Ensure security exists + backfill EOD if needed
    await ensureSecurity(symbol);
    await ensureEodBackfill(symbol, apiKey, lookbackYears);

    // 1) Monthly closes for last N months (trend display)
    const monthly = await pool.query(
      `
      with monthly as (
        select
          date_trunc('month', date)::date as month,
          (array_agg(close order by date desc))[1] as close
        from price_eod
        where symbol = $1
          and date >= (current_date - ($2 || ' months')::interval)
        group by 1
      )
      select
        month,
        close,
        case
          when lag(close) over (order by month) is null then null
          else ( (close / lag(close) over (order by month)) - 1 ) * 100
        end as mom_return_pct
      from monthly
      order by month asc
      `,
      [symbol, months]
    );

    // 2) Daily window (5y) – used only for count right now (kept light)
    const daily5y = await pool.query(
      `
      select date, close
      from price_eod
      where symbol = $1
        and date >= (current_date - ($2 || ' years')::interval)
      order by date asc
      `,
      [symbol, lookbackYears]
    );

    // 3) Mean / stdev monthly return over last 5 years
    const muRes = await pool.query(
      `
      with m as (
        select
          date_trunc('month', date)::date as month,
          (array_agg(close order by date desc))[1] as close
        from price_eod
        where symbol = $1
          and date >= (current_date - ($2 || ' years')::interval)
        group by 1
      ),
      r as (
        select
          month,
          case
            when lag(close) over (order by month) is null then null
            else ( (close / lag(close) over (order by month)) - 1 ) * 100
          end as ret_pct
        from m
      )
      select
        avg(ret_pct) as mean_monthly_return_pct,
        stddev_samp(ret_pct) as stdev_monthly_return_pct
      from r
      where ret_pct is not null
      `,
      [symbol, lookbackYears]
    );

    const meanMonthly = Number(muRes.rows[0]?.mean_monthly_return_pct ?? 0);
    const stdevMonthly = Number(muRes.rows[0]?.stdev_monthly_return_pct ?? 0);

    const lastMonthClose = monthly.rows.length ? Number(monthly.rows[monthly.rows.length - 1].close) : null;

    const nextMonthPoint =
      lastMonthClose == null ? null : Number((lastMonthClose * (1 + meanMonthly / 100)).toFixed(2));

    return res.json({
      symbol,
      monthly: monthly.rows.map((x) => ({
        month: yyyyMm(x.month), // "YYYY-MM"
        close: x.close != null ? Number(x.close) : null,
        momReturnPct: x.mom_return_pct != null ? Number(x.mom_return_pct) : null,
      })),
      modelWindow: {
        lookbackYears,
        dailyPoints: daily5y.rows.length,
        meanMonthlyReturnPct: Number(meanMonthly.toFixed(4)),
        stdevMonthlyReturnPct: Number(stdevMonthly.toFixed(4)),
      },
      prediction:
        lastMonthClose == null || nextMonthPoint == null
          ? null
          : {
              basis: "mean_monthly_return_5y",
              lastMonthClose: Number(lastMonthClose.toFixed(2)),
              nextMonthPoint,
              bandLo: Number((nextMonthPoint * (1 - stdevMonthly / 100)).toFixed(2)),
              bandHi: Number((nextMonthPoint * (1 + stdevMonthly / 100)).toFixed(2)),
            },
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};