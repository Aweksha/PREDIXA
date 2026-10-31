const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(x) {
  // Number(null) is 0, and Yahoo uses null for days with no trade
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function requestHistory(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "10y");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Yahoo chart API returned ${r.status}`);

  const data = await r.json();
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};

  const points = timestamps
    .map((ts, index) => {
      const open = toNum(quote.open?.[index]);
      const high = toNum(quote.high?.[index]);
      const low = toNum(quote.low?.[index]);
      const close = toNum(quote.close?.[index]);
      const volume = toInt(quote.volume?.[index]);

      if (
        open === null ||
        high === null ||
        low === null ||
        close === null ||
        volume === null
      ) {
        return null;
      }

      return {
        date: new Date(ts * 1000).toISOString().split("T")[0],
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter(Boolean);

  if (!points.length) throw new Error("yfinance returned no points");
  return points;
}

// Daily bars, oldest first. Concurrent callers share one request.
export function fetchYahooHistory(symbol) {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.points;

  const points = requestHistory(symbol);
  cache.set(symbol, { ts: Date.now(), points });
  points.catch(() => cache.delete(symbol));
  return points;
}
