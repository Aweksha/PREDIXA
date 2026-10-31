/**
 * Data transformation utilities for converting real API data 
 * to the format expected by StockInsight component
 */

import { PriceBar, IndicatorLine, PredictionEvaluationPayload, ForecastPoint } from '../pages/StockInsight';

/**
 * Calculate simple moving average
 */
function calculateMA(prices: number[], period: number): (number | null)[] {
  const ma: (number | null)[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ma.push(null);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(sum / period);
    }
  }
  
  return ma;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      rsi.push(null);
      continue;
    }
    
    const changes = [];
    for (let j = i - period; j < i; j++) {
      changes.push(prices[j + 1] - prices[j]);
    }
    
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    
    const rs = losses === 0 ? 100 : gains / losses;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices: number[]): (number | null)[] {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  return ema12.map((v12, i) => {
    if (v12 === null || ema26[i] === null) return null;
    return v12 - ema26[i];
  });
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(prices: number[], period: number): (number | null)[] {
  const ema: (number | null)[] = [];
  const k = 2 / (period + 1);
  
  // Start with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let emaValue = sum / period;
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ema.push(null);
    } else if (i === period - 1) {
      ema.push(emaValue);
    } else {
      emaValue = prices[i] * k + emaValue * (1 - k);
      ema.push(emaValue);
    }
  }
  
  return ema;
}

/**
 * Transform real OHLCV data to PriceBar format
 */
export function transformOHLCVData(
  ohlcvData: any[],
  lookbackDays: number = 60
): PriceBar[] {
  return ohlcvData
    .slice(-lookbackDays)
    .map(bar => ({
      date: bar.date || bar.Date,
      open: Number(bar.open || bar.Open),
      high: Number(bar.high || bar.High),
      low: Number(bar.low || bar.Low),
      close: Number(bar.close || bar.Close),
      volume: bar.volume ? Number(bar.volume) : undefined,
    }));
}

/**
 * Generate indicator lines from OHLCV data
 */
export function generateIndicatorLines(ohlcvData: PriceBar[]): {
  ma50: IndicatorLine[];
  ma200: IndicatorLine[];
} {
  const closePrices = ohlcvData.map(b => b.close);
  
  const ma50Values = calculateMA(closePrices, 50);
  const ma200Values = calculateMA(closePrices, 200);
  
  return {
    ma50: ohlcvData.map((bar, i) => ({
      date: bar.date,
      value: ma50Values[i],
    })),
    ma200: ohlcvData.map((bar, i) => ({
      date: bar.date,
      value: ma200Values[i],
    })),
  };
}

/**
 * Calculate technical metrics for current snapshot
 */
export function calculateCurrentMetrics(ohlcvData: PriceBar[]): {
  rsi14: number | null;
  macd: number | null;
  changePercent: number | null;
} {
  if (ohlcvData.length < 26) {
    return { rsi14: null, macd: null, changePercent: null };
  }
  
  const closePrices = ohlcvData.map(b => b.close);
  const rsiValues = calculateRSI(closePrices, 14);
  const macdValues = calculateMACD(closePrices);
  
  const latestClose = closePrices[closePrices.length - 1];
  const previousClose = closePrices[closePrices.length - 2];
  const changePercent = ((latestClose - previousClose) / previousClose) * 100;
  
  return {
    rsi14: rsiValues[rsiValues.length - 1],
    macd: macdValues[macdValues.length - 1],
    changePercent: Math.round(changePercent * 100) / 100,
  };
}

/**
 * Generate signal based on indicators
 */
export function generateSignal(
  rsi: number | null,
  macd: number | null,
  closePrice: number,
  ma50: number | null,
  ma200: number | null
): { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number } {
  let score = 50; // Start neutral
  
  // RSI signals
  if (rsi !== null) {
    if (rsi < 30) {
      score += 15; // Oversold - BUY signal
    } else if (rsi > 70) {
      score -= 15; // Overbought - SELL signal
    }
  }
  
  // MACD signals
  if (macd !== null) {
    if (macd > 0) {
      score += 10; // Positive MACD - BUY signal
    } else {
      score -= 10; // Negative MACD - SELL signal
    }
  }
  
  // Moving average signals
  if (ma50 !== null && ma200 !== null) {
    if (closePrice > ma50 && ma50 > ma200) {
      score += 10; // Uptrend - BUY signal
    } else if (closePrice < ma50 && ma50 < ma200) {
      score -= 10; // Downtrend - SELL signal
    }
  }
  
  // Determine signal
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (score > 65) signal = 'BUY';
  else if (score < 35) signal = 'SELL';
  
  // Confidence based on distance from neutral
  const confidence = Math.min(1, Math.abs(score - 50) / 50);
  
  return { signal, confidence: Math.round(confidence * 100) / 100 };
}

