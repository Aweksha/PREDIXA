import os
import pickle
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

from data_loader import fetch_training_universe_with_benchmark, MARKET_BENCHMARK_SYMBOL
from features import add_features, add_market_context_features, FEATURE_COLUMNS
from targets import add_targets
from data_cleaning import clean_5day_direction_data
from stock_groups import STOCK_GROUPS


MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
CONFIDENCE_UPPER = 0.55
CONFIDENCE_LOWER = 0.45


def prepare_group_data(raw_df: pd.DataFrame) -> pd.DataFrame:
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

    if not frames:
        raise ValueError("No processed stock data was created for this group.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    combined = combined.dropna().reset_index(drop=True)

    return combined


def chronological_split_by_symbol(df: pd.DataFrame, train_ratio: float = 0.8) -> tuple[pd.DataFrame, pd.DataFrame]:
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
        raise ValueError("Could not build chronological split for this group.")

    train_df = pd.concat(train_frames, ignore_index=True)
    test_df = pd.concat(test_frames, ignore_index=True)

    return train_df, test_df


def train_one_group(group_name: str, symbols: list[str], limit: int = 1200) -> dict:
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=limit)
    model_df = prepare_group_data(raw_df)

    train_df, test_df = chronological_split_by_symbol(model_df, train_ratio=0.8)

    train_df = clean_5day_direction_data(train_df, is_train=True)
    test_df = clean_5day_direction_data(test_df, is_train=False)

    if train_df.empty or test_df.empty:
        raise ValueError(f"Empty train/test data for group {group_name}")

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target_up_5d"]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target_up_5d"]

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
        class_weight="balanced",
    )

    model.fit(X_train, y_train)

    probs = model.predict_proba(X_test)[:, 1]
    mask = (probs > CONFIDENCE_UPPER) | (probs < CONFIDENCE_LOWER)

    if mask.sum() == 0:
        accuracy = None
        baseline = None
        coverage = 0.0
    else:
        y_test_filtered = y_test[mask]
        probs_filtered = probs[mask]
        preds_filtered = (probs_filtered >= 0.5).astype(int)

        accuracy = float(accuracy_score(y_test_filtered, preds_filtered))
        baseline = float(y_test_filtered.mean())
        coverage = float(mask.sum() / len(y_test))

    artifact = {
        "group_name": group_name,
        "symbols": symbols,
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "confidence_upper": CONFIDENCE_UPPER,
        "confidence_lower": CONFIDENCE_LOWER,
        "metrics": {
            "train_rows": int(len(train_df)),
            "test_rows": int(len(test_df)),
            "accuracy": accuracy,
            "baseline": baseline,
            "coverage": coverage,
        },
    }

    os.makedirs(MODEL_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_DIR, f"group_{group_name}.pkl")

    with open(model_path, "wb") as f:
        pickle.dump(artifact, f)

    return {
        "group": group_name,
        "symbols": symbols,
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "accuracy": accuracy,
        "baseline": baseline,
        "coverage": coverage,
        "model_path": model_path,
    }


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=== TRAINING GROUP MODELS ===\n")

    results = []

    for group_name, symbols in STOCK_GROUPS.items():
        print(f"Training group: {group_name}")
        print(f"Symbols: {symbols}")

        try:
            result = train_one_group(group_name, symbols)
            results.append(result)

            print(f"Train rows: {result['train_rows']}")
            print(f"Test rows:  {result['test_rows']}")
            print(f"Accuracy:   {result['accuracy']}")
            print(f"Baseline:   {result['baseline']}")
            print(f"Coverage:   {result['coverage']}")
            print(f"Saved to:   {result['model_path']}\n")

        except Exception as exc:
            print(f"Failed for group {group_name}: {exc}\n")

    if not results:
        print("No group models were trained.")
        return

    summary_df = pd.DataFrame(results)
    print("=== GROUP MODEL SUMMARY ===")
    print(summary_df.to_string(index=False))


if __name__ == "__main__":
    main()