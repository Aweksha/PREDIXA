import os
import pickle
import pandas as pd

from data_loader import fetch_training_universe_with_benchmark, MARKET_BENCHMARK_SYMBOL
from features import add_features, add_market_context_features
from targets import add_targets


MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "ten_day_signal_model.pkl")


def load_model_artifact():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Saved model not found at {MODEL_PATH}. Run train_10day_signal.py first."
        )

    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def prepare_latest_row_for_symbol(
    raw_df: pd.DataFrame,
    symbol: str,
    feature_columns: list[str]
) -> pd.DataFrame:
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

    featured = featured.dropna(subset=feature_columns).reset_index(drop=True)
    if featured.empty:
        raise ValueError(f"No usable feature rows available for symbol {symbol}")

    latest = featured.iloc[[-1]].copy()
    return latest


def predict_symbol(symbol: str, limit: int = 1200) -> dict:
    symbol = symbol.upper().strip()

    artifact = load_model_artifact()
    model = artifact["model"]
    feature_columns = artifact["feature_columns"]
    label_to_signal = artifact["label_to_signal"]

    fetch_symbols = sorted(
        set([symbol, "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "JHG"])
    )
    raw_df = fetch_training_universe_with_benchmark(fetch_symbols, limit=limit)

    latest_row = prepare_latest_row_for_symbol(raw_df, symbol, feature_columns)
    X_live = latest_row[feature_columns]

    pred_class = int(model.predict(X_live)[0])
    probs = model.predict_proba(X_live)[0]
    class_labels = model.classes_

    prob_map = {
        label_to_signal[int(label)]: round(float(prob), 4)
        for label, prob in zip(class_labels, probs)
    }

    return {
        "symbol": symbol,
        "prediction_type": "10_day_signal",
        "signal": label_to_signal[pred_class],
        "probabilities": prob_map,
        "latest_date": str(latest_row.iloc[0]["date"]),
        "latest_close": round(float(latest_row.iloc[0]["close"]), 2),
    }


if __name__ == "__main__":
    result = predict_symbol("AAPL")
    print(result)