import os
import pickle
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

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
    TARGET_10DAY_SIGNAL_COLUMN,
)
from splitters import chronological_split_by_symbol
from data_cleaning import clean_10day_signal_data


MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "ten_day_signal_model.pkl")


LABEL_TO_SIGNAL = {
    -1: "SELL",
    0: "HOLD",
    1: "BUY",
}


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
        subset=FEATURE_COLUMNS + [TARGET_10DAY_SIGNAL_COLUMN, "target_return_10d"]
    ).reset_index(drop=True)

    return combined


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    model_df = prepare_model_df(raw_df)
    model_df = clean_10day_signal_data(model_df)

    train_df, test_df = chronological_split_by_symbol(model_df, train_ratio=0.8)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_10DAY_SIGNAL_COLUMN]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df[TARGET_10DAY_SIGNAL_COLUMN]

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
        class_weight="balanced",
    )

    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    acc = accuracy_score(y_test, preds)
    cm = confusion_matrix(y_test, preds, labels=[-1, 0, 1])
    report = classification_report(
        y_test,
        preds,
        labels=[-1, 0, 1],
        target_names=["SELL", "HOLD", "BUY"],
        zero_division=0,
    )

    class_distribution = y_test.value_counts(normalize=True).sort_index().to_dict()
    class_distribution_named = {
        LABEL_TO_SIGNAL[k]: round(float(v), 4)
        for k, v in class_distribution.items()
    }

    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "label_to_signal": LABEL_TO_SIGNAL,
        "metrics": {
            "accuracy": float(acc),
            "class_distribution": class_distribution_named,
        },
    }

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)

    print("\n=== 10-Day Buy/Hold/Sell Model Results ===")
    print(f"Rows after cleaning: {len(model_df)}")
    print(f"Train rows: {len(train_df)}")
    print(f"Test rows:  {len(test_df)}")
    print(f"Accuracy:   {acc:.4f}")
    print(f"Test class distribution: {class_distribution_named}")
    print("\nConfusion Matrix [SELL, HOLD, BUY]:")
    print(cm)
    print("\nClassification Report:")
    print(report)
    print(f"Saved model to: {MODEL_PATH}")


if __name__ == "__main__":
    main()