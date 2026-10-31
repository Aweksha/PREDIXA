import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Settings,
  Bell,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

const WATCHLIST = ["AAPL", "MSFT", "TSLA", "NVDA", "AMZN", "GOOGL", "META", "SPY"];

const DAY_FORECAST = [
  { day: "Day 1", price: "$243.10", change: "+1.82%" },
  { day: "Day 2", price: "$243.38", change: "+$4.35" },
  { day: "Day 3", price: "$243.10", change: "+1.82%" },
  { day: "Day 5", price: "$243.25", change: "+1.82%" },
];

const TIMELINE = [
  { label: "D-10", tone: "hold" },
  { label: "D-9", tone: "hold" },
  { label: "D-8", tone: "hold" },
  { label: "D-7", tone: "hold" },
  { label: "D-6", tone: "hold" },
  { label: "BUY", tone: "buy" },
  { label: "D-5", tone: "hold" },
  { label: "D-4", tone: "sell" },
  { label: "D-3", tone: "sell" },
  { label: "D-2", tone: "sell" },
  { label: "D-1", tone: "sell" },
];

const STATS = {
  valuation: [
    ["P/E", "18.60"],
    ["PEG", "1.25"],
    ["P/S", "12.92"],
    ["EV/EBITDA", "1.34"],
  ] as [string, string][],
  quality: [
    ["P/EG/Efficiency", "77.6%"],
    ["PEG/Efficiency", "48.6%"],
    ["Quality/Efficiency", "13.2%"],
  ] as [string, string][],
  financial: [
    ["PEG Score", "8.75%"],
    ["Financial Health", "3.36%"],
    ["Financial Health", "3.65%"],
  ] as [string, string][],
  factor: [
    ["ESG Score", "1.82%"],
    ["PEG Ratio", "2.98%"],
    ["SMA Model", "1.76%"],
  ] as [string, string][],
};

const NEWS = [
  "TSLA's track strength appeal marks trading.",
  "TSLA news headlines marks face reads.",
  "TSLA 10-summation to marks from state.",
];

function toneStyles(tone: "buy" | "sell" | "hold") {
  if (tone === "buy") {
    return {
      border: "1px solid rgba(29, 209, 161, 0.45)",
      background: "rgba(29, 209, 161, 0.12)",
      color: "#22e6b8",
      shadow: "0 0 18px rgba(29, 209, 161, 0.18)",
    };
  }

  if (tone === "sell") {
    return {
      border: "1px solid rgba(255, 107, 129, 0.45)",
      background: "rgba(255, 107, 129, 0.12)",
      color: "#ff7f97",
      shadow: "0 0 18px rgba(255, 107, 129, 0.14)",
    };
  }

  return {
    border: "1px solid rgba(246, 196, 83, 0.4)",
    background: "rgba(246, 196, 83, 0.12)",
    color: "#f6c453",
    shadow: "0 0 16px rgba(246, 196, 83, 0.12)",
  };
}

function Card({
  title,
  right,
  children,
  className,
  padded = true,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: React.CSSProperties;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(24,29,39,0.92), rgba(14,17,24,0.98))",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 18,
        boxShadow:
          "0 8px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)",
        overflow: "hidden",
        ...className,
      }}
    >
      {(title || right) && (
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#f3f6fb",
            }}
          >
            {title}
          </div>
          {right}
        </div>
      )}

      <div style={{ padding: padded ? 14 : 0 }}>{children}</div>
    </div>
  );
}

