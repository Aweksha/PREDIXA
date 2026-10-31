import express from "express";
import cors from "cors";
import "dotenv/config";

import predictionRoute from "./routes/predictionRoute.js";
import predictionsRoute from "./routes/predictionsRoute.js";
import quoteRoute from "./routes/quoteRoute.js";
import historyRoute from "./routes/historyRoute.js";
import trendsRoute from "./routes/trendsRoute.js";
import tickersRoute from "./routes/tickersRoute.js";
import pipelineRoute from "./routes/pipelineRoute.js";
import newsRoute from "./routes/newsRoute.js";
import fundamentalsRoute from "./routes/fundamentalsRoute.js";
import backtestRoute from "./routes/backtestRoute.js";
import evaluateRoute from "./routes/evaluateRoute.js";
import realDataRoute from "./routes/realDataRoute.js";

const app = express();

app.use(cors());
app.use(express.json());

// Real data routes must come BEFORE /api/history to avoid conflicts
app.use("/api/real-data", realDataRoute);

app.get("/", (req, res) => {
  res.send("Predixa API is running. Try /health or /api/quotes/latest?symbol=AAPL");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/quotes", quoteRoute);
app.use("/api/history", historyRoute);
app.use("/api/trends", trendsRoute);
app.use("/api/tickers", tickersRoute);
app.use("/api/predict", predictionRoute);
app.use("/api/predictions", predictionsRoute);
app.use("/api/pipeline", pipelineRoute);
app.use("/api/news", newsRoute);
app.use("/api/fundamentals", fundamentalsRoute);
app.use("/api/backtest", backtestRoute);
app.use("/api/evaluate", evaluateRoute);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 API listening on http://localhost:${PORT}`);
});