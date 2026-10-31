export type Sector = "Technology" | "Financials" | "Consumer" | "Energy";

// Mirrors SUPPORTED_STOCKS in services/api/src/routes/tickersRoute.js
export const SUPPORTED_STOCKS: { symbol: string; name: string; sector: Sector }[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology" },
  { symbol: "META", name: "Meta Platforms, Inc.", sector: "Technology" },
  { symbol: "GOOG", name: "Alphabet Inc. Class C", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology" },
  { symbol: "TSLA", name: "Tesla, Inc.", sector: "Consumer" },
  { symbol: "NFLX", name: "Netflix, Inc.", sector: "Consumer" },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", sector: "Technology" },
  { symbol: "ORCL", name: "Oracle Corporation", sector: "Technology" },
  { symbol: "SNOW", name: "Snowflake Inc.", sector: "Technology" },
  { symbol: "CRWD", name: "CrowdStrike Holdings, Inc.", sector: "Technology" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials" },
  { symbol: "GS", name: "Goldman Sachs Group, Inc.", sector: "Financials" },
  { symbol: "BAC", name: "Bank of America Corporation", sector: "Financials" },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer" },
  { symbol: "COST", name: "Costco Wholesale Corporation", sector: "Consumer" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", sector: "Energy" },
  { symbol: "CVX", name: "Chevron Corporation", sector: "Energy" },
];
