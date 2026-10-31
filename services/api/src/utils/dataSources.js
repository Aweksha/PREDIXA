/**
 * Real-time data source adapters for Node.js API service
 * Integrates Yahoo Finance and Alpha Vantage APIs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const CACHE_DIR = path.join(process.cwd(), process.env.DATA_CACHE_DIR || './data_cache');
const CACHE_EXPIRY_HOURS = parseInt(process.env.DATA_CACHE_EXPIRY_HOURS || '24');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function fetchJson(url, { headers, params, timeout = 30000 } = {}) {
  const requestUrl = new URL(url);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        requestUrl.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(requestUrl, {
    headers,
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${requestUrl}`);
  }

  return response.json();
}

/**
 * Simple file-based cache for API responses
 */
class DataSourceCache {
  getCachePath(key) {
    return path.join(CACHE_DIR, `${key}.json`);
  }

  isExpired(key) {
    const cachePath = this.getCachePath(key);
    if (!fs.existsSync(cachePath)) {
      return true;
    }

    const stats = fs.statSync(cachePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = ageMs / (1000 * 60 * 60);
    return ageHours > CACHE_EXPIRY_HOURS;
  }

  get(key) {
    if (this.isExpired(key)) {
      return null;
    }

    const cachePath = this.getCachePath(key);
    try {
      if (fs.existsSync(cachePath)) {
        const data = fs.readFileSync(cachePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Cache read error for ${key}:`, error.message);
    }
    return null;
  }

  set(key, data) {
    const cachePath = this.getCachePath(key);
    try {
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Cache write error for ${key}:`, error.message);
    }
  }
}

/**
 * Yahoo Finance data source
 */
class YahooFinanceSource {
  constructor() {
    this.cache = new DataSourceCache();
  }

  async fetchOHLCV(symbol, period = '1mo', use_cache = true) {
    symbol = symbol.toUpperCase();
    const cacheKey = `yf_ohlcv_${symbol}_${period}`;

    if (use_cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      // Using yfinance via python-shell or alternative Node.js library
      const pythonShell = require('python-shell');
      const { PythonShell } = pythonShell;

      const options = {
        mode: 'text',
        pythonOptions: ['-u'],
        args: [symbol, period],
      };

      const results = await new Promise((resolve, reject) => {
        PythonShell.run(
          `
import yfinance as yf
import json
import sys

symbol = sys.argv[1]
period = sys.argv[2]

try:
  ticker = yf.Ticker(symbol)
  df = ticker.history(period=period)
  df = df.reset_index()
  data = df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']].to_dict('records')
  print(json.dumps(data))
except Exception as e:
  print(json.dumps({"error": str(e)}), file=sys.stderr)
  sys.exit(1)
`,
          options,
          (err, results) => {
            if (err) reject(err);
            resolve(results);
          }
        );
      });

      const data = JSON.parse(results[0]);
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error fetching from Yahoo Finance: ${error.message}`);
      throw error;
    }
  }

  async fetchQuote(symbol) {
    symbol = symbol.toUpperCase();
    const cacheKey = `yf_quote_${symbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Alternative: Use finnhub or other free API
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`;
      const quote = await fetchJson(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
      });

      this.cache.set(cacheKey, quote);
      return quote;
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}: ${error.message}`);
      return null;
    }
  }
}

/**
 * Alpha Vantage data source
 */
class AlphaVantageSource {
  constructor(apiKey = ALPHA_VANTAGE_API_KEY) {
    if (!apiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY environment variable not set');
    }
    this.apiKey = apiKey;
    this.cache = new DataSourceCache();
    this.baseUrl = 'https://www.alphavantage.co/query';
  }

  async fetchDaily(symbol, outputsize = 'full', use_cache = true) {
    symbol = symbol.toUpperCase();
    const cacheKey = `av_daily_${symbol}`;

    if (use_cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const data = await fetchJson(this.baseUrl, {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          outputsize: outputsize,
          apikey: this.apiKey,
        },
        timeout: 30000,
      });

      if (data['Error Message']) {
        throw new Error(data['Error Message']);
      }

      if (data['Note']) {
        throw new Error('API call frequency limit exceeded');
      }

      const records = [];
      for (const [date, values] of Object.entries(data['Time Series (Daily)'])) {
        records.push({
          date,
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['5. volume']),
          symbol: symbol,
        });
      }

      records.sort((a, b) => new Date(a.date) - new Date(b.date));
      this.cache.set(cacheKey, records);
      return records;
    } catch (error) {
      console.error(`Failed to fetch daily data for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async fetchIntraday(symbol, interval = '60min', outputsize = 'full', use_cache = true) {
    symbol = symbol.toUpperCase();
    const cacheKey = `av_intraday_${symbol}_${interval}`;

    if (use_cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const data = await fetchJson(this.baseUrl, {
        params: {
          function: 'TIME_SERIES_INTRADAY',
          symbol: symbol,
          interval: interval,
          outputsize: outputsize,
          apikey: this.apiKey,
        },
        timeout: 30000,
      });

      if (data['Error Message']) {
        throw new Error(data['Error Message']);
      }

      if (data['Note']) {
        throw new Error('API call frequency limit exceeded');
      }

      const timeSeriesKey = `Time Series (${interval})`;
      if (!data[timeSeriesKey]) {
        throw new Error('Unexpected API response format');
      }

      const records = [];
      for (const [timestamp, values] of Object.entries(data[timeSeriesKey])) {
        records.push({
          timestamp,
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['5. volume']),
          symbol: symbol,
        });
      }

      records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      this.cache.set(cacheKey, records);
      return records;
    } catch (error) {
      console.error(`Failed to fetch intraday data for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async fetchTechnicalIndicator(symbol, indicator, interval = 'daily', timePeriod = 14, use_cache = true) {
    symbol = symbol.toUpperCase();
    const cacheKey = `av_indicator_${symbol}_${indicator}_${timePeriod}`;

    if (use_cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const data = await fetchJson(this.baseUrl, {
        params: {
          function: indicator,
          symbol: symbol,
          interval: interval,
          time_period: timePeriod,
          apikey: this.apiKey,
        },
        timeout: 30000,
      });

      if (data['Error Message']) {
        throw new Error(data['Error Message']);
      }

      let tsKey = null;
      for (const key of Object.keys(data)) {
        if (key.startsWith('Technical Analysis')) {
          tsKey = key;
          break;
        }
      }

      if (!tsKey) {
        throw new Error(`Unexpected API response format for ${indicator}`);
      }

      const records = [];
      for (const [date, values] of Object.entries(data[tsKey])) {
        const record = { date, symbol: symbol, ...values };
        records.push(record);
      }

      records.sort((a, b) => new Date(a.date) - new Date(b.date));
      this.cache.set(cacheKey, records);
      return records;
    } catch (error) {
      console.error(`Failed to fetch ${indicator} for ${symbol}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Unified data source manager
 */
class DataSourceManager {
  constructor() {
    this.yahooFinance = new YahooFinanceSource();
    this.alphaVantage = null;

    if (ALPHA_VANTAGE_API_KEY) {
      try {
        this.alphaVantage = new AlphaVantageSource();
      } catch (error) {
        console.warn('Alpha Vantage not available:', error.message);
      }
    }
  }

  async fetchOHLCV(symbol, period = '1mo', preferredSource = 'yahoo') {
    try {
      if (preferredSource === 'yahoo') {
        return await this.yahooFinance.fetchOHLCV(symbol, period);
      } else if (preferredSource === 'alpha_vantage' && this.alphaVantage) {
        return await this.alphaVantage.fetchDaily(symbol);
      }
    } catch (error) {
      console.error(`Error with ${preferredSource}: ${error.message}`);
    }

    // Fallback to Yahoo Finance
    try {
      return await this.yahooFinance.fetchOHLCV(symbol, period);
    } catch (error) {
      throw new Error(`Failed to fetch OHLCV data from all sources: ${error.message}`);
    }
  }

  async fetchTechnicalIndicators(symbol, indicators = ['RSI', 'MACD']) {
    const results = {};

    if (!this.alphaVantage) {
      console.warn('Alpha Vantage not available for technical indicators');
      return results;
    }

    for (const indicator of indicators) {
      try {
        results[indicator] = await this.alphaVantage.fetchTechnicalIndicator(symbol, indicator);
      } catch (error) {
        console.error(`Failed to fetch ${indicator}: ${error.message}`);
      }
    }

    return results;
  }
}

export {
  DataSourceManager,
  YahooFinanceSource,
  AlphaVantageSource,
  DataSourceCache,
};

export const dataManager = new DataSourceManager();
