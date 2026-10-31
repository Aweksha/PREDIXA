import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SUPPORTED_STOCKS } from "../data/supportedStocks";

const STATS = [
  { value: String(SUPPORTED_STOCKS.length), label: "US stocks covered" },
  { value: "3", label: "forecast horizons" },
  { value: "30", label: "day look-back to check forecasts" },
];

const PREVIEW_ROWS = [
  { horizon: "Next day", forecast: "$214.30", result: "Correct direction", tone: "text-up" },
  { horizon: "5 days", forecast: "Up, 62%", result: "Correct direction", tone: "text-up" },
  { horizon: "10 days", forecast: "Buy", result: "Wrong direction", tone: "text-down" },
];

function ForecastPreview() {
  return (
    <div className="preview-card">
      <div className="preview-head">
        <div>
          <div className="preview-symbol">Example stock</div>
          <div className="preview-price">$212.48</div>
        </div>
        <span className="preview-tag">Illustrative, not real data</span>
      </div>

      <svg
        className="preview-chart"
        viewBox="0 0 480 170"
        preserveAspectRatio="none"
        role="img"
        aria-label="Illustrative chart of a forecast compared with the actual price"
      >
        <defs>
          <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22c55e" stopOpacity="0.24" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[35, 85, 135].map((y) => (
          <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
        ))}
        <path
          d="M0 132 C40 124 62 138 98 118 S156 98 190 106 S250 74 288 80 S330 54 346 58 V170 H0 Z"
          fill="url(#preview-fill)"
        />
        <path
          d="M0 132 C40 124 62 138 98 118 S156 98 190 106 S250 74 288 80 S330 54 346 58"
          fill="none"
          stroke="#4ade80"
          strokeWidth="2.5"
        />
        <path
          d="M346 58 C386 44 420 40 480 22"
          fill="none"
          stroke="#fb923c"
          strokeWidth="2.5"
          strokeDasharray="6 6"
        />
        <path
          d="M346 58 C386 62 420 46 480 54"
          fill="none"
          stroke="#f5f7fb"
          strokeWidth="1.5"
        />
        <circle cx="346" cy="58" r="4" fill="#07111f" stroke="#4ade80" strokeWidth="2" />
      </svg>

      <div className="preview-legend">
        <span><i style={{ background: "#4ade80" }} />History</span>
        <span><i style={{ background: "#fb923c" }} />Forecast</span>
        <span><i style={{ background: "#f5f7fb" }} />What happened</span>
      </div>

      <div className="preview-rows">
        {PREVIEW_ROWS.map((row) => (
          <div className="preview-row" key={row.horizon}>
            <span className="text-muted">{row.horizon}</span>
            <span>{row.forecast}</span>
            <span className={row.tone}>{row.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="landing-container hero-grid">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="kicker">Open research in stock forecasting</p>
          <h1 className="hero-title">
            Stock forecasts, <span className="hero-accent">held up against reality.</span>
          </h1>
          <p className="hero-copy">
            PREDIXA runs machine learning forecasts on major US stocks, then shows
            you exactly how each one compared with what the market did next. The
            misses included.
          </p>

          <div className="hero-actions">
            <Link to="/markets" className="btn btn-lg">
              Explore stocks
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="btn btn-lg btn-ghost landing-anchor">
              How it works
            </a>
          </div>

          <dl className="hero-stats">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        >
          <ForecastPreview />
        </motion.div>
      </div>
    </section>
  );
}

export default Hero;
