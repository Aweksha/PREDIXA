import os
import pickle
import pandas as pd
import numpy as np
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, r2_score

from data_loader import (
    fetch_training_universe_with_benchmark,
    get_default_training_symbols,
    MARKET_BENCHMARK_SYMBOL,
)
from features import (
    add_features,
    add_market_context_features,
    FEATURE_COLUMNS,
)


MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "xgb_next_close_model.pkl")
DEFAULT_RETURN_CLIP_BOUNDS = (-0.15, 0.15)


def add_next_day_target(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["target_next_close"] = out["close"].shift(-1)
    out["target_next_return"] = (out["target_next_close"] / out["close"]) - 1
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
    combined = combined.dropna(
        subset=FEATURE_COLUMNS + ["target_next_close", "target_next_return"]
    ).reset_index(drop=True)

    return combined


def chronological_split_by_symbol(
    df: pd.DataFrame,
    train_ratio: float = 0.8,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    train_frames = []
    test_frames = []

    for symbol, symbol_df in df.groupby("symbol", sort=False):
        symbol_df = symbol_df.sort_values("date").reset_index(drop=True)

        split_idx = int(len(symbol_df) * train_ratio)
        if split_idx <= 0 or split_idx >= len(symbol_df):
            continue

        train_frames.append(symbol_df.iloc[:split_idx].copy())
        test_frames.append(symbol_df.iloc[split_idx:].copy())

    if not train_frames or not test_frames:
        raise ValueError("Could not create train/test split.")

    train_df = pd.concat(train_frames, ignore_index=True)
    test_df = pd.concat(test_frames, ignore_index=True)

    return train_df, test_df


def resolve_return_clip_bounds(y: pd.Series) -> tuple[float, float]:
    lower = float(y.quantile(0.005))
    upper = float(y.quantile(0.995))
    default_lower, default_upper = DEFAULT_RETURN_CLIP_BOUNDS
    lower = max(default_lower, lower)
    upper = min(default_upper, upper)
    if lower >= upper:
      return DEFAULT_RETURN_CLIP_BOUNDS
    return (lower, upper)


def main():
    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    model_df = prepare_model_df(raw_df)
    train_df, test_df = chronological_split_by_symbol(model_df, train_ratio=0.8)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_next_return"]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target_next_return"]
    return_clip_bounds = resolve_return_clip_bounds(y_train)

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

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    pred_returns = np.clip(model.predict(X_test), *return_clip_bounds)
    preds = test_df["close"].values * (1 + pred_returns)

    mae = mean_absolute_error(test_df["target_next_close"], preds)
    r2 = r2_score(test_df["target_next_close"], preds)
    mape = np.mean(np.abs((test_df["target_next_close"].values - preds) / test_df["target_next_close"].values)) * 100

    actual_direction = (test_df["target_next_close"] - test_df["close"]) > 0
    predicted_direction = (preds - test_df["close"].values) > 0
    directional_accuracy = (actual_direction.to_numpy() == predicted_direction).mean()
    
    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "target_type": "next_day_return",
        "return_clip_bounds": [float(return_clip_bounds[0]), float(return_clip_bounds[1])],
        "metrics": {
            "mae": float(mae),
            "r2": float(r2),
            "mape": float(mape),
            "directional_accuracy": float(directional_accuracy),
            "return_mae": float(mean_absolute_error(y_test, pred_returns)),
            "train_rows": int(len(train_df)),
            "test_rows": int(len(test_df)),
        },
    }

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)

    print("\n=== XGBoost Next-Day Close Results ===")
    print(f"Train rows:              {len(train_df)}")
    print(f"Test rows:               {len(test_df)}")
    print(f"Features used:           {len(FEATURE_COLUMNS)}")
    print(f"MAE:                     {mae:.4f}")
    print(f"R^2:                     {r2:.4f}")
    print(f"MAPE (%):                {mape:.2f}")
    print(f"Directional Accuracy:    {directional_accuracy * 100:.2f}%")
    print(f"Return clip bounds:      [{return_clip_bounds[0]:.4f}, {return_clip_bounds[1]:.4f}]")
    print(f"Saved model to:          {MODEL_PATH}")

    preview_df = test_df[["date", "symbol", "close", "target_next_close"]].copy()
    preview_df["predicted_next_close"] = preds
    preview_df["predicted_next_return"] = pred_returns
    preview_df["error"] = preview_df["predicted_next_close"] - preview_df["target_next_close"]
    preview_df["error_pct"] = (preview_df["error"] / preview_df["target_next_close"]) * 100

    print("\n=== Prediction Preview ===")
    print(
        preview_df.head(20).assign(
            predicted_next_close=lambda d: d["predicted_next_close"].round(2),
            predicted_next_return=lambda d: (d["predicted_next_return"] * 100).round(2),
            error=lambda d: d["error"].round(2),
            error_pct=lambda d: d["error_pct"].round(2),
        ).to_string(index=False)
    )


if __name__ == "__main__":
    main()
