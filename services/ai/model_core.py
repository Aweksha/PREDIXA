"""Shared data, features and targets for the forecasting models.

Every feature is a ratio or percentage, so a $70 stock and a $900 stock are comparable
and the models can't memorize which stock is which from its price level.
"""

import os
import pickle
import time

import numpy as np
import pandas as pd
import requests

BENCHMARK = "SPY"

UNIVERSE = [
    "NVDA", "TSLA", "AMD", "PLTR", "META",
    "MSFT", "AAPL", "AMZN", "GOOG", "ORCL",
    "JPM", "GS", "BAC",
    "COST", "WMT", "NFLX",
    "XOM", "CVX",
    "CRWD", "SNOW",
]

BUY_THRESHOLD_10D = 0.04
SELL_THRESHOLD_10D = -0.04

PRICE_CACHE_SECONDS = 3600
_price_cache: dict = {}
_models: dict | None = None


def fetch_prices(symbol: str, range_: str = "10y", cache_dir: str | None = None) -> pd.DataFrame:
    """Daily dividend- and split-adjusted bars from Yahoo, oldest first."""
    symbol = symbol.upper().strip()
    cache_path = os.path.join(cache_dir, f"{symbol}_{range_}.pkl") if cache_dir else None
    if cache_path and os.path.exists(cache_path) and time.time() - os.path.getmtime(cache_path) < 86400:
        return pd.read_pickle(cache_path)
    cached = _price_cache.get((symbol, range_))
    if cached and time.time() - cached[0] < PRICE_CACHE_SECONDS:
        return cached[1]

    response = requests.get(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"range": range_, "interval": "1d", "includePrePost": "false", "events": "div,splits"},
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=60,
    )
    response.raise_for_status()
    result = response.json()["chart"]["result"][0]
    quote = result["indicators"]["quote"][0]

    bars = pd.DataFrame({
        "date": pd.to_datetime(result["timestamp"], unit="s").normalize(),
        "open": quote["open"],
        "high": quote["high"],
        "low": quote["low"],
        "close": quote["close"],
        "volume": quote["volume"],
        "adjclose": result["indicators"]["adjclose"][0]["adjclose"],
    }).dropna()

    factor = bars["adjclose"] / bars["close"]
    for column in ["open", "high", "low", "close"]:
        bars[column] = bars[column] * factor
    bars = bars.drop(columns="adjclose").drop_duplicates("date").sort_values("date").reset_index(drop=True)
    bars["symbol"] = symbol

    if cache_path:
        os.makedirs(cache_dir, exist_ok=True)
        bars.to_pickle(cache_path)
    _price_cache[(symbol, range_)] = (time.time(), bars)
    return bars


def _rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(window).mean()
    loss = (-delta.clip(upper=0)).rolling(window).mean()
    return 100 - 100 / (1 + gain / loss.replace(0, np.nan))


def add_features(stock: pd.DataFrame, market: pd.DataFrame) -> pd.DataFrame:
    out = stock.sort_values("date").reset_index(drop=True).copy()
    close = out["close"]
    returns = close.pct_change()
    volatility_20 = returns.rolling(20).std()

    for days in [1, 2, 3, 5, 10, 20, 60, 120, 250]:
        out[f"return_{days}d"] = close.pct_change(days)
    # Move size relative to the stock's normal range, which is comparable across stocks
    for days in [1, 5, 20]:
        out[f"zscore_return_{days}d"] = out[f"return_{days}d"] / (volatility_20 * np.sqrt(days))

    for days in [5, 10, 20, 60]:
        out[f"volatility_{days}d"] = returns.rolling(days).std()
    out["volatility_ratio_5_60"] = out["volatility_5d"] / out["volatility_60d"]
    out["volatility_ratio_20_60"] = out["volatility_20d"] / out["volatility_60d"]
    out["downside_volatility_20d"] = returns.clip(upper=0).rolling(20).std()

    for days in [5, 20, 50, 200]:
        out[f"dist_sma_{days}"] = close / close.rolling(days).mean() - 1
    out["dist_high_250"] = close / close.rolling(250).max() - 1
    out["dist_low_250"] = close / close.rolling(250).min() - 1

    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    macd = ema_12 - ema_26
    out["macd_pct"] = macd / close
    out["macd_hist_pct"] = (macd - macd.ewm(span=9, adjust=False).mean()) / close
    out["rsi_14"] = _rsi(close)

    std_20 = close.rolling(20).std()
    out["bollinger_position"] = (close - close.rolling(20).mean()) / (2 * std_20)
    out["bollinger_width"] = 4 * std_20 / close.rolling(20).mean()

    previous_close = close.shift(1)
    true_range = pd.concat(
        [out["high"] - out["low"], (out["high"] - previous_close).abs(), (out["low"] - previous_close).abs()],
        axis=1,
    ).max(axis=1)
    out["atr_pct_14"] = true_range.rolling(14).mean() / close
    out["intraday_range"] = (out["high"] - out["low"]) / close
    out["open_close_change"] = close / out["open"] - 1
    out["overnight_gap"] = out["open"] / previous_close - 1
    out["close_position"] = (close - out["low"]) / (out["high"] - out["low"]).replace(0, np.nan)

    volume = out["volume"].replace(0, np.nan)
    out["volume_ratio_5"] = volume / volume.rolling(5).mean()
    out["volume_ratio_20"] = volume / volume.rolling(20).mean()
    out["volume_trend_5_60"] = volume.rolling(5).mean() / volume.rolling(60).mean()

    spy = market.sort_values("date")[["date", "close"]].rename(columns={"close": "spy_close"}).copy()
    spy_returns = spy["spy_close"].pct_change()
    spy["spy_return_1d_raw"] = spy_returns
    for days in [1, 5, 10, 20, 60]:
        spy[f"spy_return_{days}d"] = spy["spy_close"].pct_change(days)
    spy["spy_volatility_20d"] = spy_returns.rolling(20).std()
    spy["spy_volatility_ratio_20_60"] = spy["spy_volatility_20d"] / spy_returns.rolling(60).std()
    spy["spy_dist_sma_50"] = spy["spy_close"] / spy["spy_close"].rolling(50).mean() - 1
    spy["spy_dist_sma_200"] = spy["spy_close"] / spy["spy_close"].rolling(200).mean() - 1
    out = out.merge(spy, on="date", how="left")

    for days in [1, 5, 20, 60]:
        out[f"relative_return_{days}d"] = out[f"return_{days}d"] - out[f"spy_return_{days}d"]
    stock_returns = out["close"].pct_change()
    covariance = stock_returns.rolling(60).cov(out["spy_return_1d_raw"])
    out["beta_60d"] = covariance / out["spy_return_1d_raw"].rolling(60).var()
    out["correlation_60d"] = stock_returns.rolling(60).corr(out["spy_return_1d_raw"])

    return out.replace([np.inf, -np.inf], np.nan)


