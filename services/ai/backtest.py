import pandas as pd
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report
from xgboost import XGBClassifier

from data_loader import (
    fetch_multi_stock_history,
    get_default_training_symbols,
)
from features import (
    add_features,
    FEATURE_COLUMNS,
    TARGET_CLASS_COLUMN,
    TARGET_RETURN_COLUMN,
    ACTUAL_PRICE_COLUMN,
    CLASS_LABELS,
    BUY_THRESHOLD,
    SELL_THRESHOLD,
)


CONFIDENCE_THRESHOLD = 0.45


def add_symbol_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    symbol_codes = {symbol: idx for idx, symbol in enumerate(sorted(out["symbol"].unique()))}
    out["symbol_code"] = out["symbol"].map(symbol_codes).astype(int)
    return out


def feature_columns_with_symbol() -> list[str]:
    return FEATURE_COLUMNS + ["symbol_code"]


def prepare_featured_stock_df(raw_df: pd.DataFrame) -> pd.DataFrame:
    frames = []

    for symbol, symbol_df in raw_df.groupby("symbol", sort=False):
        symbol_df = symbol_df.sort_values("date").reset_index(drop=True)
        featured = add_features(symbol_df)
        featured["symbol"] = symbol
        frames.append(featured)

    if not frames:
        raise ValueError("No processed stock data available after feature engineering.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    combined = add_symbol_features(combined)

    return combined


def compute_class_weights(y: pd.Series) -> dict:
    counts = y.value_counts().to_dict()
    total = len(y)
    num_classes = len(counts)

    weights = {}
    for cls, count in counts.items():
        weights[int(cls)] = total / (num_classes * count)

    return weights


def build_sample_weights(y: pd.Series, class_weights: dict) -> np.ndarray:
    return np.array([class_weights[int(v)] for v in y])


def adjust_signal_with_confidence(predicted_class: int, max_prob: float, threshold: float = CONFIDENCE_THRESHOLD) -> int:
    """
    If confidence is weak, force HOLD.
    """
    if max_prob < threshold:
        return 1
    return int(predicted_class)


def compute_classification_metrics(y_true: pd.Series, y_pred: pd.Series) -> dict:
    acc = accuracy_score(y_true, y_pred)

    labels = [0, 1, 2]
    cm = confusion_matrix(y_true, y_pred, labels=labels)

    report = classification_report(
        y_true,
        y_pred,
        labels=labels,
        target_names=[CLASS_LABELS[x] for x in labels],
        output_dict=True,
        zero_division=0,
    )

    return {
        "accuracy": round(float(acc) * 100, 2),
        "confusion_matrix": {
            "labels": [CLASS_LABELS[x] for x in labels],
            "matrix": cm.tolist(),
        },
        "classification_report": {
            label: {
                "precision": round(float(values["precision"]), 4),
                "recall": round(float(values["recall"]), 4),
                "f1_score": round(float(values["f1-score"]), 4),
                "support": int(values["support"]),
            }
            for label, values in report.items()
            if label in ["SELL", "HOLD", "BUY"]
        },
    }


def compute_display_metrics(y_true: pd.Series, y_pred_display: pd.Series) -> dict:
    """
    Metrics for the confidence-adjusted signal that the UI would actually show.
    """
    metrics = compute_classification_metrics(y_true, y_pred_display)

    non_hold_mask = y_pred_display != 1
    if non_hold_mask.sum() == 0:
        metrics["signal_quality"] = {
            "coverage_pct": 0.0,
            "non_hold_precision": 0.0,
            "buy_precision_when_called": 0.0,
            "sell_precision_when_called": 0.0,
        }
        return metrics

    coverage = float(non_hold_mask.mean()) * 100
    non_hold_correct = float((y_true[non_hold_mask] == y_pred_display[non_hold_mask]).mean())

    buy_mask = y_pred_display == 2
    sell_mask = y_pred_display == 0

    buy_precision = float((y_true[buy_mask] == 2).mean()) if buy_mask.sum() > 0 else 0.0
    sell_precision = float((y_true[sell_mask] == 0).mean()) if sell_mask.sum() > 0 else 0.0

    metrics["signal_quality"] = {
        "coverage_pct": round(coverage, 2),
        "non_hold_precision": round(non_hold_correct * 100, 2),
        "buy_precision_when_called": round(buy_precision * 100, 2),
        "sell_precision_when_called": round(sell_precision * 100, 2),
    }

    return metrics


def run_multistock_backtest(
    test_symbol: str,
    limit: int = 1200,
    training_symbols: list[str] | None = None,
    test_ratio: float = 0.2,
) -> dict:
    test_symbol = test_symbol.upper().strip()

    if training_symbols is None:
        training_symbols = get_default_training_symbols(exclude_symbol=test_symbol)

    fetch_symbols = sorted(set(training_symbols + [test_symbol]))

    raw_df = fetch_multi_stock_history(symbols=fetch_symbols, limit=limit)
    featured_df = prepare_featured_stock_df(raw_df)

    if len(featured_df) < 500:
        raise ValueError("Not enough processed rows for training.")

    test_stock_df = featured_df[featured_df["symbol"] == test_symbol].copy()
    if len(test_stock_df) < 150:
        raise ValueError(f"Not enough processed rows for test symbol {test_symbol}.")

    split_index = int(len(test_stock_df) * (1 - test_ratio))
    test_stock_train_part = test_stock_df.iloc[:split_index].copy()
    test_stock_test_part = test_stock_df.iloc[split_index:].copy()

    other_training_df = featured_df[featured_df["symbol"] != test_symbol].copy()

    train_df = pd.concat([other_training_df, test_stock_train_part], ignore_index=True)
    train_df = train_df.sort_values(["symbol", "date"]).reset_index(drop=True)

    test_df = test_stock_test_part.sort_values("date").reset_index(drop=True)

    feature_cols = feature_columns_with_symbol()

    X_train = train_df[feature_cols]
    y_train = train_df[TARGET_CLASS_COLUMN]

    X_test = test_df[feature_cols]
    y_test = test_df[TARGET_CLASS_COLUMN]

    class_weights = compute_class_weights(y_train)
    sample_weights = build_sample_weights(y_train, class_weights)

    model = XGBClassifier(
        n_estimators=600,
        learning_rate=0.03,
        max_depth=5,
        min_child_weight=4,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.15,
        reg_lambda=1.5,
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        random_state=42,
    )

    model.fit(X_train, y_train, sample_weight=sample_weights)

    predicted_class = model.predict(X_test)
    predicted_probs = model.predict_proba(X_test)

    max_probs = predicted_probs.max(axis=1)
    adjusted_predicted_class = np.array([
        adjust_signal_with_confidence(predicted_class[i], max_probs[i], CONFIDENCE_THRESHOLD)
        for i in range(len(predicted_class))
    ])

    raw_metrics = compute_classification_metrics(y_test, predicted_class)
    display_metrics = compute_display_metrics(y_test, adjusted_predicted_class)

    results_df = pd.DataFrame({
        "date": test_df["date"],
        "symbol": test_df["symbol"],
        "current_close": test_df["close"],
        "actual_5d_close": test_df[ACTUAL_PRICE_COLUMN],
        "actual_5d_return": test_df[TARGET_RETURN_COLUMN],
        "actual_class_num": y_test,
        "predicted_class_num_raw": predicted_class,
        "predicted_class_num_display": adjusted_predicted_class,
        "sell_probability": predicted_probs[:, 0],
        "hold_probability": predicted_probs[:, 1],
        "buy_probability": predicted_probs[:, 2],
    })

    results_df["actual_signal"] = results_df["actual_class_num"].map(CLASS_LABELS)
    results_df["predicted_signal_raw"] = results_df["predicted_class_num_raw"].map(CLASS_LABELS)
    results_df["predicted_signal_display"] = results_df["predicted_class_num_display"].map(CLASS_LABELS)

    results_df["confidence"] = results_df[
        ["sell_probability", "hold_probability", "buy_probability"]
    ].max(axis=1)

    results_df["correct_prediction_raw"] = (
        results_df["actual_class_num"] == results_df["predicted_class_num_raw"]
    )

    results_df["correct_prediction_display"] = (
        results_df["actual_class_num"] == results_df["predicted_class_num_display"]
    )

    importances = model.feature_importances_
    feature_importance_pairs = sorted(
        zip(feature_cols, importances),
        key=lambda x: x[1],
        reverse=True,
    )

    top_features = [
        {"feature": feature, "importance": round(float(importance), 6)}
        for feature, importance in feature_importance_pairs[:20]
    ]

    class_counts_train = train_df[TARGET_CLASS_COLUMN].value_counts().sort_index()
    class_counts_test = test_df[TARGET_CLASS_COLUMN].value_counts().sort_index()

    train_distribution = {
        CLASS_LABELS[int(k)]: int(v)
        for k, v in class_counts_train.items()
    }

    test_distribution = {
        CLASS_LABELS[int(k)]: int(v)
        for k, v in class_counts_test.items()
    }

    return {
        "mode": "multi_stock_train_single_stock_test_5d_classifier_weighted_confidence_adjusted",
        "test_symbol": test_symbol,
        "training_symbol_count": len(training_symbols),
        "training_symbols": training_symbols,
        "rows_raw_total": int(len(raw_df)),
        "rows_featured_total": int(len(featured_df)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "target": {
            "horizon_days": 5,
            "buy_threshold": BUY_THRESHOLD,
            "sell_threshold": SELL_THRESHOLD,
            "class_mapping": CLASS_LABELS,
        },
        "confidence_rule": {
            "display_confidence_threshold": CONFIDENCE_THRESHOLD,
            "behavior": "force HOLD when max probability is below threshold",
        },
        "class_weights": {CLASS_LABELS[k]: round(float(v), 4) for k, v in class_weights.items()},
        "class_distribution": {
            "train": train_distribution,
            "test": test_distribution,
        },
        "metrics": {
            "raw_model": raw_metrics,
            "display_signal": display_metrics,
        },
        "top_features": top_features,
        "predictions": results_df.to_dict(orient="records"),
        "feature_columns": feature_cols,
        "target_column": TARGET_CLASS_COLUMN,
    }


def run_backtest(symbol: str, limit: int = 1200, test_ratio: float = 0.2) -> dict:
    return run_multistock_backtest(
        test_symbol=symbol,
        limit=limit,
        training_symbols=None,
        test_ratio=test_ratio,
    )