/**
 * Generate mock forecast data (for demonstration)
 * In production, this should use the AI service
 */
export function generateForecastData(
  lastPrice: number,
  volatility: number = 0.02
): {
  tomorrow: ForecastPoint;
  fiveDay: ForecastPoint;
  tenDay: ForecastPoint;
} {
  const generateForecast = (days: number, label: string): ForecastPoint => {
    const predictedPrice = lastPrice * (1 + (Math.random() - 0.5) * volatility * days);
    const actualPrice = lastPrice * (1 + (Math.random() - 0.5) * volatility * days * 0.8);
    
    return {
      horizonLabel: label,
      horizonDays: days,
      predictedPrice: Math.round(predictedPrice * 100) / 100,
      actualPrice: Math.round(actualPrice * 100) / 100,
      predictedReturn: Math.round(((predictedPrice - lastPrice) / lastPrice) * 100 * 100) / 100,
      actualReturn: Math.round(((actualPrice - lastPrice) / lastPrice) * 100 * 100) / 100,
      absErrorPct: Math.abs(predictedPrice - actualPrice) / actualPrice,
      directionCorrect: (predictedPrice - lastPrice) * (actualPrice - lastPrice) > 0,
      signal: Math.random() > 0.5 ? 'BUY' : 'HOLD',
      confidence: Math.round(Math.random() * 100) / 100,
    };
  };
  
  return {
    tomorrow: generateForecast(1, 'Tomorrow'),
    fiveDay: generateForecast(5, '5 Day'),
    tenDay: generateForecast(10, '10 Day'),
  };
}

/**
 * Transform real data to PredictionEvaluationPayload format
 * This is the main transformation function for StockInsight component
 */
export function transformRealDataToPayload(
  symbol: string,
  ohlcvData: any[],
  quoteData: any = null,
  topSymbols: any[] = null
): PredictionEvaluationPayload {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const formattedToday = today.toISOString().split('T')[0];
  const formattedYesterday = yesterday.toISOString().split('T')[0];
  
  // Transform OHLCV data
  const candles = transformOHLCVData(ohlcvData, 60);
  
  if (candles.length === 0) {
    throw new Error(`No valid OHLCV data for ${symbol}`);
  }
  
  // Generate indicators
  const { ma50, ma200 } = generateIndicatorLines(candles);
  
  // Get latest data
  const latestCandle = candles[candles.length - 1];
  const metrics = calculateCurrentMetrics(candles);
  const latestMA50 = ma50[ma50.length - 1]?.value;
  const latestMA200 = ma200[ma200.length - 1]?.value;
  
  // Generate signal
  const { signal, confidence } = generateSignal(
    metrics.rsi14,
    metrics.macd,
    latestCandle.close,
    latestMA50,
    latestMA200
  );
  
  // Generate forecasts (placeholder - integrate with AI service later)
  const forecasts = generateForecastData(latestCandle.close);
  
  return {
    symbol: symbol.toUpperCase(),
    realToday: formattedToday,
    virtualToday: formattedYesterday,
    lookbackOffsetDays: 30,
    currentSnapshot: {
      date: latestCandle.date,
      close: latestCandle.close,
      changePercent: metrics.changePercent,
      volume: latestCandle.volume || null,
      rsi14: metrics.rsi14,
      macd: metrics.macd,
      signal,
      confidence,
    },
    topScroller: topSymbols || [
      { symbol: 'AAPL', signal: 'BUY', confidence: 0.68 },
      { symbol: 'MSFT', signal: 'HOLD', confidence: 0.51 },
    ],
    chart: {
      candles,
      ma50: ma50.filter(m => m.value !== null),
      ma200: ma200.filter(m => m.value !== null),
    },
    forecasts,
  };
}

export default {
  transformOHLCVData,
  generateIndicatorLines,
  calculateCurrentMetrics,
  generateSignal,
  generateForecastData,
  transformRealDataToPayload,
};
