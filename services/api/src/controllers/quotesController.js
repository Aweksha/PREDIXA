import { pool } from "../db/postgresClient.js";

export const getLatestQuote = async (req, res) => {
  const symbol = (req.query.symbol || "").toString().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "FMP_API_KEY missing" });

  try {
    // 1) Try cache first (fresh <= 60 seconds)
    const cached = await pool.query(
      `
      select
        s.symbol,
        s.name,
        s.exchange,
        q.price,
        q.change,
        q.change_percent as "changePercent",
        q.volume,
        q.day_low as "dayLow",
        q.day_high as "dayHigh",
        q.market_cap as "marketCap",
        q.quote_ts as "timestamp",
        extract(epoch from (now() - q.updated_at)) as age_seconds
      from securities s
      left join latest_quotes q on q.symbol = s.symbol
      where s.symbol = $1
      `,
      [symbol]
    );

    const row = cached.rows[0];

    if (row?.price != null && row.age_seconds != null && Number(row.age_seconds) <= 60) {
      return res.json({
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        price: Number(row.price),
        change: Number(row.change),
        changePercent: Number(row.changePercent),
        timestamp: row.timestamp ? Number(row.timestamp) : null,
        dayLow: row.dayLow != null ? Number(row.dayLow) : null,
        dayHigh: row.dayHigh != null ? Number(row.dayHigh) : null,
        volume: row.volume != null ? Number(row.volume) : null,
        marketCap: row.marketCap != null ? Number(row.marketCap) : null,
        source: "cache",
      });
    }

    // 2) Fetch from FMP (stable endpoint)
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
      symbol
    )}&apikey=${apiKey}`;

    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "FMP request failed", status: r.status });

    const data = await r.json();
    const q = Array.isArray(data) ? data[0] : data;
    if (!q) return res.status(404).json({ error: "No quote returned" });

    // 3) Upsert security
    await pool.query(
      `
      insert into securities(symbol, name, exchange)
      values ($1, $2, $3)
      on conflict(symbol) do update
      set name = excluded.name,
          exchange = excluded.exchange
      `,
      [q.symbol, q.name, q.exchange]
    );

    // 4) Upsert latest quote
    await pool.query(
      `
      insert into latest_quotes(
        symbol, price, change, change_percent, volume,
        day_low, day_high, market_cap, quote_ts, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
      on conflict(symbol) do update set
        price = excluded.price,
        change = excluded.change,
        change_percent = excluded.change_percent,
        volume = excluded.volume,
        day_low = excluded.day_low,
        day_high = excluded.day_high,
        market_cap = excluded.market_cap,
        quote_ts = excluded.quote_ts,
        updated_at = now()
      `,
      [
        q.symbol,
        q.price,
        q.change,
        q.changePercentage,
        q.volume,
        q.dayLow,
        q.dayHigh,
        q.marketCap,
        q.timestamp,
      ]
    );

    // 5) Return fresh data
    return res.json({
      symbol: q.symbol,
      name: q.name,
      exchange: q.exchange,
      price: q.price,
      change: q.change,
      changePercent: q.changePercentage,
      timestamp: q.timestamp,
      dayLow: q.dayLow,
      dayHigh: q.dayHigh,
      volume: q.volume,
      marketCap: q.marketCap,
      source: "fmp",
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};