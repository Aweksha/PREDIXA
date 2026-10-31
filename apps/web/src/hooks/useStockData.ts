/**
 * useStockData - React hook for fetching real stock data
 * Provides OHLCV data, quotes, and technical indicators
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050').replace(/\/$/, '');

interface StockDataOptions {
  symbol: string;
  limit?: number;
  source?: 'yahoo' | 'alpha_vantage';
  indicators?: string[];
}

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  pe?: number;
  timestamp: string;
}

interface IndicatorData {
  [key: string]: Array<{ [key: string]: string | number }>;
}

interface UseStockDataReturn {
  ohlcv: PriceBar[];
  quote: QuoteData | null;
  indicators: IndicatorData;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch OHLCV data from API
 */
async function fetchOHLCV(symbol: string, limit: number = 1200, source: string = 'yahoo'): Promise<PriceBar[]> {
  const response = await fetch(
    `${API_BASE}/api/history/eod?symbol=${symbol}&limit=${limit}&source=${source}`,
    {
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch OHLCV data: ${response.statusText}`);
  }

  const data = await response.json();
  return data.points || [];
}

/**
 * Fetch current quote data
 */
async function fetchQuote(symbol: string): Promise<QuoteData> {
  const response = await fetch(
    `${API_BASE}/api/quote?symbol=${symbol}`,
    {
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    // Return null if quote endpoint not available
    return null;
  }

  return response.json();
}

/**
 * Fetch technical indicators
 */
async function fetchIndicators(symbol: string, indicators: string[] = ['RSI', 'MACD']): Promise<IndicatorData> {
  try {
    const response = await fetch(
      `${API_BASE}/api/history/indicators?symbol=${symbol}&indicators=${indicators.join(',')}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn('Failed to fetch indicators');
      return {};
    }

    const data = await response.json();
    return data.indicators || {};
  } catch (error) {
    console.warn('Error fetching indicators:', error);
    return {};
  }
}

/**
 * Main hook for fetching stock data
 */
export function useStockData(options: StockDataOptions): UseStockDataReturn {
  const { symbol, limit = 1200, source = 'yahoo', indicators = ['RSI', 'MACD'] } = options;

  const [ohlcv, setOhlcv] = useState<PriceBar[]>([]);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [indicatorData, setIndicatorData] = useState<IndicatorData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!symbol) {
      setError('Symbol is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [ohlcvData, quoteData, indicatorsData] = await Promise.all([
        fetchOHLCV(symbol, limit, source),
        fetchQuote(symbol).catch(() => null),
        fetchIndicators(symbol, indicators),
      ]);

      setOhlcv(ohlcvData);
      setQuote(quoteData);
      setIndicatorData(indicatorsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, limit, source, indicators]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ohlcv,
    quote,
    indicators: indicatorData,
    loading,
    error,
    refetch: fetchData,
  };
}

export default useStockData;
