import { useEffect, useState } from "react";

export type Quote = {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
  source: "fmp" | "cache";
};

type LiveQuoteProps = {
  symbol: string;
  onLoaded?: (quote: Quote) => void;
};

export default function LiveQuote({ symbol, onLoaded }: LiveQuoteProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!symbol) return;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(
          `/api/quotes/latest?symbol=${encodeURIComponent(symbol)}`
        );

        if (!res.ok) {
          throw new Error(`API error ${res.status}`);
        }

        const data = (await res.json()) as Quote;
        setQuote(data);
        onLoaded?.(data);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };

    load();

    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [symbol, onLoaded]);

  if (loading && !quote) {
    return (
      <div className="si-priceBox">
        <div className="si-price">Loading...</div>
        <div className="si-asof">Fetching live price</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="si-priceBox">
        <div className="si-price">--</div>
        <div className="si-asof">Live quote error</div>
      </div>
    );
  }

  if (!quote) return null;

  const isPositive = quote.change >= 0;
  const badge = quote.source === "fmp" ? "LIVE" : "CACHED";

  return (
    <div className="si-priceBox">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div className="si-price">${quote.price.toFixed(2)}</div>

        <span
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: 0.6,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background:
              badge === "LIVE"
                ? "rgba(34,197,94,0.08)"
                : "rgba(148,163,184,0.08)",
            color:
              badge === "LIVE"
                ? "var(--positive, #22c55e)"
                : "var(--muted, #94a3b8)",
          }}
        >
          {badge}
        </span>
      </div>

      <div
        className="si-asof"
        style={{
          color: isPositive
            ? "var(--positive, #22c55e)"
            : "var(--negative, #ef4444)",
          fontWeight: 700,
        }}
      >
        {isPositive ? "+" : ""}
        {quote.change.toFixed(2)} ({isPositive ? "+" : ""}
        {quote.changePercent.toFixed(2)}%)
        {" • "}
        {quote.exchange}
      </div>
    </div>
  );
}