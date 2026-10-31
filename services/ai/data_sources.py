"""
Real-time data source adapters for Yahoo Finance and Alpha Vantage.
Handles fetching OHLCV data, indicators, and caching.
"""

import os
import requests
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from dotenv import load_dotenv
import json
from pathlib import Path

load_dotenv()

# API Keys and URLs
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
YAHOO_FINANCE_BASE_URL = "https://query1.finance.yahoo.com"
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

# Cache settings
CACHE_DIR = Path(os.getenv("DATA_CACHE_DIR", "./data_cache"))
CACHE_DIR.mkdir(exist_ok=True)
CACHE_EXPIRY_HOURS = int(os.getenv("DATA_CACHE_EXPIRY_HOURS", "24"))


class DataSourceCache:
    """Simple file-based cache for API responses."""
    
    def __init__(self, cache_dir: Path = CACHE_DIR):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(exist_ok=True)
    
    def get_cache_path(self, key: str) -> Path:
        """Generate cache file path from key."""
        return self.cache_dir / f"{key}.json"
    
    def is_expired(self, key: str) -> bool:
        """Check if cache entry is expired."""
        cache_path = self.get_cache_path(key)
        if not cache_path.exists():
            return True
        
        file_age = datetime.now() - datetime.fromtimestamp(cache_path.stat().st_mtime)
        return file_age > timedelta(hours=CACHE_EXPIRY_HOURS)
    
    def get(self, key: str) -> Optional[Dict]:
        """Retrieve cached data if not expired."""
        if self.is_expired(key):
            return None
        
        cache_path = self.get_cache_path(key)
        try:
            with open(cache_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return None
    
    def set(self, key: str, data: Dict) -> None:
        """Cache data to file."""
        cache_path = self.get_cache_path(key)
        with open(cache_path, 'w') as f:
            json.dump(data, f, indent=2)


class YahooFinanceSource:
    """Fetch real-time data from Yahoo Finance."""
    
    def __init__(self):
        self.cache = DataSourceCache()
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def fetch_ohlcv(
        self, 
        symbol: str, 
        period: str = "1mo",
        interval: str = "1d",
        use_cache: bool = True
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data from Yahoo Finance.
        
        Args:
            symbol: Stock ticker (e.g., 'AAPL')
            period: Data period ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max')
            interval: Candle interval ('1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo')
            use_cache: Whether to use cached data if available
        
        Returns:
            pandas DataFrame with OHLCV data
        """
        symbol = symbol.upper()
        cache_key = f"yf_ohlcv_{symbol}_{period}_{interval}"
        
        # Check cache
        if use_cache:
            cached = self.cache.get(cache_key)
            if cached:
                return pd.DataFrame(cached)
        
        try:
            import yfinance as yf
            
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval=interval)
            
            # Normalize columns
            df = df.reset_index()
            df.columns = ['date', 'open', 'high', 'low', 'close', 'volume', 'dividends', 'stock_splits']
            df = df[['date', 'open', 'high', 'low', 'close', 'volume']]
            df['date'] = df['date'].dt.strftime('%Y-%m-%d')
            df['symbol'] = symbol
            
            # Cache the result
            self.cache.set(cache_key, df.to_dict('records'))
            
            return df
        
        except ImportError:
            raise ImportError("yfinance library not installed. Install with: pip install yfinance")
        except Exception as e:
            raise ValueError(f"Failed to fetch data for {symbol} from Yahoo Finance: {str(e)}")
    
    def fetch_quote(self, symbol: str) -> Dict:
        """
        Fetch current quote data.
        
        Args:
            symbol: Stock ticker
        
        Returns:
            Dictionary with quote data (price, change, volume, etc.)
        """
        symbol = symbol.upper()
        cache_key = f"yf_quote_{symbol}"
        
        # Check cache (shorter expiry for quotes - 1 hour)
        cached = self.cache.get(cache_key)
        if cached:
            return cached
        
        try:
            import yfinance as yf
            
            ticker = yf.Ticker(symbol)
            info = ticker.info
            
            quote = {
                'symbol': symbol,
                'price': info.get('currentPrice'),
                'change': info.get('regularMarketChange'),
                'changePercent': info.get('regularMarketChangePercent'),
                'volume': info.get('volume'),
                'marketCap': info.get('marketCap'),
                'pe': info.get('trailingPE'),
                'dividend': info.get('dividendRate'),
                'timestamp': datetime.now().isoformat()
            }
            
            self.cache.set(cache_key, quote)
            return quote
        
        except Exception as e:
            raise ValueError(f"Failed to fetch quote for {symbol}: {str(e)}")


class AlphaVantageSource:
    """Fetch data from Alpha Vantage API."""
    
    def __init__(self, api_key: str = ALPHA_VANTAGE_API_KEY):
        if not api_key:
            raise ValueError("ALPHA_VANTAGE_API_KEY environment variable not set")
        
        self.api_key = api_key
        self.cache = DataSourceCache()
        self.session = requests.Session()
    
    def fetch_intraday(
        self,
        symbol: str,
        interval: str = "60min",
        outputsize: str = "full",
        use_cache: bool = True
    ) -> pd.DataFrame:
        """
        Fetch intraday OHLCV data.
        
        Args:
            symbol: Stock ticker
            interval: '1min', '5min', '15min', '30min', '60min'
            outputsize: 'compact' (100 data points) or 'full' (up to 20 years)
            use_cache: Whether to use cached data
        
        Returns:
            pandas DataFrame with OHLCV data
        """
        symbol = symbol.upper()
        cache_key = f"av_intraday_{symbol}_{interval}"
        
        if use_cache:
            cached = self.cache.get(cache_key)
            if cached:
                return pd.DataFrame(cached)
        
        params = {
            'function': 'TIME_SERIES_INTRADAY',
            'symbol': symbol,
            'interval': interval,
            'outputsize': outputsize,
            'apikey': self.api_key
        }
        
        try:
            response = self.session.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if 'Error Message' in data:
                raise ValueError(data['Error Message'])
            
            if 'Note' in data:
                raise ValueError("API call frequency limit exceeded")
            
            # Parse time series data
            time_series_key = f"Time Series ({interval})"
            if time_series_key not in data:
                raise ValueError(f"Unexpected API response format")
            
            records = []
            for timestamp, values in data[time_series_key].items():
                records.append({
                    'date': timestamp,
                    'open': float(values['1. open']),
                    'high': float(values['2. high']),
                    'low': float(values['3. low']),
                    'close': float(values['4. close']),
                    'volume': int(values['5. volume']),
                    'symbol': symbol
                })
            
            df = pd.DataFrame(records)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            
            self.cache.set(cache_key, df.to_dict('records'))
            return df
        
        except Exception as e:
            raise ValueError(f"Failed to fetch intraday data for {symbol}: {str(e)}")
    
    def fetch_daily(
        self,
        symbol: str,
        outputsize: str = "full",
        use_cache: bool = True
    ) -> pd.DataFrame:
        """
        Fetch daily OHLCV data.
        
        Args:
            symbol: Stock ticker
            outputsize: 'compact' (100 data points) or 'full' (up to 20 years)
            use_cache: Whether to use cached data
        
        Returns:
            pandas DataFrame with OHLCV data
        """
        symbol = symbol.upper()
        cache_key = f"av_daily_{symbol}"
        
        if use_cache:
            cached = self.cache.get(cache_key)
            if cached:
                return pd.DataFrame(cached)
        
        params = {
            'function': 'TIME_SERIES_DAILY',
            'symbol': symbol,
            'outputsize': outputsize,
            'apikey': self.api_key
        }
        
        try:
            response = self.session.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if 'Error Message' in data:
                raise ValueError(data['Error Message'])
            
            if 'Note' in data:
                raise ValueError("API call frequency limit exceeded")
            
            records = []
            for date, values in data['Time Series (Daily)'].items():
                records.append({
                    'date': date,
                    'open': float(values['1. open']),
                    'high': float(values['2. high']),
                    'low': float(values['3. low']),
                    'close': float(values['4. close']),
                    'volume': int(values['5. volume']),
                    'symbol': symbol
                })
            
            df = pd.DataFrame(records)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            
            self.cache.set(cache_key, df.to_dict('records'))
            return df
        
        except Exception as e:
            raise ValueError(f"Failed to fetch daily data for {symbol}: {str(e)}")
    
    def fetch_technical_indicator(
        self,
        symbol: str,
        indicator: str,
        interval: str = "daily",
        time_period: int = 14,
        use_cache: bool = True
    ) -> pd.DataFrame:
        """
        Fetch technical indicators (RSI, MACD, SMA, etc.).
        
        Args:
            symbol: Stock ticker
            indicator: 'RSI', 'MACD', 'SMA', 'EMA', 'STOCH', 'ADX', 'CCI', 'ATR'
            interval: 'daily', 'weekly', 'monthly'
            time_period: Number of periods for calculation
            use_cache: Whether to use cached data
        
        Returns:
            pandas DataFrame with indicator data
        """
        symbol = symbol.upper()
        cache_key = f"av_indicator_{symbol}_{indicator}_{time_period}"
        
        if use_cache:
            cached = self.cache.get(cache_key)
            if cached:
                return pd.DataFrame(cached)
        
        params = {
            'function': indicator,
            'symbol': symbol,
            'interval': interval,
            'time_period': time_period,
            'apikey': self.api_key
        }
        
        try:
            response = self.session.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if 'Error Message' in data:
                raise ValueError(data['Error Message'])
            
            # Find the time series key (varies by indicator)
            ts_key = None
            for key in data.keys():
                if key.startswith('Technical Analysis'):
                    ts_key = key
                    break
            
            if not ts_key:
                raise ValueError(f"Unexpected API response format for {indicator}")
            
            records = []
            for date, values in data[ts_key].items():
                record = {'date': date, 'symbol': symbol}
                record.update(values)
                records.append(record)
            
            df = pd.DataFrame(records)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            
            self.cache.set(cache_key, df.to_dict('records'))
            return df
        
        except Exception as e:
            raise ValueError(f"Failed to fetch {indicator} for {symbol}: {str(e)}")


class DataSourceManager:
    """
    Unified interface for fetching data from multiple sources.
    Automatically selects best source based on availability.
    """
    
    def __init__(self):
        self.yahoo_finance = YahooFinanceSource()
        self.alpha_vantage = None
        
        if ALPHA_VANTAGE_API_KEY:
            try:
                self.alpha_vantage = AlphaVantageSource()
            except ValueError:
                pass
    
    def fetch_ohlcv(
        self,
        symbol: str,
        period: str = "1mo",
        preferred_source: str = "yahoo"
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data, automatically falling back to alternative sources.
        
        Args:
            symbol: Stock ticker
            period: Data period
            preferred_source: 'yahoo' or 'alpha_vantage'
        
        Returns:
            pandas DataFrame with OHLCV data
        """
        try:
            if preferred_source == "yahoo":
                return self.yahoo_finance.fetch_ohlcv(symbol, period=period)
            elif preferred_source == "alpha_vantage" and self.alpha_vantage:
                return self.alpha_vantage.fetch_daily(symbol)
        except Exception as e:
            print(f"Error with {preferred_source}: {str(e)}")
        
        # Fallback to Yahoo Finance if Alpha Vantage fails
        if preferred_source == "alpha_vantage":
            try:
                return self.yahoo_finance.fetch_ohlcv(symbol, period=period)
            except Exception as e:
                raise ValueError(f"Failed to fetch data from all sources: {str(e)}")
        
        raise ValueError(f"Failed to fetch OHLCV data for {symbol}")
    
    def fetch_technical_indicators(
        self,
        symbol: str,
        indicators: List[str] = None
    ) -> Dict[str, pd.DataFrame]:
        """
        Fetch multiple technical indicators.
        
        Args:
            symbol: Stock ticker
            indicators: List of indicator names ('RSI', 'MACD', 'SMA')
        
        Returns:
            Dictionary mapping indicator names to DataFrames
        """
        if indicators is None:
            indicators = ['RSI', 'MACD']
        
        results = {}
        
        if self.alpha_vantage:
            for indicator in indicators:
                try:
                    results[indicator] = self.alpha_vantage.fetch_technical_indicator(
                        symbol, indicator
                    )
                except Exception as e:
                    print(f"Failed to fetch {indicator}: {str(e)}")
        
        return results


# Global instance
data_manager = DataSourceManager()
