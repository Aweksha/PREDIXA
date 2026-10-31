import { Brain, ChartCandlestick, Gauge, History, Newspaper, Target } from "lucide-react";
import Reveal from "./Reveal";

const FEATURES = [
  {
    icon: Target,
    title: "Three forecast horizons",
    text: "A next-day price estimate, a 5-day direction probability and a 10-day buy, hold or sell signal.",
  },
  {
    icon: History,
    title: "Prediction vs actual",
    text: "Forecasts are made as of a past date, so you can see right away whether each one held up.",
  },
  {
    icon: ChartCandlestick,
    title: "Interactive price charts",
    text: "Candlesticks with 50-day and 200-day moving averages, from one month up to five years.",
  },
  {
    icon: Newspaper,
    title: "News with sentiment",
    text: "Recent headlines for each stock, labelled bullish, bearish or neutral by Gemini.",
  },
  {
    icon: Gauge,
    title: "Fundamentals at a glance",
    text: "Valuation, profitability, financial health and risk metrics, plus simple factor scores.",
  },
  {
    icon: Brain,
    title: "Expected price range",
    text: "How far a stock is likely to move over 10 days. This is where the models most clearly beat a simple baseline in testing.",
  },
];

function Features() {
  return (
    <section id="features" className="landing-section">
      <div className="landing-container">
        <Reveal className="section-head">
          <p className="kicker">Features</p>
          <h2 className="section-title">Everything about a stock, on one page</h2>
          <p className="section-copy">
            Each stock page brings the forecast together with the context you need
            to question it.
          </p>
        </Reveal>

        <div className="feature-grid">
          {FEATURES.map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={(index % 3) * 0.06} className="feature-card">
              <span className="feature-icon">
                <Icon size={19} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Features;
