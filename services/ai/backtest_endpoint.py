"""
Backtesting endpoint: runs predictions as of (real_today - 30 days) and compares
to the actual prices that occurred after that virtual date.

The saved models are trained only on data from before that date; see train_models.py.
"""

from datetime import datetime, timedelta

import pandas as pd

from model_core import BUY_THRESHOLD_10D, SELL_THRESHOLD_10D, fetch_prices, latest_features, load_models
from predict_combined_model import forecast_from_features


def run_backtest(symbol: str) -> dict:
    symbol = symbol.upper().strip()

    real_today = datetime.today()
    vt = pd.Timestamp((real_today - timedelta(days=30)).date())

    features = latest_features(symbol, as_of=vt)
    forecast = forecast_from_features(features, load_models())
    vt_close = forecast["close"]
    vt_actual_date = str(features.iloc[0]["date"].date())

    # Future data — actual prices after virtual_today
    prices = fetch_prices(symbol, range_="3y")
    future = prices[prices["date"] > vt].reset_index(drop=True)

    def _future_close(n: int):
        if len(future) >= n:
            return round(float(future.iloc[n - 1]["close"]), 2), str(future.iloc[n - 1]["date"].date())
        return None, None

    actual_1d_price, actual_1d_date = _future_close(1)
    actual_5d_price, actual_5d_date = _future_close(5)
    actual_10d_price, actual_10d_date = _future_close(10)

    predicted_next_close = round(forecast["next_close"], 2)

    next_close_err = None
    next_close_dir = None
    if actual_1d_price:
        next_close_err = round(abs(predicted_next_close - actual_1d_price) / actual_1d_price * 100, 2)
        next_close_dir = (predicted_next_close >= vt_close) == (actual_1d_price >= vt_close)

    five_signal = "UP" if forecast["prob_up_5d"] >= 0.5 else "DOWN"
    five_day_dir_correct = None
    if actual_5d_price is not None:
        five_day_dir_correct = (five_signal == "UP") == (actual_5d_price > vt_close)

    # Graded with the same thresholds the model was trained on
    ten_signal = forecast["signal_10d"]
    ten_day_dir_correct = None
    within_range = None
    if actual_10d_price is not None:
        actual_10d_return = (actual_10d_price - vt_close) / vt_close
        if actual_10d_return > BUY_THRESHOLD_10D:
            actual_signal = "BUY"
        elif actual_10d_return < SELL_THRESHOLD_10D:
            actual_signal = "SELL"
        else:
            actual_signal = "HOLD"
        ten_day_dir_correct = ten_signal == actual_signal
        within_range = forecast["range_low"] <= actual_10d_price <= forecast["range_high"]

    return {
        "symbol": symbol,
        "virtualToday": vt_actual_date,
        "realToday": real_today.strftime("%Y-%m-%d"),
        "baseClose": vt_close,
        "forecasts": {
            "nextDay": {
                "predictedPrice": predicted_next_close,
                "actualPrice": actual_1d_price,
                "actualDate": actual_1d_date,
                "absErrorPct": next_close_err,
                "directionCorrect": next_close_dir,
            },
            "fiveDay": {
                "predictedSignal": five_signal,
                "probUp": round(forecast["prob_up_5d"], 4),
                "probDown": round(1 - forecast["prob_up_5d"], 4),
                "actualPrice": actual_5d_price,
                "actualDate": actual_5d_date,
                "directionCorrect": five_day_dir_correct,
            },
            "tenDay": {
                "predictedSignal": ten_signal,
                "probabilities": forecast["probabilities_10d"],
                "actualPrice": actual_10d_price,
                "actualDate": actual_10d_date,
                "directionCorrect": ten_day_dir_correct,
            },
            "volatility": {
                "expectedMovePct": round(forecast["move_10d"] * 100, 2),
                "rangeLow": round(forecast["range_low"], 2),
                "rangeHigh": round(forecast["range_high"], 2),
                "actualPrice": actual_10d_price,
                "actualDate": actual_10d_date,
                "withinRange": within_range,
            },
        },
    }
