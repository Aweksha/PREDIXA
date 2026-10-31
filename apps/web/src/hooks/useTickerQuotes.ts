import { useEffect, useState } from "react";
import { SUPPORTED_STOCKS } from "../data/supportedStocks";

export type TickerQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  date: string | null;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5050").replace(/\/$/, "");

const EMPTY_QUOTES: TickerQuote[] = SUPPORTED_STOCKS.map(({ symbol }) => ({
  symbol,
  price: null,
  changePercent: null,
  date: null,
}));

// Starts with every supported symbol so the UI keeps its shape if the API is down
export function useTickerQuotes() {
  const [quotes, setQuotes] = useState<TickerQuote[]>(EMPTY_QUOTES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadQuotes() {
      try {
        const res = await fetch(`${API_BASE}/api/quotes/ticker-strip`);
        if (!res.ok) throw new Error(`ticker-strip ${res.status}`);
        const data: TickerQuote[] = await res.json();
        const bySymbol = new Map(data.map((quote) => [quote.symbol, quote]));
        if (!cancelled) {
          setQuotes(EMPTY_QUOTES.map((quote) => bySymbol.get(quote.symbol) ?? quote));
        }
      } catch (err) {
        console.error("Ticker quotes load failed:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    loadQuotes();
    // Refresh every 5 minutes — data is from DB (virtualToday), so no need for real-time polling
    const intervalId = window.setInterval(loadQuotes, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return { quotes, loaded };
}
