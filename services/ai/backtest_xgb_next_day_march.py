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


TRAIN_START = "2025-02-01"
TRAIN_END   = "2026-02-28"
TEST_START  = "2026-03-01"
TEST_END    = "2026-03-31"


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


def print_date_diagnostics(df: pd.DataFrame) -> None:
    print("Min date in prepared data:", df["date"].min())
    print("Max date in prepared data:", df["date"].max())
    print("\nRows per month:")
    print(df["date"].dt.tz_localize(None).dt.to_period("M").value_counts().sort_index())
    print()


def train_and_backtest_march(df: pd.DataFrame) -> None:
    train_df = df[(df["date"] >= TRAIN_START) & (df["date"] <= TRAIN_END)].copy()
    test_df = df[(df["date"] >= TEST_START) & (df["date"] <= TEST_END)].copy()

    print(f"Train rows: {len(train_df)}")
    print(f"Test rows:  {len(test_df)}")

    if train_df.empty:
        raise ValueError("Training set is empty. Check your training date range.")

    if test_df.empty:
        raise ValueError("Test set is empty. There is no usable March data for next-day testing.")

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_next_return"]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target_next_return"]

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

    pred_returns = model.predict(X_test)
    preds = test_df["close"].values * (1 + pred_returns)

    mae = mean_absolute_error(test_df["target_next_close"], preds)
    r2 = r2_score(test_df["target_next_close"], preds)
    mape = np.mean(np.abs((test_df["target_next_close"].values - preds) / test_df["target_next_close"].values)) * 100

    actual_direction = ((test_df["target_next_close"] - test_df["close"]) > 0).to_numpy()
    predicted_direction = (preds - test_df["close"].to_numpy()) > 0
    directional_accuracy = (actual_direction == predicted_direction).mean()

    print("\n=== OVERALL MARCH NEXT-DAY RESULTS ===")
    print(f"MAE:                  {mae:.4f}")
    print(f"R^2:                  {r2:.4f}")
    print(f"MAPE (%):             {mape:.2f}")
    print(f"Directional Accuracy: {directional_accuracy * 100:.2f}%")

    results_df = test_df[["date", "symbol", "close", "target_next_close"]].copy()
    results_df["predicted_next_close"] = preds
    results_df["error"] = results_df["predicted_next_close"] - results_df["target_next_close"]
    results_df["error_pct"] = (results_df["error"] / results_df["target_next_close"]) * 100
    results_df["actual_up"] = (results_df["target_next_close"] - results_df["close"]) > 0
    results_df["predicted_up"] = (results_df["predicted_next_close"] - results_df["close"]) > 0
    results_df["direction_correct"] = results_df["actual_up"] == results_df["predicted_up"]

    print("\n=== MARCH PREDICTION PREVIEW ===")
    print(
        results_df.head(20).assign(
            predicted_next_close=lambda d: d["predicted_next_close"].round(2),
            error=lambda d: d["error"].round(2),
            error_pct=lambda d: d["error_pct"].round(2),
        ).to_string(index=False)
    )

    stock_rows = []
    for symbol, sdf in results_df.groupby("symbol", sort=False):
        if len(sdf) < 2:
            continue

        stock_mae = mean_absolute_error(sdf["target_next_close"], sdf["predicted_next_close"])
        stock_mape = np.mean(
            np.abs((sdf["target_next_close"].values - sdf["predicted_next_close"].values) / sdf["target_next_close"].values)
        ) * 100
        stock_dir_acc = sdf["direction_correct"].mean()

        stock_rows.append({
            "symbol": symbol,
            "samples": len(sdf),
            "mae": round(float(stock_mae), 4),
            "mape_pct": round(float(stock_mape), 2),
            "directional_accuracy": round(float(stock_dir_acc) * 100, 2),
        })

    stock_summary = pd.DataFrame(stock_rows)

    if stock_summary.empty:
        print("\nNo per-stock March results available.")
        return

    stock_summary = stock_summary.sort_values(
        ["directional_accuracy", "mae"],
        ascending=[False, True]
    ).reset_index(drop=True)

    print("\n=== PER-STOCK MARCH NEXT-DAY RESULTS ===")
    print(stock_summary.to_string(index=False))


def main():
    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    model_df = prepare_model_df(raw_df)
    print_date_diagnostics(model_df)
    train_and_backtest_march(model_df)


if __name__ == "__main__":
    main()