FEATURE_COLUMNS = [
    "return_1d", "return_2d", "return_3d", "return_5d", "return_10d", "return_20d",
    "return_60d", "return_120d", "return_250d",
    "zscore_return_1d", "zscore_return_5d", "zscore_return_20d",
    "volatility_5d", "volatility_10d", "volatility_20d", "volatility_60d",
    "volatility_ratio_5_60", "volatility_ratio_20_60", "downside_volatility_20d",
    "dist_sma_5", "dist_sma_20", "dist_sma_50", "dist_sma_200", "dist_high_250", "dist_low_250",
    "macd_pct", "macd_hist_pct", "rsi_14", "bollinger_position", "bollinger_width",
    "atr_pct_14", "intraday_range", "open_close_change", "overnight_gap", "close_position",
    "volume_ratio_5", "volume_ratio_20", "volume_trend_5_60",
    "spy_return_1d", "spy_return_5d", "spy_return_10d", "spy_return_20d", "spy_return_60d",
    "spy_volatility_20d", "spy_volatility_ratio_20_60", "spy_dist_sma_50", "spy_dist_sma_200",
    "relative_return_1d", "relative_return_5d", "relative_return_20d", "relative_return_60d",
    "beta_60d", "correlation_60d",
]


def add_targets(featured: pd.DataFrame) -> pd.DataFrame:
    """Future outcomes. These must never be computed on rows used for a live forecast."""
    out = featured.copy()
    close = out["close"]
    spy_close = out["spy_close"]

    out["target_return_1d"] = close.shift(-1) / close - 1
    out["target_return_5d"] = close.shift(-5) / close - 1
    out["target_return_10d"] = close.shift(-10) / close - 1
    spy_return_5d = spy_close.shift(-5) / spy_close - 1

    out["target_up_5d"] = (out["target_return_5d"] > 0).astype(float)
    out["target_beats_spy_5d"] = (out["target_return_5d"] > spy_return_5d).astype(float)
    out["target_signal_10d"] = np.select(
        [out["target_return_10d"] > BUY_THRESHOLD_10D, out["target_return_10d"] < SELL_THRESHOLD_10D],
        [1, -1],
        default=0,
    ).astype(float)

    future_volatility = out["close"].pct_change().rolling(10).std().shift(-10)
    out["target_log_volatility_10d"] = np.log(future_volatility.replace(0, np.nan))

    # Rows without a complete future window have no known outcome
    for column in ["target_up_5d", "target_beats_spy_5d"]:
        out.loc[out["target_return_5d"].isna(), column] = np.nan
    out.loc[out["target_return_10d"].isna(), "target_signal_10d"] = np.nan
    return out


def build_dataset(cache_dir: str | None = None) -> pd.DataFrame:
    market = fetch_prices(BENCHMARK, cache_dir=cache_dir)
    frames = []
    for symbol in UNIVERSE:
        frames.append(add_targets(add_features(fetch_prices(symbol, cache_dir=cache_dir), market)))
    data = pd.concat(frames, ignore_index=True)
    return data.dropna(subset=FEATURE_COLUMNS).sort_values(["date", "symbol"]).reset_index(drop=True)


def latest_features(symbol: str, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """The most recent row of features for a live or as-of forecast, with no target logic."""
    stock = fetch_prices(symbol, range_="3y")
    market = fetch_prices(BENCHMARK, range_="3y")
    if as_of is not None:
        stock = stock[stock["date"] <= as_of]
        market = market[market["date"] <= as_of]
    featured = add_features(stock, market).dropna(subset=FEATURE_COLUMNS)
    if featured.empty:
        raise ValueError(f"Not enough price history to forecast {symbol}")
    return featured.iloc[[-1]]


MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "predixa_models.pkl")


def load_models() -> dict:
    global _models
    if _models is None:
        with open(MODEL_PATH, "rb") as f:
            _models = pickle.load(f)
    return _models
