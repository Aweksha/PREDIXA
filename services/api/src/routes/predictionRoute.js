import { Router } from "express";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

router.get("/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await fetch(`${AI_SERVICE_URL}/predict/${encodeURIComponent(symbol)}`);
    if (!response.ok) {
      throw new Error(`AI service returned ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Prediction error:", err.message);
    res.status(500).json({ error: "Prediction failed", details: err.message });
  }
});

export default router;
