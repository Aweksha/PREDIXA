const PIPELINE_BASE_URL = process.env.PIPELINE_BASE_URL || "http://localhost:8001";

export async function getPipelineSymbol(req, res) {
  try {
    const symbol = String(req.params.symbol || "").toUpperCase().trim();

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const response = await fetch(`${PIPELINE_BASE_URL}/query/${symbol}`);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Pipeline request failed",
        details: text,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("getPipelineSymbol error:", error);
    return res.status(500).json({ error: "Failed to fetch pipeline data" });
  }
}