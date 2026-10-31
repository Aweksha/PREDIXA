import os
import pickle
import pandas as pd
from xgboost import XGBRegressor

from data_loader import fetch_training_universe_with_benchmark, MARKET_BENCHMARK_SYMBOL
from features import add_features, add_market_context_features, FEATURE_COLUMNS


MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "xgb_next_close_model.pkl")
DEFAULT_RETURN_CLIP_BOUNDS = (-0.15, 0.15)


def add_next_day_target(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["target_next_close"] = out["close"].shift(-1)
    out = out.dropna().reset_index(drop=True)
    return out


def prepare_model_df(raw_df: pd.DataFrame) -> pd.DataFrame:
    raw_df = raw_df.copy()
    raw_df["date"] = pd.to_datetime(raw_df["date"])

    market_df = raw_df[raw_df["symbol"] == MARKET_BENCHMARK_SYMBOL].copy()
    if market_df.empty:
        raise ValueError("SPY data is required for market context features.")

    frames = []

    for symbol, symbol_df in raw_df.groupby("symbol", sort=False):
        if symbol == MARKET_BENCHMARK_SYMBOL:
            continue

        symbol_df = symbol_df.sort_values("date").reset_index(drop=True)

        featured = add_features(symbol_df)
        featured = add_market_context_features(featured, market_df)
        featured = add_next_day_target(featured)
        featured["symbol"] = symbol
        frames.append(featured)

    if not frames:
        raise ValueError("No stock frames were created.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    combined = combined.dropna(subset=FEATURE_COLUMNS + ["target_next_close"]).reset_index(drop=True)

    return combined


def train_and_save_model(limit: int = 1200) -> str:
    from data_loader import get_default_training_symbols

    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=limit)
    model_df = prepare_model_df(raw_df)

    X = model_df[FEATURE_COLUMNS]
    y = model_df["target_next_return"]

    model = XGBRegressor(
        n_estimators=300,
        learning_rate=0.04,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        verbosity=0,
    )

    model.fit(X, y, verbose=False)

    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "target_type": "next_day_return",
    }

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)

    return MODEL_PATH


def load_model_artifact() -> dict:
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Saved XGBoost model not found at {MODEL_PATH}. "
            f"Run train_xgb_next_close.py or call train_and_save_model() first."
        )

    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def prepare_latest_row_for_symbol(raw_df: pd.DataFrame, symbol: str, feature_columns: list[str]) -> pd.DataFrame:
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

    return featured.iloc[[-1]].copy()


def clip_predicted_return(raw_prediction: float, artifact: dict) -> float:
    lower, upper = artifact.get("return_clip_bounds", DEFAULT_RETURN_CLIP_BOUNDS)
    return float(min(max(raw_prediction, float(lower)), float(upper)))

def predict_symbol(symbol: str, limit: int = 1200) -> dict:
    symbol = symbol.upper().strip()

    artifact = load_model_artifact()
    model = artifact["model"]
    feature_columns = artifact["feature_columns"]

    raw_df = fetch_training_universe_with_benchmark([symbol], limit=limit)
    latest_row = prepare_latest_row_for_symbol(raw_df, symbol, feature_columns)
    X_live = latest_row[feature_columns]

    current_close = float(latest_row.iloc[0]["close"])
    raw_prediction = float(model.predict(X_live)[0])
    target_type = artifact.get("target_type", "next_day_close")
    clipped_prediction = (
        clip_predicted_return(raw_prediction, artifact)
        if target_type == "next_day_return"
        else raw_prediction
    )
    predicted_next_close = (
        current_close * (1 + clipped_prediction)
        if target_type == "next_day_return"
        else raw_prediction
    )
    expected_move = predicted_next_close - current_close
    expected_move_pct = (expected_move / current_close) * 100 if current_close else 0.0

    return {
        "symbol": symbol,
        "prediction_type": "next_day_price_regression",
        "latest_date": str(latest_row.iloc[0]["date"]),
        "current_close": round(current_close, 2),
        "predicted_next_return": round(clipped_prediction, 6) if target_type == "next_day_return" else None,
        "predicted_next_close": round(predicted_next_close, 2),
        "expected_move": round(expected_move, 2),
        "expected_move_pct": round(expected_move_pct, 2),
    }


if __name__ == "__main__":
    print(predict_symbol("NVDA"))
