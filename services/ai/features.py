import numpy as np
import pandas as pd


def compute_rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()

    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(window=window).mean()
    avg_loss = loss.rolling(window=window).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    return rsi


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    out["date"] = pd.to_datetime(out["date"])

    out["sma_5"] = out["close"].rolling(5).mean()
    out["sma_10"] = out["close"].rolling(10).mean()
    out["sma_20"] = out["close"].rolling(20).mean()
    out["sma_50"] = out["close"].rolling(50).mean()

    out["ema_12"] = out["close"].ewm(span=12, adjust=False).mean()
    out["ema_26"] = out["close"].ewm(span=26, adjust=False).mean()

    out["macd"] = out["ema_12"] - out["ema_26"]
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False).mean()
    out["macd_hist"] = out["macd"] - out["macd_signal"]

    out["rsi_14"] = compute_rsi(out["close"], window=14)

    rolling_std_20 = out["close"].rolling(20).std()
    out["bb_upper"] = out["sma_20"] + (2 * rolling_std_20)
    out["bb_lower"] = out["sma_20"] - (2 * rolling_std_20)
    out["bb_width"] = (out["bb_upper"] - out["bb_lower"]) / out["sma_20"]

    out["return_1d"] = out["close"].pct_change(1)
    out["return_2d"] = out["close"].pct_change(2)
    out["return_3d"] = out["close"].pct_change(3)
    out["return_5d"] = out["close"].pct_change(5)
    out["return_10d"] = out["close"].pct_change(10)
    out["return_20d"] = out["close"].pct_change(20)

    out["volatility_5d"] = out["return_1d"].rolling(5).std()
    out["volatility_10d"] = out["return_1d"].rolling(10).std()
    out["volatility_20d"] = out["return_1d"].rolling(20).std()

    out["lag_close_1"] = out["close"].shift(1)
    out["lag_close_2"] = out["close"].shift(2)
    out["lag_close_3"] = out["close"].shift(3)
    out["lag_close_5"] = out["close"].shift(5)

    out["volume_change_1d"] = out["volume"].pct_change(1)
    out["volume_sma_5"] = out["volume"].rolling(5).mean()
    out["volume_sma_20"] = out["volume"].rolling(20).mean()
    out["volume_ratio_5"] = out["volume"] / out["volume_sma_5"]
    out["volume_ratio_20"] = out["volume"] / out["volume_sma_20"]

    out["intraday_range"] = (out["high"] - out["low"]) / out["close"]
    out["open_close_change"] = (out["close"] - out["open"]) / out["open"]
    out["high_close_gap"] = (out["high"] - out["close"]) / out["close"]
    out["close_low_gap"] = (out["close"] - out["low"]) / out["close"]

    out["dist_sma_5"] = (out["close"] / out["sma_5"]) - 1
    out["dist_sma_10"] = (out["close"] / out["sma_10"]) - 1
    out["dist_sma_20"] = (out["close"] / out["sma_20"]) - 1
    out["dist_sma_50"] = (out["close"] / out["sma_50"]) - 1
    out["dist_ema_12"] = (out["close"] / out["ema_12"]) - 1
    out["dist_ema_26"] = (out["close"] / out["ema_26"]) - 1

    out["momentum_5d"] = (out["close"] / out["close"].shift(5)) - 1
    out["momentum_10d"] = (out["close"] / out["close"].shift(10)) - 1
    out["momentum_20d"] = (out["close"] / out["close"].shift(20)) - 1

    out["sma_20_slope_5d"] = out["sma_20"] - out["sma_20"].shift(5)
    out["ema_12_slope_5d"] = out["ema_12"] - out["ema_12"].shift(5)

    out["day_of_week"] = out["date"].dt.dayofweek
    out["month"] = out["date"].dt.month

    out = out.replace([np.inf, -np.inf], np.nan)

    return out


def add_market_context_features(stock_df: pd.DataFrame, market_df: pd.DataFrame) -> pd.DataFrame:
    out = stock_df.copy()
    spy = market_df.copy()

    spy = spy.sort_values("date").reset_index(drop=True)

    spy_context = pd.DataFrame({
        "date": spy["date"],
        "spy_close": spy["close"],
        "spy_return_1d": spy["close"].pct_change(1),
        "spy_return_5d": spy["close"].pct_change(5),
        "spy_return_10d": spy["close"].pct_change(10),
        "spy_momentum_20d": (spy["close"] / spy["close"].shift(20)) - 1,
        "spy_volatility_20d": spy["close"].pct_change(1).rolling(20).std(),
        "spy_sma_20": spy["close"].rolling(20).mean(),
        "spy_sma_50": spy["close"].rolling(50).mean(),
    })

    out = out.merge(spy_context, on="date", how="left")

    out["rel_return_5d_vs_spy"] = out["return_5d"] - out["spy_return_5d"]
    out["rel_return_10d_vs_spy"] = out["return_10d"] - out["spy_return_10d"]
    out["rel_momentum_20d_vs_spy"] = out["momentum_20d"] - out["spy_momentum_20d"]

    out["market_trend_spy"] = (
        (out["spy_close"] > out["spy_sma_20"]) &
        (out["spy_sma_20"] > out["spy_sma_50"])
    ).astype(float)

    out["stock_above_market_5d"] = (out["rel_return_5d_vs_spy"] > 0).astype(float)
    out["stock_above_market_10d"] = (out["rel_return_10d_vs_spy"] > 0).astype(float)

    return out


FEATURE_COLUMNS = [
    "open",
    "high",
    "low",
    "close",
    "volume",
    "sma_5",
    "sma_10",
    "sma_20",
    "sma_50",
    "ema_12",
    "ema_26",
    "macd",
    "macd_signal",
    "macd_hist",
    "rsi_14",
    "bb_width",
    "return_1d",
    "return_2d",
    "return_3d",
    "return_5d",
    "return_10d",
    "return_20d",
    "volatility_5d",
    "volatility_10d",
    "volatility_20d",
    "lag_close_1",
    "lag_close_2",
    "lag_close_3",
    "lag_close_5",
    "volume_change_1d",
    "volume_ratio_5",
    "volume_ratio_20",
    "intraday_range",
    "open_close_change",
    "high_close_gap",
    "close_low_gap",
    "dist_sma_5",
    "dist_sma_10",
    "dist_sma_20",
    "dist_sma_50",
    "dist_ema_12",
    "dist_ema_26",
    "momentum_5d",
    "momentum_10d",
    "momentum_20d",
    "sma_20_slope_5d",
    "ema_12_slope_5d",
    "day_of_week",
    "month",
    "spy_return_1d",
    "spy_return_5d",
    "spy_return_10d",
    "spy_momentum_20d",
    "spy_volatility_20d",
    "rel_return_5d_vs_spy",
    "rel_return_10d_vs_spy",
    "rel_momentum_20d_vs_spy",
    "market_trend_spy",
    "stock_above_market_5d",
    "stock_above_market_10d",
]