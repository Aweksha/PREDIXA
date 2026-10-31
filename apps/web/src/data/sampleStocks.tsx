export type MetricMode = "price" | "pct";

export type CandlePoint = {
  date: string; // ISO yyyy-mm-dd
  close: number;
};

export type StockProfile = {
  symbol: string;
  name: string;
  currency: string;
  lastPrice: number;
  lastUpdatedISO: string;
};

export type StockDataset = {
  profile: StockProfile;
  series: CandlePoint[]; // monthly points for up to 3 years
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function seededNoise(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateMonthlySeries(opts: {
  endDate: Date;
  monthsBack: number; // 36 for 3 years
  startPrice: number;
  seed: number;
  driftPerMonth?: number;
  vol?: number;
}): CandlePoint[] {
  const { endDate, monthsBack, startPrice, seed, driftPerMonth = 0.006, vol = 0.06 } = opts;

  const end = monthStart(endDate);
  const start = addMonths(end, -monthsBack + 1);

  const series: CandlePoint[] = [];
  let price = startPrice;

  let i = 0;
  for (let d = new Date(start); d <= end; d = addMonths(d, 1)) {
    const r = (seededNoise(seed + i * 17) - 0.5) * 2; // [-1, 1]
    const monthlyReturn = driftPerMonth + r * vol;

    price = Math.max(5, price * (1 + monthlyReturn));
    series.push({ date: isoDate(d), close: Number(price.toFixed(2)) });
    i++;
  }
  return series;
}

const NOW = new Date();

const STOCKS: StockDataset[] = [
  // Mega-cap AI / semis
  {
    profile: {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      currency: "USD",
      lastPrice: 202.49,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 120,
      seed: 11,
      driftPerMonth: 0.015,
      vol: 0.09,
    }),
  },

  // Streaming / media
  {
    profile: {
      symbol: "NFLX",
      name: "Netflix, Inc.",
      currency: "USD",
      lastPrice: 485.2,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 320,
      seed: 23,
      driftPerMonth: 0.01,
      vol: 0.07,
    }),
  },

  // Big tech / search
  {
    profile: {
      symbol: "GOOGL",
      name: "Alphabet Inc. (Class A)",
      currency: "USD",
      lastPrice: 155.7,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 105,
      seed: 37,
      driftPerMonth: 0.008,
      vol: 0.05,
    }),
  },

  // ======== 10 more companies (diverse behaviors) ========

  // Apple: steady/low-ish vol
  {
    profile: {
      symbol: "AAPL",
      name: "Apple Inc.",
      currency: "USD",
      lastPrice: 195.35,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 150,
      seed: 41,
      driftPerMonth: 0.007,
      vol: 0.04,
    }),
  },

  // Microsoft: steady + slight drift
  {
    profile: {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      currency: "USD",
      lastPrice: 412.1,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 290,
      seed: 53,
      driftPerMonth: 0.009,
      vol: 0.045,
    }),
  },

  // Amazon: medium vol, trend
  {
    profile: {
      symbol: "AMZN",
      name: "Amazon.com, Inc.",
      currency: "USD",
      lastPrice: 172.55,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 110,
      seed: 67,
      driftPerMonth: 0.008,
      vol: 0.06,
    }),
  },

  // Tesla: high vol, swingy
  {
    profile: {
      symbol: "TSLA",
      name: "Tesla, Inc.",
      currency: "USD",
      lastPrice: 248.9,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 220,
      seed: 79,
      driftPerMonth: 0.004,
      vol: 0.11,
    }),
  },

  // Meta: higher beta, strong drift
  {
    profile: {
      symbol: "META",
      name: "Meta Platforms, Inc.",
      currency: "USD",
      lastPrice: 385.7,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 230,
      seed: 83,
      driftPerMonth: 0.012,
      vol: 0.075,
    }),
  },

  // JPM: financials, moderate vol, lower drift
  {
    profile: {
      symbol: "JPM",
      name: "JPMorgan Chase & Co.",
      currency: "USD",
      lastPrice: 176.4,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 140,
      seed: 97,
      driftPerMonth: 0.005,
      vol: 0.05,
    }),
  },

  // XOM: energy, cyclical, choppy
  {
    profile: {
      symbol: "XOM",
      name: "Exxon Mobil Corporation",
      currency: "USD",
      lastPrice: 108.2,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 92,
      seed: 101,
      driftPerMonth: 0.004,
      vol: 0.065,
    }),
  },

  // JNJ: defensive healthcare, low vol
  {
    profile: {
      symbol: "JNJ",
      name: "Johnson & Johnson",
      currency: "USD",
      lastPrice: 162.3,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 155,
      seed: 109,
      driftPerMonth: 0.003,
      vol: 0.03,
    }),
  },

  // KO: consumer staples, very low vol
  {
    profile: {
      symbol: "KO",
      name: "The Coca-Cola Company",
      currency: "USD",
      lastPrice: 61.8,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 56,
      seed: 127,
      driftPerMonth: 0.0025,
      vol: 0.025,
    }),
  },

  // NKE: consumer discretionary, mid vol
  {
    profile: {
      symbol: "NKE",
      name: "NIKE, Inc.",
      currency: "USD",
      lastPrice: 104.6,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 120,
      seed: 131,
      driftPerMonth: 0.001,
      vol: 0.06,
    }),
  },

  // BA: industrials, higher vol, weaker drift
  {
    profile: {
      symbol: "BA",
      name: "The Boeing Company",
      currency: "USD",
      lastPrice: 192.1,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 210,
      seed: 149,
      driftPerMonth: -0.001,
      vol: 0.085,
    }),
  },

  // BTC proxy (not a stock, but useful for “risk asset” behavior)
  {
    profile: {
      symbol: "BTC",
      name: "Bitcoin (Proxy Series)",
      currency: "USD",
      lastPrice: 61250,
      lastUpdatedISO: NOW.toISOString(),
    },
    series: generateMonthlySeries({
      endDate: NOW,
      monthsBack: 36,
      startPrice: 42000,
      seed: 173,
      driftPerMonth: 0.012,
      vol: 0.16,
    }),
  },
];


export function listTickers() {
  return STOCKS.map((s) => s.profile);
}

export function getStock(symbol: string): StockDataset | undefined {
  const key = symbol.trim().toUpperCase();
  return STOCKS.find((s) => s.profile.symbol === key);
}

export function sliceWindow(series: CandlePoint[], years: 1 | 2 | 3): CandlePoint[] {
  const months = years * 12;
  return series.slice(Math.max(0, series.length - months));
}

export function toPctSeries(series: CandlePoint[]): Array<{ date: string; value: number }> {
  if (series.length === 0) return [];
  const base = series[0].close || 1;
  return series.map((p) => ({
    date: p.date,
    value: Number((((p.close - base) / base) * 100).toFixed(2)),
  }));
}

export function toPriceSeries(series: CandlePoint[]): Array<{ date: string; value: number }> {
  return series.map((p) => ({ date: p.date, value: p.close }));
}
