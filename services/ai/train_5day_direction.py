import os
import pickle
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

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
    TARGET_5DAY_DIRECTION_COLUMN,
)
from splitters import chronological_split_by_symbol
from data_cleaning import clean_5day_direction_data


MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "five_day_direction_model.pkl")


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

    if not frames:
        raise ValueError("No stock frames were created.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)

    combined = combined.dropna(
        subset=FEATURE_COLUMNS + [TARGET_5DAY_DIRECTION_COLUMN, "target_return_5d"]
    ).reset_index(drop=True)

    return combined


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    model_df = prepare_model_df(raw_df)
    model_df = clean_5day_direction_data(model_df)

    train_df, test_df = chronological_split_by_symbol(model_df, train_ratio=0.8)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_5DAY_DIRECTION_COLUMN]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df[TARGET_5DAY_DIRECTION_COLUMN]

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    probs = model.predict_proba(X_test)[:, 1]
    threshold = 0.50
    preds = (probs >= threshold).astype(int)

    acc = accuracy_score(y_test, preds)
    precision = precision_score(y_test, preds, zero_division=0)
    recall = recall_score(y_test, preds, zero_division=0)
    f1 = f1_score(y_test, preds, zero_division=0)
    cm = confusion_matrix(y_test, preds)

    baseline_up_rate = float(y_test.mean())

    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "threshold": threshold,
        "metrics": {
            "accuracy": float(acc),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "baseline_up_rate": baseline_up_rate,
        },
    }

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)

    print("\n=== 5-Day Direction Model Results ===")
    print(f"Rows after cleaning: {len(model_df)}")
    print(f"Train rows: {len(train_df)}")
    print(f"Test rows:  {len(test_df)}")
    print(f"Accuracy:   {acc:.4f}")
    print(f"Precision:  {precision:.4f}")
    print(f"Recall:     {recall:.4f}")
    print(f"F1 Score:   {f1:.4f}")
    print(f"Baseline UP rate: {baseline_up_rate:.4f}")
    print(f"Threshold:  {threshold:.2f}")
    print("\nConfusion Matrix:")
    print(cm)
    print(f"\nSaved model to: {MODEL_PATH}")


if __name__ == "__main__":
    main()