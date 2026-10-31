import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

from data_loader import fetch_training_universe_with_benchmark, get_default_training_symbols
from features import add_features, add_market_context_features, FEATURE_COLUMNS
from targets import add_targets
from data_cleaning import clean_5day_direction_data


# train on the past year, test on usable March rows only
TRAIN_START = "2025-02-01"
TRAIN_END   = "2026-02-28"
TEST_START  = "2026-03-01"
TEST_END    = "2026-03-19"


def prepare_data(raw_df: pd.DataFrame) -> pd.DataFrame:
    raw_df = raw_df.copy()
    raw_df["date"] = pd.to_datetime(raw_df["date"])

    market_df = raw_df[raw_df["symbol"] == "SPY"].copy()
    frames = []

    for symbol, df in raw_df.groupby("symbol", sort=False):
        if symbol == "SPY":
            continue

        df = df.sort_values("date").reset_index(drop=True)
        df = add_features(df)
        df = add_market_context_features(df, market_df)
        df = add_targets(df)
        df["symbol"] = symbol
        frames.append(df)

    if not frames:
        raise ValueError("No stock data was prepared.")

    df = pd.concat(frames, ignore_index=True)
    df = df.dropna().reset_index(drop=True)

    return df


def print_date_diagnostics(df: pd.DataFrame) -> None:
    print("Min date in prepared data:", df["date"].min())
    print("Max date in prepared data:", df["date"].max())
    print("\nRows per month:")
    print(df["date"].dt.tz_localize(None).dt.to_period("M").value_counts().sort_index())
    print()


def print_test_debug_info(test_df: pd.DataFrame, test_df_clean: pd.DataFrame) -> None:
    print("\n=== TEST DEBUG INFO ===")
    print(f"Rows in test range before cleaning: {len(test_df)}")
    print(f"Rows in test range after cleaning:  {len(test_df_clean)}")

    if not test_df.empty:
        print("\nTest rows before cleaning (first 20):")
        cols = ["date", "symbol", "close"]
        if "target_return_5d" in test_df.columns:
            cols.append("target_return_5d")
        print(test_df[cols].head(20).to_string(index=False))

    if not test_df_clean.empty:
        print("\nTest rows after cleaning (first 20):")
        cols = ["date", "symbol", "close"]
        if "target_return_5d" in test_df_clean.columns:
            cols.append("target_return_5d")
        print(test_df_clean[cols].head(20).to_string(index=False))

    print()


def run_backtest() -> None:
    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    df = prepare_data(raw_df)
    print_date_diagnostics(df)

    train_df = df[(df["date"] >= TRAIN_START) & (df["date"] <= TRAIN_END)].copy()
    test_df = df[(df["date"] >= TEST_START) & (df["date"] <= TEST_END)].copy()

    print(f"Train rows before cleaning: {len(train_df)}")
    print(f"Test rows before cleaning:  {len(test_df)}")

    train_df = clean_5day_direction_data(train_df, is_train=True)
    test_df_clean = clean_5day_direction_data(test_df, is_train=False)

    print(f"Train rows after cleaning:  {len(train_df)}")
    print(f"Test rows after cleaning:   {len(test_df_clean)}")

    print_test_debug_info(test_df, test_df_clean)

    if train_df.empty:
        raise ValueError("Training set is empty. Check your train date range.")

    if test_df_clean.empty:
        raise ValueError(
            "Test set is empty after cleaning. "
            "Try loosening test cleaning more or using an earlier test window."
        )

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
    )

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_up_5d"]

    model.fit(X_train, y_train)

    X_test = test_df_clean[FEATURE_COLUMNS]
    y_test = test_df_clean["target_up_5d"]

    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs >= 0.5).astype(int)

    overall_acc = accuracy_score(y_test, preds)
    baseline = float(y_test.mean())

    print("\n=== OVERALL RESULTS ===")
    print(f"Accuracy: {overall_acc:.4f}")
    print(f"Baseline: {baseline:.4f}")

    print("\n=== PER STOCK ===")
    results = []

    for symbol, sdf in test_df_clean.groupby("symbol", sort=False):
        if len(sdf) < 3:
            continue

        X = sdf[FEATURE_COLUMNS]
        y = sdf["target_up_5d"]

        probs = model.predict_proba(X)[:, 1]
        preds = (probs >= 0.5).astype(int)

        acc = accuracy_score(y, preds)
        baseline_symbol = float(y.mean())

        results.append({
            "symbol": symbol,
            "accuracy": round(float(acc), 4),
            "baseline": round(float(baseline_symbol), 4),
            "samples": int(len(sdf)),
        })

    results_df = pd.DataFrame(results)

    if results_df.empty:
        print("No per-stock results available.")
        return

    results_df = results_df.sort_values("accuracy", ascending=False).reset_index(drop=True)

    print("\nTop stocks:")
    print(results_df.head(10).to_string(index=False))

    print("\nWorst stocks:")
    print(results_df.tail(10).to_string(index=False))


if __name__ == "__main__":
    run_backtest()