function ScoreRing({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (value / 100) * circumference;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        minWidth: 72,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 74,
          height: 74,
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width="74" height="74" viewBox="0 0 74 74">
          <circle
            cx="37"
            cy="37"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="8"
          />
          <circle
            cx="37"
            cy="37"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 37 37)"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>

        <div
          style={{
            position: "absolute",
            fontFamily:
              '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "#f7f9fc",
          }}
        >
          {value}
        </div>
      </div>

      <div
        style={{
          fontSize: "0.78rem",
          color: "rgba(214,223,236,0.75)",
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function StatGroup({
  title,
  color,
  rows,
}: {
  title: string;
  color: string;
  rows: [string, string][];
}) {
  return (
    <div>
      <div
        style={{
          color,
          fontSize: "0.8rem",
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map(([label, value]) => (
          <div
            key={`${title}-${label}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "5px 0",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                color: "rgba(208,217,230,0.74)",
                fontSize: "0.84rem",
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily:
                  '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
                color: "#f4f7fb",
                fontWeight: 700,
                fontSize: "0.88rem",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeButton({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        border: active
          ? "1px solid rgba(69, 143, 255, 0.75)"
          : "1px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(69,143,255,0.12)" : "rgba(255,255,255,0.03)",
        color: active ? "#8db7ff" : "#d2dae7",
        borderRadius: 10,
        padding: "7px 11px",
        cursor: "pointer",
        fontFamily:
          '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
        fontSize: "0.8rem",
      }}
    >
      {label}
    </button>
  );
}

function MainChart() {
  return (
    <div
      style={{
        position: "relative",
        height: 300,
        borderRadius: 14,
        overflow: "hidden",
        background:
          "linear-gradient(180deg, rgba(12,15,20,0.92), rgba(10,12,16,0.98))",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <svg
        viewBox="0 0 980 300"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        {[...Array(6)].map((_, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={26 + i * 46}
            x2="980"
            y2={26 + i * 46}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {[...Array(14)].map((_, i) => (
          <line
            key={`v-${i}`}
            x1={28 + i * 70}
            y1="0"
            x2={28 + i * 70}
            y2="300"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="1"
          />
        ))}

        <path
          d="M40 140 C110 116, 180 110, 250 120 S390 164, 470 136 S610 88, 700 96 S840 148, 940 118"
          fill="rgba(144, 99, 255, 0.16)"
          stroke="rgba(144, 99, 255, 0.45)"
          strokeWidth="2"
        />
        <path
          d="M40 188 C110 170, 180 166, 250 170 S390 208, 470 184 S610 138, 700 146 S840 202, 940 178"
          fill="none"
          stroke="rgba(144, 99, 255, 0.45)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />

        {[
          { x: 60, open: 118, close: 138, high: 152, low: 106, up: true },
          { x: 92, open: 138, close: 130, high: 144, low: 122, up: false },
          { x: 124, open: 130, close: 154, high: 168, low: 126, up: true },
          { x: 156, open: 154, close: 146, high: 160, low: 140, up: false },
          { x: 188, open: 146, close: 172, high: 180, low: 142, up: true },
          { x: 220, open: 172, close: 184, high: 192, low: 164, up: true },
          { x: 252, open: 184, close: 176, high: 188, low: 168, up: false },
          { x: 284, open: 176, close: 196, high: 208, low: 170, up: true },
          { x: 316, open: 196, close: 208, high: 218, low: 188, up: true },
          { x: 348, open: 208, close: 202, high: 214, low: 194, up: false },
          { x: 380, open: 202, close: 228, high: 236, low: 196, up: true },
          { x: 412, open: 228, close: 220, high: 232, low: 214, up: false },
          { x: 444, open: 220, close: 238, high: 246, low: 212, up: true },
          { x: 476, open: 238, close: 246, high: 252, low: 228, up: true },
          { x: 508, open: 246, close: 240, high: 250, low: 232, up: false },
          { x: 540, open: 240, close: 252, high: 262, low: 234, up: true },
          { x: 572, open: 252, close: 266, high: 272, low: 244, up: true },
          { x: 604, open: 266, close: 260, high: 270, low: 252, up: false },
          { x: 636, open: 260, close: 248, high: 264, low: 238, up: false },
          { x: 668, open: 248, close: 236, high: 252, low: 228, up: false },
          { x: 700, open: 236, close: 250, high: 258, low: 230, up: true },
          { x: 732, open: 250, close: 262, high: 270, low: 244, up: true },
          { x: 764, open: 262, close: 258, high: 266, low: 250, up: false },
          { x: 796, open: 258, close: 272, high: 278, low: 252, up: true },
          { x: 828, open: 272, close: 286, high: 292, low: 264, up: true },
          { x: 860, open: 286, close: 282, high: 290, low: 274, up: false },
          { x: 892, open: 282, close: 294, high: 300, low: 278, up: true },
        ].map((candle, index) => {
          const color = candle.up ? "#26a69a" : "#ef5350";
          return (
            <g key={index}>
              <line
                x1={candle.x}
                y1={300 - candle.high}
                x2={candle.x}
                y2={300 - candle.low}
                stroke={color}
                strokeWidth="2"
              />
              <rect
                x={candle.x - 8}
                y={300 - Math.max(candle.open, candle.close)}
                width="16"
                height={Math.max(6, Math.abs(candle.open - candle.close))}
                fill={color}
                rx="2"
              />
            </g>
          );
        })}

        <path
          d="M36 210 C130 202, 220 184, 310 164 S460 142, 560 128 S740 118, 940 78"
          fill="none"
          stroke="#4fd6ff"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 8px rgba(79,214,255,0.4))" }}
        />
        <path
          d="M36 238 C150 232, 260 220, 370 204 S560 178, 700 162 S860 144, 940 132"
          fill="none"
          stroke="#ef4fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 8px rgba(239,79,255,0.22))" }}
        />
        <line
          x1="820"
          y1="0"
          x2="820"
          y2="300"
          stroke="rgba(255,255,255,0.35)"
          strokeDasharray="4 4"
        />
        <line
          x1="0"
          y1="112"
          x2="980"
          y2="112"
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="4 4"
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          fontSize: "clamp(3.5rem, 10vw, 7rem)",
          fontWeight: 900,
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.025)",
        }}
      >
        PREDIXA
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          top: 72,
          width: 165,
          background: "rgba(18,22,30,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "10px 12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
          fontSize: "0.76rem",
          color: "#dde5f1",
          lineHeight: 1.65,
        }}
      >
        <div>Price: $243.10</div>
        <div>Date: Apr 18, 2026</div>
        <div>Volume: 123.35M</div>
        <div>Beta Position: 13.50</div>
        <div>MA Trend: +1.85%</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [ticker, setTicker] = useState("TSLA");
  const [search, setSearch] = useState("TSLA • Tesla, Inc.");
  const activeSignal = useMemo(() => "BUY" as const, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(22,28,40,0.88) 0%, #0a0a0a 44%, #070809 100%)",
        color: "#fff",
        padding: 14,
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(76,214,255,0.03), transparent 25%, transparent 75%, rgba(29,209,161,0.02))",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 1400,
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr) auto",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: "linear-gradient(135deg, #1dd1a1, #4fd6ff)",
                boxShadow: "0 0 14px rgba(29,209,161,0.25)",
              }}
            />
            <div
              style={{
                fontWeight: 900,
                fontSize: "2rem",
                lineHeight: 1,
                color: "#8ef0cb",
              }}
            >
              PREDIXA
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              padding: "10px 12px",
              boxShadow: "0 0 0 1px rgba(79,214,255,0.14), 0 0 28px rgba(79,214,255,0.08)",
            }}
          >
            <Search size={16} color="#8ea4bf" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#f5f7fb",
                fontSize: "1rem",
                fontFamily:
                  '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
              }}
            />
            <button
              style={{
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 800,
                color: "#fff",
                cursor: "pointer",
                background: "linear-gradient(135deg, #242b39, #1c2230)",
                boxShadow: "0 0 16px rgba(79,214,255,0.12)",
              }}
            >
              Analyze
            </button>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "#d8dfeb",
                cursor: "pointer",
              }}
            >
              <Bell size={16} />
            </button>
            <button
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "#d8dfeb",
                cursor: "pointer",
              }}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {WATCHLIST.map((item) => (
            <button
              key={item}
              onClick={() => setTicker(item)}
              style={{
                border:
                  ticker === item
                    ? "1px solid rgba(29,209,161,0.5)"
                    : "1px solid rgba(255,255,255,0.08)",
                background:
                  ticker === item
                    ? "rgba(29,209,161,0.12)"
                    : "rgba(255,255,255,0.03)",
                color: ticker === item ? "#8ef0cb" : "#edf2f9",
                borderRadius: 999,
                padding: "7px 14px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {item}
            </button>
          ))}
          <button
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "#d8dfeb",
              cursor: "pointer",
              fontSize: "1.1rem",
            }}
          >
            +
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) 300px",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <Card padded={false}>
                <div style={{ padding: 12 }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "rgba(214,223,236,0.72)",
                      marginBottom: 8,
                    }}
                  >
                    OVERALL SIGNAL
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {(["BUY", "SELL", "HOLD"] as const).map((item) => {
                      const active = item === activeSignal;
                      const styles = toneStyles(
                        item.toLowerCase() as "buy" | "sell" | "hold"
                      );
                      return (
                        <motion.div
                          key={item}
                          animate={
                            active
                              ? {
                                  boxShadow: [
                                    "0 0 0 rgba(29,209,161,0)",
                                    "0 0 20px rgba(29,209,161,0.18)",
                                    "0 0 0 rgba(29,209,161,0)",
                                  ],
                                }
                              : {}
                          }
                          transition={{ duration: 2.4, repeat: Infinity }}
                          style={{
                            ...styles,
                            textAlign: "center",
                            borderRadius: 12,
                            padding: "12px 8px",
                            fontWeight: 800,
                          }}
                        >
                          {item}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <Card padded={false}>
                <div style={{ padding: 12 }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "rgba(214,223,236,0.72)",
                      marginBottom: 8,
                    }}
                  >
                    {ticker} PRICE
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                    <div
                      style={{
                        fontSize: "2.2rem",
                        fontWeight: 900,
                        color: "#f5f7fb",
                      }}
                    >
                      $243.10
                    </div>
                    <div style={{ color: "#1dd1a1", fontWeight: 700 }}>+1.82%</div>
                    <div style={{ color: "#1dd1a1", fontWeight: 700 }}>+$4.35</div>
                  </div>
                </div>
              </Card>

              <Card padded={false}>
                <div style={{ padding: 12 }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "rgba(214,223,236,0.72)",
                      marginBottom: 8,
                    }}
                  >
                    5-DAY FORECAST
                  </div>
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: 900,
                      color: "#8ef0cb",
                    }}
                  >
                    +1.82%
                  </div>
                  <div style={{ marginTop: 6, color: "rgba(214,223,236,0.78)" }}>
                    Target price: $243.10
                  </div>
                </div>
              </Card>

              <Card padded={false}>
                <div style={{ padding: 12 }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "rgba(214,223,236,0.72)",
                      marginBottom: 8,
                    }}
                  >
                    MODEL STATUS
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#8ef0cb",
                      fontWeight: 800,
                    }}
                  >
                    <ShieldCheck size={16} />
                    Healthy
                  </div>
                  <div style={{ marginTop: 8, color: "rgba(214,223,236,0.78)" }}>
                    Target window active
                  </div>
                </div>
              </Card>
            </div>

            <Card
              title="60-Day Candlestick • Bollinger Bands • SMA 5 / 20"
              right={
                <div style={{ display: "flex", gap: 8 }}>
                  <TimeButton label="Candlestick" active />
                  <TimeButton label="Toggle" />
                </div>
              }
            >
              <MainChart />
            </Card>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.15fr 1fr",
                gap: 12,
              }}
            >
              <Card title="5-Day Price Forecast">
                <div
                  style={{
                    height: 76,
                    borderRadius: 12,
                    overflow: "hidden",
                    background:
                      "linear-gradient(180deg, rgba(15,18,24,0.9), rgba(11,14,18,0.98))",
                    border: "1px solid rgba(255,255,255,0.05)",
                    marginBottom: 12,
                  }}
                >
                  <svg
                    viewBox="0 0 520 76"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M20 52 C100 48, 170 40, 260 34 S390 22, 500 14"
                      fill="none"
                      stroke="#9e6dff"
                      strokeWidth="3"
                    />
                    <circle cx="330" cy="26" r="5" fill="#9e6dff" />
                  </svg>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                  }}
                >
                  {DAY_FORECAST.map((item) => (
                    <div
                      key={item.day}
                      style={{
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.07)",
                        background: "rgba(255,255,255,0.03)",
                        padding: 12,
                      }}
                    >
                      <div style={{ color: "rgba(214,223,236,0.72)", fontSize: "0.78rem" }}>
                        {item.day}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontWeight: 900,
                          color: "#f5f7fb",
                          fontSize: "1.15rem",
                        }}
                      >
                        {item.price}
                      </div>
                      <div style={{ marginTop: 6, color: "#8ef0cb", fontSize: "0.8rem" }}>
                        {item.change}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="10-Day Buy / Hold / Sell Signal Timeline">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(11, 1fr)",
                    gap: 8,
                  }}
                >
                  {TIMELINE.map((item, idx) => {
                    const styles = toneStyles(item.tone as "buy" | "sell" | "hold");
                    return (
                      <div
                        key={`${item.label}-${idx}`}
                        style={{
                          ...styles,
                          textAlign: "center",
                          borderRadius: 10,
                          padding: "10px 4px",
                          fontFamily:
                            '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              <Card title="Momentum Indicators">
                <div style={{ display: "grid", gap: 10 }}>
                  <StatCell label="RSI" value="52%" />
                  <StatCell label="MACD Hist" value="-0.00" />
                  <StatCell label="BB Position" value="BB Position" />
                  <StatCell label="MA Trend" value="MA Trend" />
                </div>
              </Card>

              <Card title="Risk Metrics">
                <div style={{ display: "grid", gap: 10 }}>
                  <StatCell label="Beta" value="0.443" />
                  <StatCell label="Sharpe Ratio" value="0.36" />
                  <StatCell label="Annual Vol" value="21.83M" />
                </div>
              </Card>

              <Card title={`${ticker} · Apr 18, 2026`}>
                <div style={{ display: "grid", gap: 10 }}>
                  <StatCell label="SMA 50" value="SMA 50" />
                  <StatCell label="SMA 20" value="SMA 20" />
                  <StatCell label="Model Win Rate" value="71%" />
                </div>
              </Card>
            </div>

            <Card title="Signal Rationale — Why [BUY]?">
              <div
                style={{
                  color: "rgba(214,223,236,0.84)",
                  lineHeight: 1.7,
                  fontSize: "0.92rem",
                }}
              >
                • The AI reasoning is over {ticker}/UV product slanted by rating live.
                <br />
                • The AI reasoning represented metadata in forecasting more numerous but with line recreation.
                <br />
                • 4–5 clear, rationale — how [BUY] is aligned across trend, breadth, and model structure.
                <br />
                • 4–5 clear, rationale — why [BUY] remains favored into the crystal rotation setup.
              </div>
            </Card>
          </div>

          <Card title="STATS">
            <div style={{ display: "grid", gap: 18 }}>
              <StatGroup title="Valuation" color="#d184ff" rows={STATS.valuation} />
              <StatGroup
                title="Quality/Efficiency"
                color="#ff79c6"
                rows={STATS.quality}
              />
              <StatGroup
                title="Financial Health"
                color="#9e7dff"
                rows={STATS.financial}
              />
              <StatGroup title="Factor Model" color="#f6c453" rows={STATS.factor} />

              <div
                style={{
                  paddingTop: 6,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#f5f7fb",
                    marginBottom: 10,
                  }}
                >
                  ESG score &gt;170%
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                  }}
                >
                  {[8.0, 7.0, 8.0, 7.5, 8.5].map((value, idx) => (
                    <div key={idx}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          color: "rgba(214,223,236,0.74)",
                          fontSize: "0.78rem",
                          marginBottom: 4,
                        }}
                      >
                        <span>Sub-Rating</span>
                        <span>{value.toFixed(1)}</span>
                      </div>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${value * 10}%`,
                            height: "100%",
                            background:
                              "linear-gradient(90deg, #1dd1a1, #8ef0cb)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                    fontFamily:
                      '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
                    fontSize: "0.82rem",
                  }}
                >
                  <span style={{ color: "#8ef0cb" }}>E: A+</span>
                  <span style={{ color: "#f6c453" }}>S: B-</span>
                  <span style={{ color: "#d184ff" }}>G: A</span>
                </div>
              </div>

              <div
                style={{
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{
                    color: "#f5f7fb",
                    fontWeight: 800,
                    marginBottom: 10,
                  }}
                >
                  Latest News
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {NEWS.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        color: "rgba(214,223,236,0.78)",
                        fontSize: "0.88rem",
                        lineHeight: 1.55,
                      }}
                    >
                      <ChevronRight size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div style={{ color: "rgba(209,218,230,0.74)", fontSize: "0.84rem" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily:
            '"JetBrains Mono", "IBM Plex Mono", "Fira Code", monospace',
          color: "#f4f7fb",
          fontWeight: 700,
          fontSize: "0.88rem",
        }}
      >
        {value}
      </div>
    </div>
  );
}