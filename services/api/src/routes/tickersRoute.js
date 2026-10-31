import { Router } from "express";

const router = Router();

const SUPPORTED_STOCKS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc." },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "META", name: "Meta Platforms, Inc." },
  { symbol: "GOOG", name: "Alphabet Inc. Class C" },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "NFLX", name: "Netflix, Inc." },
  { symbol: "PLTR", name: "Palantir Technologies Inc." },
  { symbol: "ORCL", name: "Oracle Corporation" },
  { symbol: "SNOW", name: "Snowflake Inc." },
  { symbol: "CRWD", name: "CrowdStrike Holdings, Inc." },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "GS", name: "Goldman Sachs Group, Inc." },
  { symbol: "BAC", name: "Bank of America Corporation" },
  { symbol: "WMT", name: "Walmart Inc." },
  { symbol: "COST", name: "Costco Wholesale Corporation" },
  { symbol: "XOM", name: "Exxon Mobil Corporation" },
  { symbol: "CVX", name: "Chevron Corporation" }
];

/*
  GET /api/tickers/search?q=aap
*/
router.get("/search", async (req, res) => {
  try {
    const rawQuery = req.query.q;
    const q = typeof rawQuery === "string" ? rawQuery.trim().toUpperCase() : "";

    if (!q) {
      return res.json([]);
    }

    const results = SUPPORTED_STOCKS.filter((stock) => {
      return (
        stock.symbol.includes(q) ||
        stock.name.toUpperCase().includes(q)
      );
    })
      .slice(0, 8)
      .map((stock) => ({
        symbol: stock.symbol,
        name: stock.name
      }));

    res.json(results);
  } catch (error) {
    console.error("ticker search error:", error);
    res.status(500).json({ error: "failed to search tickers" });
  }
});

export default router;
