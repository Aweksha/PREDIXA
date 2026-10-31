import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

from data_loader import fetch_training_universe_with_benchmark, get_default_training_symbols
from features import add_features, add_market_context_features, FEATURE_COLUMNS
from targets import add_targets
from data_cleaning import clean_5day_direction_data
from behavior_groups import get_behavior_group


BACKTEST_WINDOWS = [
    {"train_start": "2025-02-01", "train_end": "2025-10-31", "test_start": "2025-11-01", "test_end": "2025-11-30", "label": "Nov 2025"},
    {"train_start": "2025-02-01", "train_end": "2025-11-30", "test_start": "2025-12-01", "test_end": "2025-12-31", "label": "Dec 2025"},
    {"train_start": "2025-02-01", "train_end": "2025-12-31", "test_start": "2026-01-01", "test_end": "2026-01-31", "label": "Jan 2026"},
    {"train_start": "2025-02-01", "train_end": "2026-01-31", "test_start": "2026-02-01", "test_end": "2026-02-28", "label": "Feb 2026"},
]

GLOBAL_CONFIDENCE_UPPER = 0.55
GLOBAL_CONFIDENCE_LOWER = 0.45

BEHAVIOR_THRESHOLDS = {
    "momentum": {"upper": 0.57, "lower": 0.43},
}


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


def train_model_for_symbols(
    df: pd.DataFrame,
    symbols: list[str],
    train_start: str,
    train_end: str,
    upper: float,
    lower: float,
) -> dict | None:
    train_df = df[
        (df["symbol"].isin(symbols)) &
        (df["date"] >= train_start) &
        (df["date"] <= train_end)
    ].copy()

    train_df = clean_5day_direction_data(train_df, is_train=True)

    if train_df.empty:
        return None

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_up_5d"]

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
        class_weight="balanced",
    )

    model.fit(X_train, y_train)

    return {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "upper": upper,
        "lower": lower,
        "train_rows": len(train_df),
    }


def predict_with_route(
    model_info: dict,
    sdf: pd.DataFrame,
) -> dict | None:
    X = sdf[model_info["feature_columns"]]
    y = sdf["target_up_5d"]

    probs = model_info["model"].predict_proba(X)[:, 1]
    mask = (probs > model_info["upper"]) | (probs < model_info["lower"])

    if mask.sum() == 0:
        return None

    y_filtered = y[mask]
    probs_filtered = probs[mask]
    preds_filtered = (probs_filtered >= 0.5).astype(int)

    acc = accuracy_score(y_filtered, preds_filtered)
    baseline = float(y_filtered.mean())
    coverage = float(mask.sum() / len(y))

    return {
        "accuracy": float(acc),
        "baseline": baseline,
        "coverage": coverage,
        "samples": int(mask.sum()),
        "actual_up_count": int(y_filtered.sum()),
    }


