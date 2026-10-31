function mapAiPredictionToFrontend(symbol, aiData) {
  const currentClose = aiData?.price_forecast?.current_close ?? null;
  const predictedNextClose = aiData?.price_forecast?.predicted_next_close ?? null;
  const expectedMovePct = aiData?.price_forecast?.expected_move_pct ?? null;

  const probUp5d = aiData?.direction?.prob_up_5d ?? null;
  const probDown5d = aiData?.direction?.prob_down_5d ?? null;

  const tenDaySignal = aiData?.ten_day_forecast?.signal ?? null;
  const tenDayProbabilities = aiData?.ten_day_forecast?.probabilities ?? null;

  let fiveDayConfidence = null;
  if (probUp5d !== null && probDown5d !== null) {
    fiveDayConfidence = Math.max(probUp5d, probDown5d);
  }

  let tenDayConfidence = null;
  if (tenDayProbabilities && typeof tenDayProbabilities === "object") {
    const values = Object.values(tenDayProbabilities)
      .map(Number)
      .filter((x) => Number.isFinite(x));

    if (values.length > 0) {
      tenDayConfidence = Math.max(...values);
    }
  }

  return {
    symbol,
    current_snapshot: {
      date: aiData?.price_forecast?.latest_date ?? null,
      current_close: currentClose,
    },
    predictions: {
      next_day: {
        expected_price: predictedNextClose,
        expected_return: expectedMovePct !== null ? expectedMovePct / 100 : null,
        confidence: typeof aiData?.confidence === "string" ? aiData.confidence : null,
      },
      five_day: {
        signal: aiData?.direction?.signal ?? null,
        prob_up: probUp5d,
        prob_down: probDown5d,
        confidence: fiveDayConfidence,
      },
      ten_day: {
        signal: tenDaySignal,
        probabilities: tenDayProbabilities,
        confidence: tenDayConfidence,
      },
    },
    signal: aiData?.direction?.signal ?? "NEUTRAL",
    signal_explanation: aiData?.summary || "Prediction generated successfully.",
    model_info: {
      prediction_type: aiData?.prediction_type ?? null,
      group: aiData?.direction?.group ?? null,
      model_route: aiData?.direction?.model_route ?? null,
    },
    raw_ai_output: aiData,
  };
}

export async function getPrediction(req, res) {
  try {
    const symbol = (req.params.symbol || req.query.symbol || "").toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const aiBaseUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const aiUrl = `${aiBaseUrl}/predict/${symbol}`;

    const response = await fetch(aiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "ai service request failed",
        details: errorText,
      });
    }

    const aiData = await response.json();
    const finalResponse = mapAiPredictionToFrontend(symbol, aiData);

    return res.json(finalResponse);
  } catch (error) {
    console.error("prediction controller error:", error);
    return res.status(500).json({ error: "failed to get prediction" });
  }
}