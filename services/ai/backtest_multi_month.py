import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

from data_loader import fetch_training_universe_with_benchmark, get_default_training_symbols
from features import add_features, add_market_context_features, FEATURE_COLUMNS
from targets import add_targets
from data_cleaning import clean_5day_direction_data


BACKTEST_WINDOWS = [
    {"train_start": "2025-02-01", "train_end": "2025-10-31", "test_start": "2025-11-01", "test_end": "2025-11-30", "label": "Nov 2025"},
    {"train_start": "2025-02-01", "train_end": "2025-11-30", "test_start": "2025-12-01", "test_end": "2025-12-31", "label": "Dec 2025"},
    {"train_start": "2025-02-01", "train_end": "2025-12-31", "test_start": "2026-01-01", "test_end": "2026-01-31", "label": "Jan 2026"},
    {"train_start": "2025-02-01", "train_end": "2026-01-31", "test_start": "2026-02-01", "test_end": "2026-02-28", "label": "Feb 2026"},
]

CONFIDENCE_UPPER = 0.55
CONFIDENCE_LOWER = 0.45


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


def run_one_window(df: pd.DataFrame, window: dict) -> tuple[dict, pd.DataFrame]:
    train_df = df[
        (df["date"] >= window["train_start"]) &
        (df["date"] <= window["train_end"])
    ].copy()

    test_df = df[
        (df["date"] >= window["test_start"]) &
        (df["date"] <= window["test_end"])
    ].copy()

    train_df = clean_5day_direction_data(train_df, is_train=True)
    test_df = clean_5day_direction_data(test_df, is_train=False)

    if train_df.empty or test_df.empty:
        return {
            "window": window["label"],
            "train_rows": len(train_df),
            "test_rows": len(test_df),
            "accuracy": None,
            "baseline": None,
            "coverage": 0.0,
        }, pd.DataFrame()

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
        class_weight="balanced",
    )

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_up_5d"]
    model.fit(X_train, y_train)

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target_up_5d"]

    probs = model.predict_proba(X_test)[:, 1]

    mask = (probs > CONFIDENCE_UPPER) | (probs < CONFIDENCE_LOWER)

    if mask.sum() == 0:
        return {
            "window": window["label"],
            "train_rows": len(train_df),
            "test_rows": len(test_df),
            "accuracy": None,
            "baseline": None,
            "coverage": 0.0,
        }, pd.DataFrame()

    y_test_filtered = y_test[mask]
    probs_filtered = probs[mask]
    preds_filtered = (probs_filtered >= 0.5).astype(int)

    overall_acc = accuracy_score(y_test_filtered, preds_filtered)
    baseline = float(y_test_filtered.mean())
    coverage = float(mask.sum() / len(y_test))

    stock_rows = []
    for symbol, sdf in test_df.groupby("symbol", sort=False):
        if len(sdf) < 3:
            continue

        X_symbol = sdf[FEATURE_COLUMNS]
        y_symbol = sdf["target_up_5d"]

        probs_symbol = model.predict_proba(X_symbol)[:, 1]
        mask_symbol = (probs_symbol > CONFIDENCE_UPPER) | (probs_symbol < CONFIDENCE_LOWER)

        if mask_symbol.sum() < 3:
            continue

        probs_symbol = probs_symbol[mask_symbol]
        y_symbol = y_symbol[mask_symbol]

        preds_symbol = (probs_symbol >= 0.5).astype(int)

        stock_acc = accuracy_score(y_symbol, preds_symbol)
        stock_baseline = float(y_symbol.mean())
        stock_coverage = float(mask_symbol.sum() / len(mask_symbol))

        stock_rows.append({
            "window": window["label"],
            "symbol": symbol,
            "accuracy": round(float(stock_acc), 4),
            "baseline": round(float(stock_baseline), 4),
            "coverage": round(float(stock_coverage), 4),
            "samples": int(mask_symbol.sum()),
        })

    stock_results_df = pd.DataFrame(stock_rows)

    overall_result = {
        "window": window["label"],
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "accuracy": round(float(overall_acc), 4),
        "baseline": round(float(baseline), 4),
        "coverage": round(float(coverage), 4),
    }

    return overall_result, stock_results_df


def run_backtest() -> None:
    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    df = prepare_data(raw_df)
    print_date_diagnostics(df)

    overall_results = []
    all_stock_results = []

    for window in BACKTEST_WINDOWS:
        print("=" * 70)
        print(
            f"Window: {window['label']} | "
            f"Train {window['train_start']} → {window['train_end']} | "
            f"Test {window['test_start']} → {window['test_end']}"
        )

        overall_result, stock_results_df = run_one_window(df, window)
        overall_results.append(overall_result)

        print(f"Train rows: {overall_result['train_rows']}")
        print(f"Test rows:  {overall_result['test_rows']}")

        if overall_result["accuracy"] is None:
            print("Skipped: no confident predictions in this window.\n")
            continue

        print(f"Accuracy:   {overall_result['accuracy']:.4f}")
        print(f"Baseline:   {overall_result['baseline']:.4f}")
        print(f"Coverage:   {overall_result['coverage']:.2%}\n")

        if not stock_results_df.empty:
            all_stock_results.append(stock_results_df)

            top_df = stock_results_df.sort_values("accuracy", ascending=False).head(5)
            print("Top stocks in this window:")
            print(top_df.to_string(index=False))
            print()

    overall_df = pd.DataFrame(overall_results)

    print("\n" + "=" * 70)
    print("OVERALL WINDOW SUMMARY")
    print(overall_df.to_string(index=False))

    valid_overall = overall_df.dropna(subset=["accuracy", "baseline"])
    if not valid_overall.empty:
        print("\nAverage overall accuracy:", round(float(valid_overall["accuracy"].mean()), 4))
        print("Average overall baseline:", round(float(valid_overall["baseline"].mean()), 4))
        print("Average overall coverage:", round(float(valid_overall["coverage"].mean()), 4))

    if not all_stock_results:
        print("\nNo per-stock results were produced.")
        return

    stock_df = pd.concat(all_stock_results, ignore_index=True)

    print("\n" + "=" * 70)
    print("ALL STOCK RESULTS BY WINDOW")
    print(stock_df.sort_values(["window", "accuracy"], ascending=[True, False]).to_string(index=False))

    stock_summary = (
        stock_df.groupby("symbol", as_index=False)
        .agg(
            avg_accuracy=("accuracy", "mean"),
            avg_baseline=("baseline", "mean"),
            avg_coverage=("coverage", "mean"),
            total_samples=("samples", "sum"),
            windows_present=("window", "nunique"),
        )
        .sort_values("avg_accuracy", ascending=False)
        .reset_index(drop=True)
    )

    stock_summary["avg_accuracy"] = stock_summary["avg_accuracy"].round(4)
    stock_summary["avg_baseline"] = stock_summary["avg_baseline"].round(4)
    stock_summary["avg_coverage"] = stock_summary["avg_coverage"].round(4)

    print("\n" + "=" * 70)
    print("AVERAGE STOCK PERFORMANCE ACROSS WINDOWS")
    print(stock_summary.to_string(index=False))


if __name__ == "__main__":
    run_backtest()