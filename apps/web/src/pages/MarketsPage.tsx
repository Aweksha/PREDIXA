import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import StockSearch from "../components/StockSearch";
import { SUPPORTED_STOCKS } from "../data/supportedStocks";
import type { Sector } from "../data/supportedStocks";
import { useTickerQuotes } from "../hooks/useTickerQuotes";
import type { TickerQuote } from "../hooks/useTickerQuotes";
import Footer from "../landing/Footer";
import "./LandingPage.css";
import "./MarketsPage.css";

const FILTERS: ("All" | Sector)[] = ["All", "Technology", "Consumer", "Financials", "Energy"];

function formatPercent(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function trendClass(value: number | null) {
  if (value === null || value === 0) return "text-muted";
  return value > 0 ? "text-up" : "text-down";
}

function SummaryCard({
  label,
  value,
  note,
  noteClass = "text-muted",
}: {
  label: string;
  value: string;
  note: string;
  noteClass?: string;
}) {
  return (
    <div className="market-card">
      <div className="market-card-label">{label}</div>
      <div className="market-card-value">{value}</div>
      <div className={`market-card-note ${noteClass}`}>{note}</div>
    </div>
  );
}

export default function MarketsPage() {
  const navigate = useNavigate();
  const { quotes, loaded } = useTickerQuotes();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const quoteBySymbol = useMemo(
    () => new Map<string, TickerQuote>(quotes.map((quote) => [quote.symbol, quote])),
    [quotes]
  );

  const summary = useMemo(() => {
    const priced = quotes.filter((quote) => quote.changePercent !== null);
    if (priced.length === 0) return null;
    const sorted = [...priced].sort((a, b) => b.changePercent! - a.changePercent!);
    return {
      up: priced.filter((quote) => quote.changePercent! > 0).length,
      down: priced.filter((quote) => quote.changePercent! < 0).length,
      total: priced.length,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
      date: priced[0].date,
    };
  }, [quotes]);

  const emptyNote = loaded ? "No data" : "Loading…";

  const rows = SUPPORTED_STOCKS.filter(
    (stock) => filter === "All" || stock.sector === filter
  );

  return (
    <div className="markets-page">
      <SiteHeader />

      <main>
        <section className="markets-hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="landing-container markets-hero-inner">
            <h1 className="markets-title">Markets</h1>
            <p className="markets-copy">
              Search the {SUPPORTED_STOCKS.length} stocks PREDIXA covers, or pick one
              below to see its forecasts and how they held up.
            </p>
            <StockSearch />
          </div>
        </section>

        <div className="landing-container">
          {loaded && !summary && (
            <p className="markets-notice" role="status">
              Market data is unavailable right now, so prices aren&apos;t showing.
              You can still browse the list.
            </p>
          )}

          <section className="market-cards" aria-label="Market summary">
            <SummaryCard
              label="Advancing"
              value={summary ? String(summary.up) : "--"}
              note={summary ? `of ${summary.total} stocks` : emptyNote}
            />
            <SummaryCard
              label="Declining"
              value={summary ? String(summary.down) : "--"}
              note={summary ? `of ${summary.total} stocks` : emptyNote}
            />
            <SummaryCard
              label="Top gainer"
              value={summary ? summary.best.symbol : "--"}
              note={summary ? formatPercent(summary.best.changePercent) : emptyNote}
              noteClass={summary ? trendClass(summary.best.changePercent) : "text-muted"}
            />
            <SummaryCard
              label="Top decliner"
              value={summary ? summary.worst.symbol : "--"}
              note={summary ? formatPercent(summary.worst.changePercent) : emptyNote}
              noteClass={summary ? trendClass(summary.worst.changePercent) : "text-muted"}
            />
          </section>

          <section className="stocks-panel">
            <div className="stocks-head">
              <div>
                <h2>Covered stocks</h2>
                <p className="text-muted">
                  {summary?.date
                    ? `Closing prices as of ${summary.date}, PREDIXA's working date`
                    : "Daily closing prices"}
                </p>
              </div>
              <div className="stocks-filters" role="group" aria-label="Filter by sector">
                {FILTERS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={filter === name}
                    className={`stocks-filter${filter === name ? " stocks-filter-active" : ""}`}
                    onClick={() => setFilter(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <table className="stocks-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th className="stocks-sector">Sector</th>
                  <th className="stocks-num">Price</th>
                  <th className="stocks-num">Day change</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {rows.map((stock) => {
                  const quote = quoteBySymbol.get(stock.symbol);
                  const open = () => navigate(`/dashboard/${stock.symbol}`);
                  return (
                    <tr key={stock.symbol} onClick={open}>
                      <td>
                        <button
                          type="button"
                          className="stocks-symbol"
                          onClick={(e) => {
                            e.stopPropagation();
                            open();
                          }}
                        >
                          {stock.symbol}
                        </button>
                        <span className="stocks-name">{stock.name}</span>
                      </td>
                      <td className="stocks-sector text-muted">{stock.sector}</td>
                      <td className="stocks-num">
                        {quote?.price != null ? `$${quote.price.toFixed(2)}` : "--"}
                      </td>
                      <td className={`stocks-num ${trendClass(quote?.changePercent ?? null)}`}>
                        {formatPercent(quote?.changePercent ?? null)}
                      </td>
                      <td className="stocks-arrow">
                        <ArrowRight size={16} aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
