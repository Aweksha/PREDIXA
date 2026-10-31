/**
 * Predictions Route - Fetch real model predictions from AI service
 */

import express from 'express';

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/predictions/combined - Get combined model predictions
 * Query params:
 *   - symbol: Stock ticker (required)
 *   - limit: Historical data points to use (default: 1200)
 */
router.get('/report', async (req, res) => {
  try {
    const upstream = await fetch(`${AI_SERVICE_URL}/model-report`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) throw new Error(`AI service returned ${upstream.status}`);
    res.json(await upstream.json());
  } catch (error) {
    res.status(502).json({ error: `Failed to fetch model report: ${error.message}` });
  }
});

router.get('/combined', async (req, res) => {
  try {
    const { symbol, limit = 1200 } = req.query;

    if (!symbol) {
      return res.status(400).json({
        error: 'Missing required parameter: symbol',
      });
    }

    console.log(`[Predictions] Fetching for ${symbol} from ${AI_SERVICE_URL}/predict/${symbol}`);

    // Call AI service for predictions
    const url = new URL(`${AI_SERVICE_URL}/predict/${symbol}`);
    url.searchParams.set('limit', String(limit));

    const aiResponse = await fetch(url, {
      signal: AbortSignal.timeout(60000),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI service returned ${aiResponse.status}`);
    }

    const prediction = await aiResponse.json();
    console.log(`[Predictions] AI Response:`, JSON.stringify(prediction).substring(0, 200));

    // Extract nested data from AI response
    const directionSignal = prediction.direction?.signal || 'HOLD';
    const currentClose = prediction.price_forecast?.current_close;
    const predictedNextClose = prediction.price_forecast?.predicted_next_close;
    const expectedMovePct = prediction.price_forecast?.expected_move_pct;
    const tenDaySignal = prediction.ten_day_forecast?.signal || 'HOLD';
    
    // Convert confidence string to numeric 0-1
    const confidenceMap = {
      'HIGH': 0.85,
      'MEDIUM': 0.65,
      'LOW': 0.40,
    };
    const confidenceScore = confidenceMap[prediction.confidence] || 0.5;

    // Extract probabilities from direction
    const probUp = prediction.direction?.prob_up_5d || 0;
    const probDown = prediction.direction?.prob_down_5d || 0;

    // Transform to dashboard format
    const transformed = {
      symbol: symbol.toUpperCase(),
      direction: directionSignal,
      confidence: confidenceScore,
      predictedPrice: predictedNextClose,
      currentPrice: currentClose,
      expectedMove: predictedNextClose && currentClose ? (predictedNextClose - currentClose) : null,
      expectedMovePct: expectedMovePct,
      tenDaySignal: tenDaySignal,
      probabilities: {
        prob_up_5d: probUp,
        prob_down_5d: probDown,
      },
      expectedRange: prediction.volatility_forecast
        ? {
            movePct: prediction.volatility_forecast.expected_move_pct,
            low: prediction.volatility_forecast.range_low,
            high: prediction.volatility_forecast.range_high,
          }
        : null,
      summary: prediction.summary || '',
      fetchedAt: new Date().toISOString(),
    };

    console.log(`[Predictions] Transformed response:`, JSON.stringify(transformed));
    res.json(transformed);
  } catch (error) {
    console.error('[Predictions] Error:', error.message);
    console.error('[Predictions] Full error:', error);
    
    // Return fallback neutral prediction with error info
    res.status(200).json({
      symbol: req.query.symbol?.toUpperCase() || 'N/A',
      direction: 'HOLD',
      confidence: 0.5,
      predictedPrice: null,
      currentPrice: null,
      expectedMove: null,
      expectedMovePct: null,
      tenDaySignal: 'HOLD',
      error: `Failed to fetch predictions: ${error.message}`,
      fetchedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/predictions/signal - Generate trading signal from indicators
 * Query params:
 *   - symbol: Stock ticker (required)
 *   - rsi: RSI value (0-100)
 *   - macd: MACD value
 *   - price: Current price
 *   - ma50: 50-day moving average
 *   - ma200: 200-day moving average
 */
router.get('/signal', async (req, res) => {
  try {
    const { symbol, rsi, macd, price, ma50, ma200 } = req.query;

    if (!symbol) {
      return res.status(400).json({
        error: 'Missing required parameter: symbol',
      });
    }

    // Convert to numbers
    const rsiVal = rsi ? parseFloat(rsi) : null;
    const macdVal = macd ? parseFloat(macd) : null;
    const priceVal = price ? parseFloat(price) : null;
    const ma50Val = ma50 ? parseFloat(ma50) : null;
    const ma200Val = ma200 ? parseFloat(ma200) : null;

    // Generate signal based on indicators
    let signal = 'HOLD';
    let confidence = 0.5;
    let reasons = [];

    if (rsiVal !== null) {
      if (rsiVal < 30) {
        signal = 'BUY';
        confidence = Math.min(confidence + 0.2, 1);
        reasons.push('Oversold (RSI < 30)');
      } else if (rsiVal > 70) {
        signal = 'SELL';
        confidence = Math.min(confidence + 0.2, 1);
        reasons.push('Overbought (RSI > 70)');
      }
    }

    if (macdVal !== null) {
      if (macdVal > 0 && signal !== 'SELL') {
        signal = signal === 'HOLD' ? 'BUY' : signal;
        confidence = Math.min(confidence + 0.1, 1);
        reasons.push('Positive MACD');
      } else if (macdVal < 0 && signal !== 'BUY') {
        signal = signal === 'HOLD' ? 'SELL' : signal;
        confidence = Math.min(confidence + 0.1, 1);
        reasons.push('Negative MACD');
      }
    }

    if (priceVal !== null && ma50Val !== null && ma200Val !== null) {
      if (priceVal > ma50Val && ma50Val > ma200Val) {
        if (signal === 'HOLD') signal = 'BUY';
        confidence = Math.min(confidence + 0.15, 1);
        reasons.push('Price above MAs in uptrend');
      } else if (priceVal < ma50Val && ma50Val < ma200Val) {
        if (signal === 'HOLD') signal = 'SELL';
        confidence = Math.min(confidence + 0.15, 1);
        reasons.push('Price below MAs in downtrend');
      }
    }

    res.json({
      symbol: symbol.toUpperCase(),
      signal,
      confidence: Math.round(confidence * 100) / 100,
      reasons,
      indicators: {
        rsi: rsiVal,
        macd: macdVal,
        price: priceVal,
        ma50: ma50Val,
        ma200: ma200Val,
      },
    });
  } catch (error) {
    console.error('Signal generation error:', error);
    res.status(500).json({
      error: 'Failed to generate signal',
      details: error.message,
    });
  }
});

export default router;
