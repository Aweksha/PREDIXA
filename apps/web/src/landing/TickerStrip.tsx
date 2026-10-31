import { Link } from "react-router-dom";
import { useTickerQuotes } from "../hooks/useTickerQuotes";

function formatPrice(value: number | null) {
  if (value === null) return "--";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null) {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function sentimentLabel(changePercent: number) {
  if (changePercent > 0) return "Bullish";
  if (changePercent < 0) return "Bearish";
  return "Neutral";
}

export default function TickerStrip() {
  const { quotes } = useTickerQuotes();

  return (
    <div className="ticker-strip" aria-label="Stock ticker">
      <div className="ticker-track">
        {[...quotes, ...quotes].map((quote, index) => {
          const trendClass =
            quote.changePercent === null || quote.changePercent === 0
              ? "text-muted"
              : quote.changePercent > 0
              ? "text-up"
              : "text-down";

          return (
            <Link
              to={`/dashboard/${quote.symbol}`}
              className="ticker-chip"
              key={`${quote.symbol}-${index}`}
              tabIndex={index < quotes.length ? 0 : -1}
              aria-hidden={index >= quotes.length}
            >
              <span className="ticker-symbol">{quote.symbol}</span>
              <span className="ticker-price">{formatPrice(quote.price)}</span>
              <span className={trendClass}>{formatPercent(quote.changePercent)}</span>
              {quote.changePercent !== null && (
                <span className={`ticker-sentiment ${trendClass}`}>
                  {sentimentLabel(quote.changePercent)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