def run_one_window(df: pd.DataFrame, window: dict) -> tuple[dict, pd.DataFrame]:
    all_symbols = sorted(df["symbol"].unique().tolist())

    global_symbols = [s for s in all_symbols if get_behavior_group(s) not in {"momentum", "weak"}]
    momentum_symbols = [s for s in all_symbols if get_behavior_group(s) == "momentum"]

    global_model_info = train_model_for_symbols(
        df,
        global_symbols,
        window["train_start"],
        window["train_end"],
        GLOBAL_CONFIDENCE_UPPER,
        GLOBAL_CONFIDENCE_LOWER,
    )

    momentum_model_info = None
    if momentum_symbols:
        thresholds = BEHAVIOR_THRESHOLDS["momentum"]
        momentum_model_info = train_model_for_symbols(
            df,
            momentum_symbols,
            window["train_start"],
            window["train_end"],
            thresholds["upper"],
            thresholds["lower"],
        )

    test_df = df[
        (df["date"] >= window["test_start"]) &
        (df["date"] <= window["test_end"])
    ].copy()

    test_df = clean_5day_direction_data(test_df, is_train=False)

    if test_df.empty:
        return {
            "window": window["label"],
            "test_rows": 0,
            "accuracy": None,
            "baseline": None,
            "coverage": 0.0,
            "predictions_used": 0,
        }, pd.DataFrame()

    stock_rows = []
    overall_correct = 0
    overall_total = 0
    overall_actual_up = 0

    for symbol, sdf in test_df.groupby("symbol", sort=False):
        group = get_behavior_group(symbol)

        if group == "weak":
            continue

        if group == "momentum":
            if momentum_model_info is None:
                continue
            route = "behavior_momentum"
            model_info = momentum_model_info
        else:
            if global_model_info is None:
                continue
            route = "global_fallback"
            model_info = global_model_info

        result = predict_with_route(model_info, sdf)
        if result is None or result["samples"] < 3:
            continue

        correct_count = int(round(result["accuracy"] * result["samples"]))
        overall_correct += correct_count
        overall_total += result["samples"]
        overall_actual_up += result["actual_up_count"]

        stock_rows.append({
            "window": window["label"],
            "symbol": symbol,
            "group": group,
            "route": route,
            "accuracy": round(result["accuracy"], 4),
            "baseline": round(result["baseline"], 4),
            "coverage": round(result["coverage"], 4),
            "samples": result["samples"],
        })

    stock_results_df = pd.DataFrame(stock_rows)

    if overall_total == 0:
        return {
            "window": window["label"],
            "test_rows": len(test_df),
            "accuracy": None,
            "baseline": None,
            "coverage": 0.0,
            "predictions_used": 0,
        }, stock_results_df

    overall_accuracy = overall_correct / overall_total
    overall_baseline = overall_actual_up / overall_total
    overall_coverage = overall_total / len(test_df)

    overall_result = {
        "window": window["label"],
        "test_rows": len(test_df),
        "accuracy": round(float(overall_accuracy), 4),
        "baseline": round(float(overall_baseline), 4),
        "coverage": round(float(overall_coverage), 4),
        "predictions_used": int(overall_total),
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

        print(f"Test rows:         {overall_result['test_rows']}")
        print(f"Predictions used:  {overall_result['predictions_used']}")

        if overall_result["accuracy"] is None:
            print("Skipped: no usable hybrid predictions in this window.\n")
            continue

        print(f"Accuracy:          {overall_result['accuracy']:.4f}")
        print(f"Baseline:          {overall_result['baseline']:.4f}")
        print(f"Coverage:          {overall_result['coverage']:.2%}\n")

        if not stock_results_df.empty:
            all_stock_results.append(stock_results_df)

            top_df = stock_results_df.sort_values("accuracy", ascending=False).head(8)
            print("Top stocks in this window:")
            print(top_df.to_string(index=False))
            print()

    overall_df = pd.DataFrame(overall_results)

    print("\n" + "=" * 70)
    print("HYBRID OVERALL WINDOW SUMMARY")
    print(overall_df.to_string(index=False))

    valid_overall = overall_df.dropna(subset=["accuracy", "baseline"])
    if not valid_overall.empty:
        print("\nAverage hybrid accuracy:", round(float(valid_overall["accuracy"].mean()), 4))
        print("Average hybrid baseline:", round(float(valid_overall["baseline"].mean()), 4))
        print("Average hybrid coverage:", round(float(valid_overall["coverage"].mean()), 4))

    if not all_stock_results:
        print("\nNo per-stock hybrid results were produced.")
        return

    stock_df = pd.concat(all_stock_results, ignore_index=True)

    print("\n" + "=" * 70)
    print("ALL HYBRID STOCK RESULTS BY WINDOW")
    print(stock_df.sort_values(["window", "accuracy"], ascending=[True, False]).to_string(index=False))

    stock_summary = (
        stock_df.groupby(["symbol", "group", "route"], as_index=False)
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
    print("AVERAGE HYBRID STOCK PERFORMANCE")
    print(stock_summary.to_string(index=False))


if __name__ == "__main__":
    run_backtest()