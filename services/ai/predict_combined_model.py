import numpy as np

from model_core import latest_features, load_models


def forecast_from_features(features, models: dict) -> dict:
    """Every model's output for one row of features, as fractions and probabilities."""
    columns = models["feature_columns"]
    row = features[columns]
    close = float(features.iloc[0]["close"])

    next_return = float(np.clip(models["next_day"].predict(row)[0], -0.15, 0.15))
    prob_up = float(models["five_day"].predict_proba(row)[0][1])

    ten_day_probs = models["ten_day"].predict_proba(row)[0]
    labels = models["ten_day_labels"]
    probabilities = {labels[i]: round(float(p), 4) for i, p in enumerate(ten_day_probs)}
    signal = max(probabilities, key=probabilities.get)

    daily_volatility = float(np.exp(models["volatility"].predict(row)[0]))
    move = float(daily_volatility * np.sqrt(10) * models["range_scale"])

    return {
        "close": close,
        "next_return": next_return,
        "next_close": close * (1 + next_return),
        "prob_up_5d": prob_up,
        "signal_10d": signal,
        "probabilities_10d": probabilities,
        "move_10d": move,
        "range_low": close * (1 - move),
        "range_high": close * (1 + move),
    }


def predict_symbol(symbol: str, limit: int = 1200) -> dict:
    symbol = symbol.upper().strip()
    features = latest_features(symbol)
    forecast = forecast_from_features(features, load_models())

    close = forecast["close"]
    expected_move = forecast["next_close"] - close
    direction = "UP" if forecast["prob_up_5d"] >= 0.5 else "DOWN"
    latest_date = str(features.iloc[0]["date"].date())

    return {
        "symbol": symbol,
        "prediction_type": "combined_direction_plus_price_plus_10day",
        "direction": {
            "signal": direction,
            "prob_up_5d": round(forecast["prob_up_5d"], 4),
            "prob_down_5d": round(1 - forecast["prob_up_5d"], 4),
        },
        "price_forecast": {
            "latest_date": latest_date,
            "current_close": round(close, 2),
            "predicted_next_close": round(forecast["next_close"], 2),
            "expected_move": round(expected_move, 2),
            "expected_move_pct": round(forecast["next_return"] * 100, 2),
        },
        "ten_day_forecast": {
            "latest_date": latest_date,
            "latest_close": round(close, 2),
            "signal": forecast["signal_10d"],
            "probabilities": forecast["probabilities_10d"],
        },
        "volatility_forecast": {
            "expected_move_pct": round(forecast["move_10d"] * 100, 2),
            "range_low": round(forecast["range_low"], 2),
            "range_high": round(forecast["range_high"], 2),
        },
        "confidence": "LOW",
        "summary": (
            f"Next close estimate {forecast['next_close']:.2f} from {close:.2f}. "
            f"10-day signal {forecast['signal_10d']}. "
            f"Expected 10-day range {forecast['range_low']:.2f} to {forecast['range_high']:.2f}."
        ),
    }


if __name__ == "__main__":
    for test_symbol in ["NVDA", "MSFT", "AMZN", "AAPL", "TSLA"]:
        print(predict_symbol(test_symbol))
