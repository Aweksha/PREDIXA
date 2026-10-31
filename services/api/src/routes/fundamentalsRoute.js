import express from 'express';

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const upstream = await fetch(`${AI_SERVICE_URL}/fundamentals/${encodeURIComponent(symbol)}`);
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error('Fundamentals proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch fundamentals', details: err.message });
  }
});

export default router;
