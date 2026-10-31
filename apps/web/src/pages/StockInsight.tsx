import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createChart, CandlestickSeries, LineSeries, ColorType } from "lightweight-charts";
import type { IChartApi, IPriceLine, ISeriesApi } from "lightweight-charts";
import SiteHeader from "../components/SiteHeader";
import "./StockInsight.css";

type ForecastPoint = {
  horizonLabel: string;
  horizonDays: number;
  predictedPrice: number | null;
  actualPrice: number | null;
  predictedReturn: number | null;
  actualReturn: number | null;
  absErrorPct: number | null;
  directionCorrect: boolean | null;
  signal: "BUY" | "SELL" | "HOLD" | null;
  confidence: number | null;
};

type NewsArticle = {
  title: string;
  source: string;
  date: string;
  summary: string;
  sentiment: "bullish" | "bearish" | "neutral" | null;
};

type Fundamentals = {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  currentPrice: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: string | null;
  volume: number | null;
  avgVolume: number | null;
  pe: number | null;
  forwardPE: number | null;
  peg: number | null;
  ps: number | null;
  pb: number | null;
  evEbitda: number | null;
  evRevenue: number | null;
  enterpriseValue: string | null;
  roe: number | null;
  roa: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  grossMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  totalCash: string | null;
  totalDebt: string | null;
  freeCashflow: string | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  totalRevenue: string | null;
  beta: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAvg: number | null;
  twoHundredDayAvg: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
};

type EsgData = {
  symbol: string;
  available: boolean;
  totalEsg: number | null;
  environmentScore: number | null;
  socialScore: number | null;
  governanceScore: number | null;
  esgPerformance: string | null;
};

type BacktestData = {
  symbol: string;
  virtualToday: string;
  realToday: string;
  baseClose: number;
  forecasts: {
    nextDay: {
      predictedPrice: number | null;
      actualPrice: number | null;
      actualDate: string | null;
      absErrorPct: number | null;
      directionCorrect: boolean | null;
    };
    fiveDay: {
      predictedSignal: string;
      probUp: number;
      probDown: number;
      actualPrice: number | null;
      actualDate: string | null;
      directionCorrect: boolean | null;
    };
    tenDay: {
      predictedSignal: string;
      probabilities: Record<string, number>;
      actualPrice: number | null;
      actualDate: string | null;
      directionCorrect: boolean | null;
    };
    volatility?: {
      expectedMovePct: number;
      rangeLow: number;
      rangeHigh: number;
      actualPrice: number | null;
      actualDate: string | null;
      withinRange: boolean | null;
    };
  };
};

type ModelReport = {
  trained_through: string;
  holdout_start: string;
  holdout_end: string;
  holdout: {
    next_day: { direction_accuracy: number; baseline_majority_accuracy: number; accuracy_edge_ci: number[] };
    five_day: { accuracy: number; baseline_majority_accuracy: number; accuracy_edge_ci: number[] };
    ten_day: { accuracy: number; baseline_majority_accuracy: number; accuracy_edge_ci: number[] };
    volatility: { r2: number; r2_ci: number[]; baseline_trailing_volatility_r2: number; range_coverage: number };
  };
};

type PriceBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

type ModelPrediction = {
  symbol: string;
  direction?: string | null;
  confidence?: number | null;
  predictedPrice?: number | null;
  currentPrice?: number | null;
  expectedMove?: number | null;
  expectedMovePct?: number | null;
  tenDaySignal?: string | null;
  expectedRange?: { movePct: number; low: number; high: number } | null;
  probabilities?: {
    prob_up_5d?: number;
    prob_down_5d?: number;
  };
  summary?: string;
  error?: string;
  fetchedAt?: string;
};

type IndicatorLine = {
  date: string;
  value: number | null;
};

type PredictionEvaluationPayload = {
  symbol: string;
  realToday: string;
  virtualToday: string;
  lookbackOffsetDays: number;
  currentSnapshot: {
    date: string;
    close: number | null;
    changePercent: number | null;
    volume: number | null;
    rsi14: number | null;
    macd: number | null;
    signal: "BUY" | "SELL" | "HOLD" | null;
    confidence: number | null;
  };
  chart: {
    candles: PriceBar[];
    ma50: IndicatorLine[];
    ma200: IndicatorLine[];
    longBiasLine?: IndicatorLine[];
  };
  forecasts: {
    tomorrow: ForecastPoint;
    fiveDay: ForecastPoint;
    tenDay: ForecastPoint;
  };
};

type ChartRange = "1M" | "3M" | "1Y" | "3Y" | "5Y";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5050").replace(
    /\/$/,
    ""
  );

function formatMoney(value: number | null) {
  if (value === null) return "--";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | null, digits = 2) {
  if (value === null) return "--";
  return `${value.toFixed(digits)}%`;
}

function toSignedPercent(value: number | null) {
  if (value === null) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  // A bare YYYY-MM-DD parses as UTC, which would display as the previous day in US time zones
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function signalColor(signal: string | null) {
  if (signal === "BUY") return "var(--up)";
  if (signal === "SELL") return "var(--down)";
  if (signal === "HOLD") return "var(--hold)";
  return "var(--muted)";
}

// ---------------------------------------------------------------------------
// CandlestickChart — real interactive chart via lightweight-charts v5
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  background: "#0f1c2e",
  text: "#aab6c8",
  grid: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.1)",
  crosshair: "#7f8da1",
  crosshairLabel: "#16263b",
  up: "#22c55e",
  down: "#f87171",
  ma50: "#fb923c",
  ma200: "#aab6c8",
  asOf: "#fbbf24",
};

