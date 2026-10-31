import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

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
from targets import (
    add_targets,
    TARGET_NEXT_CLOSE_COLUMN,
)
from splitters import chronological_split_by_symbol


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
        featured = add_targets(featured)
        featured["symbol"] = symbol
        frames.append(featured)

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    combined = combined.dropna(subset=FEATURE_COLUMNS + [TARGET_NEXT_CLOSE_COLUMN]).reset_index(drop=True)

    return combined


def directional_accuracy(y_true: pd.Series, y_pred: np.ndarray, current_close: pd.Series) -> float:
    true_dir = (y_true.values > current_close.values).astype(int)
    pred_dir = (y_pred > current_close.values).astype(int)
    return float((true_dir == pred_dir).mean())


def main():
    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)
    model_df = prepare_model_df(raw_df)

    train_df, test_df = chronological_split_by_symbol(model_df, train_ratio=0.8)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_NEXT_CLOSE_COLUMN]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df[TARGET_NEXT_CLOSE_COLUMN]

    model = XGBRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=5,
        min_child_weight=4,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.1,
        reg_lambda=1.2,
        objective="reg:squarederror",
        random_state=42,
    )

    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    mae = mean_absolute_error(y_test, preds)
    rmse = mean_squared_error(y_test, preds) ** 0.5
    r2 = r2_score(y_test, preds)
    dir_acc = directional_accuracy(y_test, preds, test_df["close"])

    print("\n=== Next-Day Close Model Results ===")
    print(f"Train rows: {len(train_df)}")
    print(f"Test rows:  {len(test_df)}")
    print(f"MAE:        {mae:.4f}")
    print(f"RMSE:       {rmse:.4f}")
    print(f"R^2:        {r2:.4f}")
    print(f"Dir Acc:    {dir_acc:.4f}")


if __name__ == "__main__":
    main()