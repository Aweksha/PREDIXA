import os
import pickle
import pandas as pd

from data_loader import fetch_training_universe_with_benchmark, MARKET_BENCHMARK_SYMBOL
from features import add_features, add_market_context_features
from targets import add_targets


MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "five_day_direction_model.pkl")


def load_model_artifact():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Saved model not found at {MODEL_PATH}. Run train_5day_direction.py first."
        )

    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def prepare_latest_row_for_symbol(raw_df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    raw_df = raw_df.copy()
    raw_df["date"] = pd.to_datetime(raw_df["date"])
    symbol = symbol.upper().strip()

    market_df = raw_df[raw_df["symbol"] == MARKET_BENCHMARK_SYMBOL].copy()
    symbol_df = raw_df[raw_df["symbol"] == symbol].copy()

    if symbol_df.empty:
        raise ValueError(f"No data found for symbol {symbol}")

    symbol_df = symbol_df.sort_values("date").reset_index(drop=True)

    featured = add_features(symbol_df)
    featured = add_market_context_features(featured, market_df)
    featured = add_targets(featured)

    featured = featured.dropna().reset_index(drop=True)
    if featured.empty:
        raise ValueError(f"No usable feature rows available for symbol {symbol}")

    latest = featured.iloc[[-1]].copy()
    return latest


def predict_symbol(symbol: str, limit: int = 1200) -> dict:
    symbol = symbol.upper().strip()

    artifact = load_model_artifact()
    model = artifact["model"]
    feature_columns = artifact["feature_columns"]
    threshold = artifact["threshold"]

    raw_df = fetch_training_universe_with_benchmark([symbol], limit=limit)

    latest_row = prepare_latest_row_for_symbol(raw_df, symbol)
    X_live = latest_row[feature_columns]

    prob_up = float(model.predict_proba(X_live)[0][1])
    pred_class = int(prob_up >= threshold)

    signal = "UP" if pred_class == 1 else "DOWN"

    return {
        "symbol": symbol,
        "group": "global",
        "prediction_type": "5_day_direction_global_model",
        "signal": signal,
        "prob_up_5d": round(prob_up, 4),
        "prob_down_5d": round(1 - prob_up, 4),
        "threshold": threshold,
        "latest_date": str(latest_row.iloc[0]["date"]),
        "latest_close": round(float(latest_row.iloc[0]["close"]), 2),
    }


if __name__ == "__main__":
    result = predict_symbol("AAPL")
    print(result)