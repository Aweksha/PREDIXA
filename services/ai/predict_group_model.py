import os
import pickle
import pandas as pd

from data_loader import fetch_training_universe_with_benchmark, MARKET_BENCHMARK_SYMBOL
from features import add_features, add_market_context_features
from targets import add_targets
from stock_groups import get_group_for_symbol, get_symbols_for_group


MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")


def load_group_artifact(group_name: str) -> dict:
    model_path = os.path.join(MODEL_DIR, f"group_{group_name}.pkl")

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Model for group '{group_name}' not found at {model_path}. "
            f"Run train_group_models.py first."
        )

    with open(model_path, "rb") as f:
        return pickle.load(f)


def prepare_latest_row_for_symbol(raw_df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    raw_df = raw_df.copy()
    raw_df["date"] = pd.to_datetime(raw_df["date"])

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

    return featured.iloc[[-1]].copy()


def predict_symbol(symbol: str, limit: int = 1200) -> dict:
    symbol = symbol.upper().strip()

    group_name = get_group_for_symbol(symbol)
    if group_name is None:
        raise ValueError(f"Symbol {symbol} is not assigned to any stock group.")

    artifact = load_group_artifact(group_name)

    model = artifact["model"]
    feature_columns = artifact["feature_columns"]
    confidence_upper = artifact["confidence_upper"]
    confidence_lower = artifact["confidence_lower"]

    fetch_symbols = sorted(set(get_symbols_for_group(group_name) + [symbol]))
    raw_df = fetch_training_universe_with_benchmark(fetch_symbols, limit=limit)

    latest_row = prepare_latest_row_for_symbol(raw_df, symbol)
    X_live = latest_row[feature_columns]

    prob_up = float(model.predict_proba(X_live)[0][1])
    pred_class = int(prob_up >= 0.5)

    if prob_up > confidence_upper:
        signal = "UP"
    elif prob_up < confidence_lower:
        signal = "DOWN"
    else:
        signal = "HOLD"

    return {
        "symbol": symbol,
        "group": group_name,
        "prediction_type": "5_day_direction_group_model",
        "signal": signal,
        "prob_up_5d": round(prob_up, 4),
        "prob_down_5d": round(1 - prob_up, 4),
        "confidence_upper": confidence_upper,
        "confidence_lower": confidence_lower,
        "raw_direction_class": pred_class,
        "latest_date": str(latest_row.iloc[0]["date"]),
        "latest_close": round(float(latest_row.iloc[0]["close"]), 2),
    }


if __name__ == "__main__":
    result = predict_symbol("NVDA")
    print(result)