function CandlestickChart({
  candles,
  ma50,
  ma200,
  virtualToday,
}: {
  candles: PriceBar[];
  ma50: IndicatorLine[];
  ma200: IndicatorLine[];
  virtualToday: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ma50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const asOfLineRef = useRef<IPriceLine | null>(null);

  // The chart lives for the life of the component; range changes only swap its data
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: CHART_COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: CHART_COLORS.crosshairLabel,
        },
        horzLine: {
          color: CHART_COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: CHART_COLORS.crosshairLabel,
        },
      },
      timeScale: {
        borderColor: CHART_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 0.2,
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.up,
      downColor: CHART_COLORS.down,
      borderUpColor: CHART_COLORS.up,
      borderDownColor: CHART_COLORS.down,
      wickUpColor: CHART_COLORS.up,
      wickDownColor: CHART_COLORS.down,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ma50SeriesRef.current = chart.addSeries(LineSeries, {
      color: CHART_COLORS.ma50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ma200SeriesRef.current = chart.addSeries(LineSeries, {
      color: CHART_COLORS.ma200,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      asOfLineRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    candleSeries.setData(
      candles.map((c) => ({
        time: c.date as string,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    ma50SeriesRef.current?.setData(
      ma50
        .filter((m) => m.value !== null)
        .map((m) => ({ time: m.date as string, value: m.value as number }))
    );
    ma200SeriesRef.current?.setData(
      ma200
        .filter((m) => m.value !== null)
        .map((m) => ({ time: m.date as string, value: m.value as number }))
    );

    if (asOfLineRef.current) {
      candleSeries.removePriceLine(asOfLineRef.current);
      asOfLineRef.current = null;
    }
    const vtCandle = candles.find((c) => c.date === virtualToday) ?? candles[candles.length - 1];
    if (vtCandle) {
      asOfLineRef.current = candleSeries.createPriceLine({
        price: vtCandle.close,
        color: CHART_COLORS.asOf,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: virtualToday,
      });
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, ma50, ma200, virtualToday]);

  return <div ref={containerRef} className="si-chart" />;
}

function LoadErrorState({
  symbol,
  reason,
}: {
  symbol: string;
  reason: string | null;
}) {
  return (
    <div className="si-message si-fade">
      <h1>We couldn&apos;t load {symbol}</h1>
      <p>It may not be supported yet, or the data service may be unavailable.</p>
      {reason ? <p className="si-note">{reason}</p> : null}
      <p>
        <Link to="/markets" style={{ color: "var(--green-soft)", textDecoration: "underline" }}>
          Back to markets
        </Link>
      </p>
    </div>
  );
}

function StockSkeleton() {
  return (
    <div className="si-layout" aria-busy="true" aria-label="Loading">
      <div className="si-column">
        <div className="si-panel">
          <div className="si-skeleton" style={{ width: 120, height: 18, marginBottom: 8 }} />
          <div className="si-skeleton" style={{ width: 180, height: 34, marginBottom: 20 }} />
          <div className="si-skeleton" style={{ height: 380 }} />
        </div>
        <div className="si-panel si-skeleton-stack">
          <div className="si-skeleton" style={{ width: 100, height: 16 }} />
          <div className="si-skeleton" style={{ height: 44 }} />
          <div className="si-skeleton" style={{ height: 44 }} />
        </div>
      </div>
      <div className="si-column">
        <div className="si-panel si-skeleton-stack">
          <div className="si-skeleton" style={{ width: 110, height: 16 }} />
          <div className="si-skeleton" style={{ width: 90, height: 34 }} />
          <div className="si-skeleton" style={{ height: 48 }} />
        </div>
        <div className="si-panel si-skeleton-stack">
          <div className="si-skeleton" style={{ width: 100, height: 16 }} />
          <div className="si-skeleton" style={{ height: 22 }} />
          <div className="si-skeleton" style={{ height: 22 }} />
          <div className="si-skeleton" style={{ height: 22 }} />
          <div className="si-skeleton" style={{ height: 22 }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchShell
// ---------------------------------------------------------------------------

function SearchShell({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form className="si-search" onSubmit={onSubmit}>
      <input
        className="field"
        type="text"
        value={value}
        aria-label="Search by ticker"
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="Search ticker"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="btn">
        Analyze
      </button>
    </form>
  );
}

function LatestForecast({ prediction }: { prediction: ModelPrediction | null }) {
  if (!prediction || prediction.predictedPrice == null) return null;

  const probUp = prediction.probabilities?.prob_up_5d ?? null;
  const probDown = prediction.probabilities?.prob_down_5d ?? null;
  const fiveDay =
    probUp === null || probDown === null
      ? "--"
      : probUp >= probDown
      ? `Up, ${Math.round(probUp * 100)}%`
      : `Down, ${Math.round(probDown * 100)}%`;
  const move = toSignedPercent(prediction.expectedMovePct ?? null);

  return (
    <div className="si-panel">
      <div className="si-panel-head">
        <h2 className="si-panel-title">Latest model forecast</h2>
        <span className="si-note">Not yet checked</span>
      </div>
      <StatCell label="Latest close" value={formatMoney(prediction.currentPrice ?? null)} />
      <StatCell
        label="Next-day estimate"
        value={`${formatMoney(prediction.predictedPrice)}${move ? ` (${move})` : ""}`}
      />
      <StatCell label="5-day direction" value={fiveDay} />
      <StatCell label="10-day signal" value={prediction.tenDaySignal ?? "--"} />
      {prediction.expectedRange && (
        <StatCell
          label="Expected 10-day range"
          value={`${formatMoney(prediction.expectedRange.low)} to ${formatMoney(prediction.expectedRange.high)}`}
        />
      )}
    </div>
  );
}

function ExpectedRangeCheck({ range }: { range: NonNullable<BacktestData["forecasts"]["volatility"]> }) {
  return (
    <div className="si-panel">
      <div className="si-panel-head">
        <h2 className="si-panel-title">10-day expected range</h2>
        <span className="si-note">How far the models expected the price to move, in either direction</span>
      </div>
      <StatCell label="Expected move" value={`±${range.expectedMovePct.toFixed(1)}%`} />
      <StatCell label="Range" value={`${formatMoney(range.rangeLow)} to ${formatMoney(range.rangeHigh)}`} />
      <StatCell label="Actual price" value={formatMoney(range.actualPrice)} />
      <StatCell
        label="Stayed in range"
        value={range.withinRange === null ? "--" : range.withinRange ? "Yes" : "No"}
      />
    </div>
  );
}

function TrackRecordRow({
  label,
  score,
  baseline,
  beatsBaseline,
}: {
  label: string;
  score: string;
  baseline: string;
  beatsBaseline: boolean;
}) {
  return (
    <div className="si-track-row">
      <div className="si-row-label">{label}</div>
      <div className="si-track-score">
        {score} <span className="si-note">vs {baseline} baseline</span>
      </div>
      <div className={beatsBaseline ? "text-up" : "text-muted"}>
        {beatsBaseline ? "Beats baseline" : "No proven edge"}
      </div>
    </div>
  );
}

function ModelTrackRecord({ report }: { report: ModelReport | null }) {
  if (!report) return null;
  const { next_day: nextDay, five_day: fiveDay, ten_day: tenDay, volatility } = report.holdout;
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="si-panel">
      <div className="si-panel-head">
        <h2 className="si-panel-title">Model track record</h2>
      </div>
      <p className="si-note" style={{ margin: "0 0 8px" }}>
        Tested on {report.holdout_start} to {report.holdout_end}, across all 20 stocks. A
        result only counts if it clears the baseline after allowing for chance.
      </p>
      <TrackRecordRow
        label="Next-day direction"
        score={percent(nextDay.direction_accuracy)}
        baseline={percent(nextDay.baseline_majority_accuracy)}
        beatsBaseline={nextDay.accuracy_edge_ci[0] > 0}
      />
      <TrackRecordRow
        label="5-day direction"
        score={percent(fiveDay.accuracy)}
        baseline={percent(fiveDay.baseline_majority_accuracy)}
        beatsBaseline={fiveDay.accuracy_edge_ci[0] > 0}
      />
      <TrackRecordRow
        label="10-day signal"
        score={percent(tenDay.accuracy)}
        baseline={percent(tenDay.baseline_majority_accuracy)}
        beatsBaseline={tenDay.accuracy_edge_ci[0] > 0}
      />
      <TrackRecordRow
        label="10-day volatility"
        score={`R² ${volatility.r2.toFixed(2)}`}
        baseline={`R² ${volatility.baseline_trailing_volatility_r2.toFixed(2)}`}
        beatsBaseline={volatility.r2_ci[0] > volatility.baseline_trailing_volatility_r2}
      />
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number | null;
  max?: number;
}) {
  const width = value !== null ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div>
      <div className="si-bar-head">
        <span className="si-row-label">{label}</span>
        <span className="si-row-value">{value ?? "--"}</span>
      </div>
      <div className="si-bar-track">
        <div className="si-bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="si-row">
      <span className="si-row-label">{label}</span>
      <span className="si-row-value">{value}</span>
    </div>
  );
}

function formatConfidenceValue(value: number | null) {
  if (value === null) return "--";
  return `${Math.round(value * 100)}%`;
}

function forecastDirectionLabel(value: boolean | null) {
  if (value === null) return "--";
  return value ? "Correct" : "Wrong";
}

function ForecastCard({ point }: { point: ForecastPoint }) {
  const isSignalForecast = point.horizonDays > 1;
  const detailRows = isSignalForecast
    ? [
        ["Predicted Signal", point.signal ?? "--"],
        ["Actual Price", formatMoney(point.actualPrice)],
        ["Signal Confidence", formatConfidenceValue(point.confidence)],
        ["Actual Return", formatPercent(point.actualReturn)],
        ["Direction Match", forecastDirectionLabel(point.directionCorrect)],
        ["Model Type", "Signal Classifier"],
      ]
    : [
        ["Predicted Price", formatMoney(point.predictedPrice)],
        ["Actual Price", formatMoney(point.actualPrice)],
        ["Predicted Return", formatPercent(point.predictedReturn)],
        ["Actual Return", formatPercent(point.actualReturn)],
        ["Absolute Error", formatPercent(point.absErrorPct)],
        ["Direction", forecastDirectionLabel(point.directionCorrect)],
      ];
  const footerLabel = isSignalForecast
    ? "Evaluation"
    : point.confidence !== null
    ? "Directional Confidence"
    : "Confidence";
  const footerValue = isSignalForecast
    ? forecastDirectionLabel(point.directionCorrect)
    : formatConfidenceValue(point.confidence);

  return (
    <div className="si-panel">
      <div className="si-panel-head">
        <div>
          <h3 className="si-panel-title">{point.horizonLabel} Forecast</h3>
          <div className="si-note">{point.horizonDays} trading day horizon</div>
        </div>
        <span className="si-forecast-signal" style={{ color: signalColor(point.signal) }}>
          {point.signal ?? "--"}
        </span>
      </div>

      {detailRows.map(([label, value]) => (
        <StatCell key={label} label={label} value={value} />
      ))}
      {footerValue !== "--" && <StatCell label={footerLabel} value={footerValue} />}
    </div>
  );
}

function EvaluationSummary({
  payload,
}: {
  payload: PredictionEvaluationPayload;
}) {
  const rows = [
    payload.forecasts.tomorrow,
    payload.forecasts.fiveDay,
    payload.forecasts.tenDay,
  ];

  function modelOutput(row: ForecastPoint) {
    if (row.horizonDays > 1) return row.signal ?? "--";
    const price = formatMoney(row.predictedPrice);
    const ret = formatPercent(row.predictedReturn);
    return row.predictedPrice !== null && row.predictedReturn !== null ? `${price} (${ret})` : price;
  }

  function notes(row: ForecastPoint) {
    if (row.horizonDays > 1) return "Signal classifier";
    if (row.confidence !== null) return "Directional confidence";
    return formatPercent(row.absErrorPct);
  }

  return (
    <div className="si-panel">
      <h2 className="si-panel-title">Prediction vs Actual</h2>
      <p className="si-note" style={{ margin: "4px 0 16px" }}>
        These forecasts are generated as of the app&apos;s virtual date and
        compared against what really happened afterward.
      </p>

      <div className="si-table-wrap">
        <table className="si-table">
          <thead>
            <tr>
              {[
                "Horizon",
                "Model Output",
                "Actual Price",
                "Actual Return",
                "Confidence / Eval",
                "Direction",
                "Signal",
                "Notes",
              ].map((head) => (
                <th key={head}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.horizonLabel}>
                <td>{row.horizonLabel}</td>
                <td>{modelOutput(row)}</td>
                <td>{formatMoney(row.actualPrice)}</td>
                <td>{formatPercent(row.actualReturn)}</td>
                <td>{formatConfidenceValue(row.confidence)}</td>
                <td>{forecastDirectionLabel(row.directionCorrect)}</td>
                <td style={{ color: signalColor(row.signal) }}>{row.signal ?? "--"}</td>
                <td>{notes(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sentimentStyle(s: NewsArticle["sentiment"]) {
  if (!s) return null;
  if (s === "bullish") return { color: "var(--up)", label: "Bullish" };
  if (s === "bearish") return { color: "var(--down)", label: "Bearish" };
  return { color: "var(--muted)", label: "Neutral" };
}

function NewsCard({
  articles,
  loading,
  symbol,
}: {
  articles: NewsArticle[];
  loading: boolean;
  symbol: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="si-panel">
      <div className="si-panel-head">
        <h2 className="si-panel-title">Latest News</h2>
        <span className="si-note">
          {loading ? "Loading…" : articles.some((a) => a.sentiment) ? "Sentiment by Gemini" : ""}
        </span>
      </div>

      {loading && (
        <div className="si-skeleton-stack">
          {[1, 2, 3].map((i) => (
            <div key={i} className="si-skeleton" style={{ height: 44 }} />
          ))}
        </div>
      )}

      {!loading && articles.length === 0 && (
        <div className="si-note">No news available for {symbol}.</div>
      )}

      {!loading &&
        articles.map((item, idx) => {
          const st = sentimentStyle(item.sentiment);
          const isOpen = expanded === idx;
          return (
            <div key={idx} className="si-news-item">
              <button
                type="button"
                className="si-news-toggle"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : idx)}
              >
                <span className="si-news-title">{item.title}</span>
                <span className="si-news-meta">
                  {st && (
                    <>
                      <span style={{ color: st.color }}>{st.label}</span>
                      {" · "}
                    </>
                  )}
                  {item.source}
                  {" · "}
                  {item.date}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && item.summary && (
                  <motion.div
                    className="si-news-summary"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <p>{item.summary}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: compute MA from an array of candles
// ---------------------------------------------------------------------------
function calcMA(candles: PriceBar[], period: number): IndicatorLine[] {
  return candles.map((c, i) => {
    if (i < period - 1) return { date: c.date, value: null };
    const slice = candles.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, bar) => sum + bar.close, 0) / period;
    return { date: c.date, value: avg };
  });
}

// Helper: get cutoff date string for a given range relative to virtualToday
function getRangeCutoff(virtualToday: string, range: ChartRange): string {
  const d = new Date(virtualToday);
  switch (range) {
    case "1M":
      d.setMonth(d.getMonth() - 1);
      break;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      break;
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "3Y":
      d.setFullYear(d.getFullYear() - 3);
      break;
    case "5Y":
      d.setFullYear(d.getFullYear() - 5);
      break;
  }
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// StockInsight — main page component
// ---------------------------------------------------------------------------

export default function StockInsight() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();

  const symbol = useMemo(
    () => (routeTicker || "AAPL").toUpperCase(),
    [routeTicker]
  );

  const [searchTicker, setSearchTicker] = useState(symbol);
  const [data, setData] = useState<PredictionEvaluationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [modelPrediction, setModelPrediction] = useState<ModelPrediction | null>(null);
  const [esgData, setEsgData] = useState<EsgData | null>(null);
  const [evalSignal, setEvalSignal] = useState<"BUY" | "SELL" | "HOLD" | null>(null);
  const [evalConfidence, setEvalConfidence] = useState<number | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [modelReport, setModelReport] = useState<ModelReport | null>(null);

  // New state for real candlestick chart
  const [allCandles, setAllCandles] = useState<PriceBar[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>("3M");
  const [virtualToday, setVirtualToday] = useState<string>("");

  useEffect(() => {
    setSearchTicker(symbol);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [symbol]);

  useEffect(() => {
    fetch(`${API_BASE}/api/predictions/report`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setModelReport)
      .catch((err) => console.error("Model report load failed:", err));
  }, []);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setNewsLoading(true);
    setNewsArticles([]);
    setFundamentals(null);
    setBacktestData(null);
    setModelPrediction(null);
    setEsgData(null);
    setEvalSignal(null);
    setEvalConfidence(null);
    setUnavailableReason(null);
    setAllCandles([]);
    setVirtualToday("");

    // Single evaluate call: candles + backtest + fundamentals
    async function loadEvaluate() {
      try {
        const res = await fetch(`${API_BASE}/api/evaluate/${symbol}`);
        if (!res.ok) throw new Error(`Evaluate failed: ${res.status}`);
        const ev = await res.json();
        if (ignore) return;

        const candles: PriceBar[] = (ev.candles || []).map((c: PriceBar) => ({
          ...c,
          date: c.date.split("T")[0],
        }));

        if (candles.length === 0) throw new Error("No candles returned");

        setAllCandles(candles);
        setVirtualToday(ev.virtualToday);

        if (ev.fundamentals && !ev.fundamentals.error) {
          setFundamentals(ev.fundamentals);
        }

        if (ev.esg) {
          setEsgData(ev.esg);
        }

        // Set the decisive signal from evaluate endpoint
        const sig = ev.signal;
        if (sig === "BUY" || sig === "SELL" || sig === "HOLD") {
          setEvalSignal(sig);
        }
        if (ev.signalConfidence != null) {
          setEvalConfidence(ev.signalConfidence);
        }

        if (ev.forecasts) {
          setBacktestData({
            symbol: ev.symbol,
            virtualToday: ev.virtualToday,
            realToday: ev.realToday,
            baseClose: ev.baseClose,
            forecasts: ev.forecasts,
          });
        }

        const lastCandle = candles[candles.length - 1];
        const payload: PredictionEvaluationPayload = {
          symbol: ev.symbol,
          realToday: ev.realToday,
          virtualToday: ev.virtualToday,
          lookbackOffsetDays: 30,
          currentSnapshot: {
            date: lastCandle.date,
            close: ev.lastClose ?? lastCandle.close,
            changePercent: ev.changePercent ?? null,
            volume: ev.volume ?? lastCandle.volume ?? null,
            rsi14: null,
            macd: null,
            signal: "HOLD",
            confidence: 0.5,
          },
          chart: { candles: candles.slice(-30), ma50: [], ma200: [] },
          // Forecasts below are placeholders; displayForecasts useMemo
          // overwrites them with real backtest data when available
          forecasts: {
            tomorrow: { horizonLabel: "Tomorrow", horizonDays: 1, predictedPrice: null, actualPrice: null, predictedReturn: null, actualReturn: null, absErrorPct: null, directionCorrect: null, signal: null, confidence: null },
            fiveDay:  { horizonLabel: "5 Day",     horizonDays: 5, predictedPrice: null, actualPrice: null, predictedReturn: null, actualReturn: null, absErrorPct: null, directionCorrect: null, signal: null, confidence: null },
            tenDay:   { horizonLabel: "10 Day",    horizonDays: 10, predictedPrice: null, actualPrice: null, predictedReturn: null, actualReturn: null, absErrorPct: null, directionCorrect: null, signal: null, confidence: null },
          },
        };
        if (!ignore) setData(payload);
      } catch (err) {
        console.error("Evaluate failed:", err);
        if (!ignore) {
          setData(null);
          setUnavailableReason(
            err instanceof Error
              ? err.message
              : `${symbol} is not available in the supported Predixa stock universe.`
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    async function loadNews() {
      try {
        const res = await fetch(`${API_BASE}/api/news/${symbol}`);
        if (!res.ok) throw new Error(`News failed: ${res.status}`);
        const json = await res.json();
        if (!ignore && Array.isArray(json.articles)) setNewsArticles(json.articles);
      } catch (err) {
        console.error("News load failed:", err);
      } finally {
        if (!ignore) setNewsLoading(false);
      }
    }

    async function loadPredictions() {
      try {
        const url = `${API_BASE}/api/predictions/combined?symbol=${symbol}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Predictions failed: ${res.status}`);
        
        const json = await res.json();
        
        if (!ignore && json.symbol && !json.error) {
          setModelPrediction(json);
        }
      } catch (err) {
        console.error("[StockInsight] Predictions load failed:", err);
      }
    }

    loadEvaluate();
    loadNews();
    loadPredictions();

    return () => { ignore = true; };
  }, [symbol]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = searchTicker.trim().toUpperCase();
    if (!clean) return;
    if (clean === symbol) return;
    navigate(`/dashboard/${clean}`);
  }

  function clampScore(n: number) {
    return Math.min(99, Math.max(10, Math.round(n)));
  }

  const factorScores = useMemo(() => {
    if (!fundamentals) {
      return { quality: null, growth: null, value: null, sentiment: null };
    }
    const roe = fundamentals.roe ?? 0;
    const opMargin = fundamentals.operatingMargin ?? 0;
    const quality = clampScore(
      50 +
        Math.min(25, Math.max(-25, roe * 0.6)) +
        Math.min(25, Math.max(-25, opMargin * 0.8))
    );
    const revenueGrowth = fundamentals.revenueGrowth ?? 0;
    const earningsGrowth = fundamentals.earningsGrowth ?? 0;
    const growth = clampScore(
      50 +
        Math.min(30, Math.max(-30, revenueGrowth * 1.2)) +
        Math.min(20, Math.max(-20, earningsGrowth * 0.6))
    );
    const pe = fundamentals.pe ?? 25;
    const pb = fundamentals.pb ?? 3;
    const value = clampScore(
      90 - Math.min(40, Math.max(0, pe * 0.9)) - Math.min(20, Math.max(0, pb * 2))
    );
    const bullishCount = newsArticles.filter((a) => a.sentiment === "bullish").length;
    const bearishCount = newsArticles.filter((a) => a.sentiment === "bearish").length;
    const labelled = newsArticles.filter((a) => a.sentiment).length;
    const sentimentScore = labelled
      ? clampScore(50 + ((bullishCount - bearishCount) / labelled) * 50)
      : null;
    return { quality, growth, value, sentiment: sentimentScore };
  }, [fundamentals, newsArticles]);

  function fmtStat(val: number | null, suffix = "") {
    if (val === null) return "--";
    return `${val}${suffix}`;
  }

  // Prediction vs Actual stays on one as-of date; today's forecast has its own panel
  const displayForecasts = useMemo<PredictionEvaluationPayload["forecasts"] | null>(() => {
    if (!data) return null;
    // Forecasts are in the backtest's dividend-adjusted prices, so compare them on that basis
    const base = backtestData?.baseClose ?? data.currentSnapshot.close;

    function pctReturn(price: number | null): number | null {
      if (price === null || base === null || base === 0) return null;
      return Math.round(((price - base) / base) * 10000) / 100;
    }

    if (!backtestData) return null;

    const bt = backtestData.forecasts;
    const tenSig = bt.tenDay.predictedSignal;
    const tenSignalSafe: "BUY" | "SELL" | "HOLD" =
      tenSig === "BUY" || tenSig === "SELL" || tenSig === "HOLD" ? tenSig : "HOLD";

    return {
      tomorrow: {
        horizonLabel: "Tomorrow",
        horizonDays: 1,
        predictedPrice: bt.nextDay.predictedPrice,
        actualPrice: bt.nextDay.actualPrice,
        predictedReturn: pctReturn(bt.nextDay.predictedPrice),
        actualReturn: pctReturn(bt.nextDay.actualPrice),
        absErrorPct: bt.nextDay.absErrorPct,
        directionCorrect: bt.nextDay.directionCorrect,
        signal:
          bt.nextDay.predictedPrice !== null && base !== null
            ? bt.nextDay.predictedPrice >= base
              ? "BUY"
              : "SELL"
            : "HOLD",
        confidence: null,
      },
      fiveDay: {
        horizonLabel: "5 Day",
        horizonDays: 5,
        predictedPrice: null,
        actualPrice: bt.fiveDay.actualPrice,
        predictedReturn: null,
        actualReturn: pctReturn(bt.fiveDay.actualPrice),
        absErrorPct: null,
        directionCorrect: bt.fiveDay.directionCorrect,
        signal: bt.fiveDay.predictedSignal === "UP" ? "BUY" : "SELL",
        confidence: Math.max(bt.fiveDay.probUp, bt.fiveDay.probDown),
      },
      tenDay: {
        horizonLabel: "10 Day",
        horizonDays: 10,
        predictedPrice: null,
        actualPrice: bt.tenDay.actualPrice,
        predictedReturn: null,
        actualReturn: pctReturn(bt.tenDay.actualPrice),
        absErrorPct: null,
        directionCorrect: bt.tenDay.directionCorrect,
        signal: tenSignalSafe,
        confidence: bt.tenDay.probabilities[tenSig] ?? null,
      },
    };
  }, [backtestData, data]);

  // Compute candles for selected range
  const chartCandles = useMemo(() => {
    if (!allCandles.length || !virtualToday) return allCandles;
    const cutoff = getRangeCutoff(virtualToday, chartRange);
    return allCandles.filter((c) => c.date >= cutoff);
  }, [allCandles, virtualToday, chartRange]);

  // Compute MA50 and MA200 from ALL filtered candles (up to virtualToday)
  const chartMa50 = useMemo(() => calcMA(allCandles, 50), [allCandles]);
  const chartMa200 = useMemo(() => calcMA(allCandles, 200), [allCandles]);

  // Filter MA lines to match the range-filtered candle dates
  const visibleMa50 = useMemo(() => {
    if (!chartCandles.length) return chartMa50;
    const first = chartCandles[0].date;
    return chartMa50.filter((m) => m.date >= first && m.value !== null);
  }, [chartMa50, chartCandles]);

  const visibleMa200 = useMemo(() => {
    if (!chartCandles.length) return chartMa200;
    const first = chartCandles[0].date;
    return chartMa200.filter((m) => m.date >= first && m.value !== null);
  }, [chartMa200, chartCandles]);

  // Price display: the last candle's close, so the headline matches the chart and ticker
  const displayPrice = useMemo(() => {
    return data?.currentSnapshot.close ?? backtestData?.baseClose ?? null;
  }, [backtestData, data]);

  // Change% = compare last candle to second-to-last within virtualToday-filtered data
  const displayChangePercent = useMemo(() => {
    if (data?.currentSnapshot.changePercent != null) {
      return data.currentSnapshot.changePercent;
    }
    return null;
  }, [data]);

  // Header stays mounted across loading, error and loaded states
  function renderPage(content: React.ReactNode) {
    return (
      <div className="si-page">
        <SiteHeader>
          <SearchShell
            value={searchTicker}
            onChange={setSearchTicker}
            onSubmit={handleSubmit}
          />
        </SiteHeader>
        <main className="si-main">{content}</main>
      </div>
    );
  }

  // Guard: all hooks before early return
  if (loading || !data) {
    if (!loading && unavailableReason) {
      return renderPage(<LoadErrorState symbol={symbol} reason={unavailableReason} />);
    }
    return renderPage(<StockSkeleton />);
  }

  const activeSignal: "BUY" | "SELL" | "HOLD" = evalSignal ?? data.currentSnapshot.signal ?? "HOLD";
  const effectiveVirtualToday = virtualToday || data.virtualToday;

  return renderPage(
    <div className="si-layout si-fade">
      <div className="si-column">
        <div className="si-panel">
          <div className="si-quote-head">
            <div>
              <div className="si-symbol-row">
                <h1 className="si-symbol">{data.symbol}</h1>
                {fundamentals?.name && <span className="si-note">{fundamentals.name}</span>}
                {fundamentals?.sector && <span className="si-note">· {fundamentals.sector}</span>}
              </div>
              <div className="si-price-row">
                <span className="si-price">{formatMoney(displayPrice)}</span>
                {displayChangePercent !== null && (
                  <span className={`si-change ${displayChangePercent >= 0 ? "text-up" : "text-down"}`}>
                    {`${displayChangePercent >= 0 ? "+" : ""}${displayChangePercent.toFixed(2)}%`}
                  </span>
                )}
                {backtestData && (
                  <span className="si-note">Backtesting as of {backtestData.virtualToday}</span>
                )}
              </div>
            </div>

            {/* Range toggle buttons */}
            <div className="si-ranges">
              {(["1M", "3M", "1Y", "3Y", "5Y"] as ChartRange[]).map((label) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={chartRange === label}
                  className={`si-range${chartRange === label ? " si-range-active" : ""}`}
                  onClick={() => setChartRange(label)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="si-legend">
            <span className="si-legend-item">
              <span className="si-legend-line" style={{ background: CHART_COLORS.ma50 }} />
              MA50
            </span>
            <span className="si-legend-item">
              <span className="si-legend-line" style={{ background: CHART_COLORS.ma200 }} />
              MA200
            </span>
            <span className="si-legend-item">
              <span className="si-legend-line" style={{ background: CHART_COLORS.asOf }} />
              As-of close
            </span>
          </div>

          <CandlestickChart
            candles={chartCandles}
            ma50={visibleMa50}
            ma200={visibleMa200}
            virtualToday={effectiveVirtualToday}
          />
        </div>

        <div className="si-forecasts">
          <ForecastCard point={(displayForecasts ?? data.forecasts).tomorrow} />
          <ForecastCard point={(displayForecasts ?? data.forecasts).fiveDay} />
          <ForecastCard point={(displayForecasts ?? data.forecasts).tenDay} />
        </div>

        {backtestData?.forecasts.volatility && (
          <ExpectedRangeCheck range={backtestData.forecasts.volatility} />
        )}

        <EvaluationSummary payload={displayForecasts ? { ...data, forecasts: displayForecasts } : data} />

        <ModelTrackRecord report={modelReport} />

        <NewsCard
          articles={newsArticles}
          loading={newsLoading}
          symbol={data.symbol}
        />
      </div>

      <div className="si-column">
        {/* Single decisive signal */}
        <div className="si-panel">
          <div className="si-panel-head" style={{ marginBottom: 0 }}>
            <h2 className="si-panel-title">Model decision</h2>
            {evalConfidence != null && (
              <span className="si-note">{evalConfidence}% model probability</span>
            )}
          </div>

          <div className="si-decision" style={{ color: signalColor(activeSignal) }}>
            {activeSignal}
          </div>

          <p className="si-decision-copy">
            {activeSignal === "BUY" && "The 10-day model leans toward a rise of more than 4%."}
            {activeSignal === "SELL" && "The 10-day model leans toward a fall of more than 4%."}
            {activeSignal === "HOLD" && "The 10-day model expects a move of less than 4% either way."}
            {backtestData && (
              <>
                {" "}Next-day error:{" "}
                {backtestData.forecasts.nextDay.absErrorPct != null
                  ? `${backtestData.forecasts.nextDay.absErrorPct}%`
                  : "--"}
                {". "}5-day direction:{" "}
                {backtestData.forecasts.fiveDay.directionCorrect == null
                  ? "--"
                  : backtestData.forecasts.fiveDay.directionCorrect
                  ? "correct"
                  : "incorrect"}
                .
              </>
            )}
          </p>
          <p className="si-note" style={{ margin: "10px 0 0" }}>
            Model output for research only. Not a recommendation.
          </p>
        </div>

        <LatestForecast prediction={modelPrediction} />

        <div className="si-panel">
          <div className="si-panel-head">
            <h2 className="si-panel-title">Factor scores</h2>
          </div>
          <div className="si-bars">
            <ScoreBar label="Quality" value={factorScores.quality} />
            <ScoreBar label="Growth" value={factorScores.growth} />
            <ScoreBar label="Value" value={factorScores.value} />
            <ScoreBar label="Sentiment" value={factorScores.sentiment} />
          </div>
        </div>

        <div className="si-panel">
          <div className="si-panel-head">
            <h2 className="si-panel-title">Stats</h2>
          </div>

          <div className="si-subhead">Valuation</div>
          <StatCell label="P/E Ratio" value={fmtStat(fundamentals?.pe ?? null)} />
          <StatCell label="Fwd P/E" value={fmtStat(fundamentals?.forwardPE ?? null)} />
          <StatCell label="PEG Ratio" value={fmtStat(fundamentals?.peg ?? null)} />
          <StatCell label="P/S Ratio" value={fmtStat(fundamentals?.ps ?? null)} />
          <StatCell label="P/B Ratio" value={fmtStat(fundamentals?.pb ?? null)} />
          <StatCell label="EV/EBITDA" value={fmtStat(fundamentals?.evEbitda ?? null)} />

          <div className="si-subhead">Quality / efficiency</div>
          <StatCell label="ROE" value={fmtStat(fundamentals?.roe ?? null, "%")} />
          <StatCell label="ROA" value={fmtStat(fundamentals?.roa ?? null, "%")} />
          <StatCell label="Op. Margin" value={fmtStat(fundamentals?.operatingMargin ?? null, "%")} />
          <StatCell label="Profit Margin" value={fmtStat(fundamentals?.profitMargin ?? null, "%")} />
          <StatCell label="Gross Margin" value={fmtStat(fundamentals?.grossMargin ?? null, "%")} />

          <div className="si-subhead">Financial health</div>
          <StatCell label="D/E Ratio" value={fmtStat(fundamentals?.debtToEquity ?? null)} />
          <StatCell label="Current Ratio" value={fmtStat(fundamentals?.currentRatio ?? null)} />
          <StatCell label="Quick Ratio" value={fmtStat(fundamentals?.quickRatio ?? null)} />
          <StatCell label="Free Cash Flow" value={fundamentals?.freeCashflow ?? "--"} />
          <StatCell label="Total Revenue" value={fundamentals?.totalRevenue ?? "--"} />

          <div className="si-subhead">Risk &amp; market</div>
          <StatCell label="Beta" value={fmtStat(fundamentals?.beta ?? null)} />
          <StatCell label="Market Cap" value={fundamentals?.marketCap ?? "--"} />
          <StatCell label="52W High" value={fmtStat(fundamentals?.fiftyTwoWeekHigh ?? null)} />
          <StatCell label="52W Low" value={fmtStat(fundamentals?.fiftyTwoWeekLow ?? null)} />
          <StatCell label="Rev. Growth" value={fmtStat(fundamentals?.revenueGrowth ?? null, "%")} />
        </div>

        {fundamentals && (
          <div className="si-panel">
            <div className="si-panel-head">
              <h2 className="si-panel-title">Company</h2>
            </div>
            {fundamentals.name && <StatCell label="Name" value={fundamentals.name} />}
            {fundamentals.sector && <StatCell label="Sector" value={fundamentals.sector} />}
            {fundamentals.industry && <StatCell label="Industry" value={fundamentals.industry} />}
            {fundamentals.dividendYield !== null && (
              <StatCell label="Div. Yield" value={fmtStat(fundamentals.dividendYield, "%")} />
            )}
          </div>
        )}

        {/* ESG Score card */}
        {esgData?.available && (
        <div className="si-panel">
          <div className="si-panel-head">
            <h2 className="si-panel-title">ESG score</h2>
            {esgData?.esgPerformance && (
              <span className="si-note">Peer: {esgData.esgPerformance}</span>
            )}
          </div>
          <div className="si-bars">
            <ScoreBar label="Total ESG" value={esgData.totalEsg} max={50} />
            <ScoreBar label="Environment" value={esgData.environmentScore} max={20} />
            <ScoreBar label="Social" value={esgData.socialScore} max={20} />
            <ScoreBar label="Governance" value={esgData.governanceScore} max={20} />
          </div>
        </div>
        )}

        <div className="si-panel">
          <div className="si-panel-head">
            <h2 className="si-panel-title">Virtual date snapshot</h2>
          </div>
          <StatCell label="Real today" value={formatDate(data.realToday)} />
          <StatCell label="App today" value={formatDate(effectiveVirtualToday)} />
          <StatCell label="Time shift" value={`${data.lookbackOffsetDays} days`} />
          <StatCell label="Virtual close" value={formatMoney(displayPrice)} />
          <StatCell label="Signal" value={activeSignal} />
        </div>
      </div>
    </div>
  );
}
