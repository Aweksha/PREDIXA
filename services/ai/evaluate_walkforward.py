"""Walk-forward evaluation of forecasting models against simple baselines.

Run from services/ai:
    python evaluate_walkforward.py selection   # compare candidates on 2020 to mid-2025
    python evaluate_walkforward.py holdout     # score the chosen models once on later data

Training stops PURGE_DAYS before each test window, because a 10-day outcome from a
training row would otherwise overlap the test period. Rows from the same date are shared
across correlated stocks, so confidence intervals resample whole months.
"""

import json
import sys
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import brier_score_loss, f1_score, log_loss, r2_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier, XGBRegressor

from model_core import FEATURE_COLUMNS, build_dataset

warnings.filterwarnings("ignore")

PURGE_DAYS = 20
SELECTION_START = pd.Timestamp("2020-01-01")
SELECTION_END = pd.Timestamp("2025-07-01")
# Forecasts on the site are graded from 30 days back, so nothing after this may inform them
TRAIN_DATA_END_OFFSET_DAYS = 45

BINARY_TARGETS = {"up_5d": "target_up_5d", "beats_spy_5d": "target_beats_spy_5d"}
REGRESSION_TARGETS = {"return_1d": "target_return_1d", "log_volatility_10d": "target_log_volatility_10d"}
SIGNAL_TARGET = "target_signal_10d"


def classifier_candidates() -> dict:
    return {
        "logistic": lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.01, max_iter=500)),
        "xgboost": lambda: XGBClassifier(
            n_estimators=150, learning_rate=0.02, max_depth=3, min_child_weight=100,
            subsample=0.7, colsample_bytree=0.5, reg_lambda=10.0, random_state=42, n_jobs=8, verbosity=0,
        ),
        "forest": lambda: RandomForestClassifier(
            n_estimators=200, max_depth=6, min_samples_leaf=200, max_features=0.3, random_state=42, n_jobs=8,
        ),
    }


def regressor_candidates() -> dict:
    return {
        "ridge": lambda: make_pipeline(StandardScaler(), Ridge(alpha=5000.0)),
        "xgboost": lambda: XGBRegressor(
            n_estimators=150, learning_rate=0.02, max_depth=3, min_child_weight=100,
            subsample=0.7, colsample_bytree=0.5, reg_lambda=10.0, random_state=42, n_jobs=8, verbosity=0,
        ),
        "forest": lambda: RandomForestRegressor(
            n_estimators=200, max_depth=6, min_samples_leaf=200, max_features=0.3, random_state=42, n_jobs=8,
        ),
    }


def windows(start: pd.Timestamp, end: pd.Timestamp, months: int = 6):
    current = start
    while current < end:
        next_start = min(current + pd.DateOffset(months=months), end)
        yield current, next_start
        current = next_start


def walk_forward(data, target, make_model, start, end, predict_proba):
    predictions = []
    for window_start, window_end in windows(start, end):
        train = data[(data["date"] < window_start - pd.Timedelta(days=PURGE_DAYS)) & data[target].notna()]
        test = data[(data["date"] >= window_start) & (data["date"] < window_end) & data[target].notna()]
        if train.empty or test.empty:
            continue
        y_train = train[target]
        if target == SIGNAL_TARGET:
            y_train = y_train + 1  # classes must be 0, 1, 2
        model = make_model()
        model.fit(train[FEATURE_COLUMNS], y_train)

        keep = ["date", "symbol", target, "volatility_10d"]
        if target != "target_return_1d":
            keep.append("target_return_1d")
        rows = test[keep].copy()
        if predict_proba:
            probabilities = model.predict_proba(test[FEATURE_COLUMNS])
            if target == SIGNAL_TARGET:
                for index, name in enumerate(["sell", "hold", "buy"]):
                    rows[f"prob_{name}"] = probabilities[:, index]
                    rows[f"prior_{name}"] = float((y_train == index).mean())
            else:
                rows["pred"] = probabilities[:, 1]
                rows["prior"] = float(y_train.mean())
        else:
            rows["pred"] = model.predict(test[FEATURE_COLUMNS])
        predictions.append(rows)
    return pd.concat(predictions, ignore_index=True)


def monthly_ci(rows, score, draws=500):
    """95% interval for a score by resampling whole months."""
    months = rows["date"].dt.to_period("M")
    groups = [g for _, g in rows.groupby(months)]
    rng = np.random.default_rng(42)
    results = []
    for _ in range(draws):
        sample = pd.concat([groups[i] for i in rng.integers(0, len(groups), len(groups))])
        try:
            results.append(score(sample))
        except ValueError:
            continue
    return [round(float(np.percentile(results, 2.5)), 4), round(float(np.percentile(results, 97.5)), 4)]


def daily_rank_correlation(rows, truth, prediction):
    def one_day(day):
        if day[prediction].nunique() < 2 or day[truth].nunique() < 2:
            return np.nan
        return day[prediction].corr(day[truth], method="spearman")
    return float(rows.groupby("date")[[prediction, truth]].apply(one_day).mean())


def daily_correlation_ci(rows, truth, prediction, draws=2000):
    """95% interval for the mean daily rank correlation by resampling whole months."""
    daily = rows.groupby("date")[[prediction, truth]].apply(
        lambda day: day[prediction].corr(day[truth], method="spearman")
        if day[prediction].nunique() > 1 and day[truth].nunique() > 1 else np.nan
    ).dropna()
    groups = [g.to_numpy() for _, g in daily.groupby(daily.index.to_period("M"))]
    rng = np.random.default_rng(42)
    results = [
        np.concatenate([groups[i] for i in rng.integers(0, len(groups), len(groups))]).mean()
        for _ in range(draws)
    ]
    return [round(float(np.percentile(results, 2.5)), 4), round(float(np.percentile(results, 97.5)), 4)]


def score_binary(rows, target):
    truth = rows[target]
    always_majority = max(truth.mean(), 1 - truth.mean())
    accuracy = ((rows["pred"] >= 0.5) == (truth == 1)).mean()
    edge = lambda r: ((r["pred"] >= 0.5) == (r[target] == 1)).mean() - max(r[target].mean(), 1 - r[target].mean())
    brier = brier_score_loss(truth, rows["pred"])
    prior_brier = brier_score_loss(truth, rows["prior"])
    return {
        "accuracy": round(float(accuracy), 4),
        "baseline_majority_accuracy": round(float(always_majority), 4),
        "accuracy_edge": round(float(accuracy - always_majority), 4),
        "accuracy_edge_ci": monthly_ci(rows, edge),
        "auc": round(float(roc_auc_score(truth, rows["pred"])), 4),
        "auc_ci": monthly_ci(rows, lambda r: roc_auc_score(r[target], r["pred"])),
        "brier_skill": round(float(1 - brier / prior_brier), 4),
        "daily_rank_correlation": round(daily_rank_correlation(rows, target, "pred"), 4),
        "daily_rank_correlation_ci": daily_correlation_ci(rows, target, "pred"),
        "pred_range": [round(float(rows["pred"].quantile(q)), 3) for q in (0.05, 0.5, 0.95)],
        "rows": int(len(rows)),
    }


def score_signal(rows):
    truth = rows[SIGNAL_TARGET].astype(int)
    probabilities = rows[["prob_sell", "prob_hold", "prob_buy"]].to_numpy()
    priors = rows[["prior_sell", "prior_hold", "prior_buy"]].to_numpy()
    labels = probabilities.argmax(axis=1) - 1
    majority = truth.value_counts(normalize=True).max()
    edge = lambda r: (
        (r[["prob_sell", "prob_hold", "prob_buy"]].to_numpy().argmax(axis=1) - 1 == r[SIGNAL_TARGET]).mean()
        - r[SIGNAL_TARGET].value_counts(normalize=True).max()
    )
    return {
        "accuracy": round(float((labels == truth).mean()), 4),
        "baseline_majority_accuracy": round(float(majority), 4),
        "accuracy_edge": round(float((labels == truth).mean() - majority), 4),
        "accuracy_edge_ci": monthly_ci(rows, edge),
        "macro_f1": round(float(f1_score(truth, labels, average="macro")), 4),
        "log_loss": round(float(log_loss(truth, probabilities, labels=[-1, 0, 1])), 4),
        "baseline_prior_log_loss": round(float(log_loss(truth, priors, labels=[-1, 0, 1])), 4),
        "predicted_share": {k: round(float((labels == v).mean()), 3) for k, v in [("sell", -1), ("hold", 0), ("buy", 1)]},
        "rows": int(len(rows)),
    }


def score_return(rows):
    target = "target_return_1d"
    truth = rows[target]
    mae = (rows["pred"] - truth).abs().mean()
    zero_mae = truth.abs().mean()
    up_rate = (truth > 0).mean()
    majority = max(up_rate, 1 - up_rate)
    accuracy = ((rows["pred"] > 0) == (truth > 0)).mean()
    edge = lambda r: (
        ((r["pred"] > 0) == (r[target] > 0)).mean()
        - max((r[target] > 0).mean(), 1 - (r[target] > 0).mean())
    )
    return {
        "direction_accuracy": round(float(accuracy), 4),
        "baseline_majority_accuracy": round(float(majority), 4),
        "accuracy_edge": round(float(accuracy - majority), 4),
        "accuracy_edge_ci": monthly_ci(rows, edge),
        "mae": round(float(mae), 5),
        "baseline_no_change_mae": round(float(zero_mae), 5),
        "daily_rank_correlation": round(daily_rank_correlation(rows, target, "pred"), 4),
        "daily_rank_correlation_ci": daily_correlation_ci(rows, target, "pred"),
        "rows": int(len(rows)),
    }


def score_volatility(rows):
    target = "target_log_volatility_10d"
    trailing = np.log(rows["volatility_10d"].replace(0, np.nan))
    usable = trailing.notna()
    rows = rows[usable].assign(trailing=trailing[usable])
    return {
        "r2": round(float(r2_score(rows[target], rows["pred"])), 4),
        "r2_ci": monthly_ci(rows, lambda r: r2_score(r[target], r["pred"])),
        "baseline_trailing_volatility_r2": round(float(r2_score(rows[target], rows["trailing"])), 4),
        "mae": round(float((rows[target] - rows["pred"]).abs().mean()), 4),
        "baseline_trailing_mae": round(float((rows[target] - rows["trailing"]).abs().mean()), 4),
        "rows": int(len(rows)),
    }


def evaluate(data, start, end, classifiers, regressors):
    report = {}
    for name, target in BINARY_TARGETS.items():
        report[name] = {
            label: score_binary(walk_forward(data, target, make, start, end, True), target)
            for label, make in classifiers.items()
        }
        print(name, "done", flush=True)
    report["signal_10d"] = {
        label: score_signal(walk_forward(data, SIGNAL_TARGET, make, start, end, True))
        for label, make in classifiers.items()
    }
    print("signal_10d done", flush=True)
    report["return_1d"] = {
        label: score_return(walk_forward(data, REGRESSION_TARGETS["return_1d"], make, start, end, False))
        for label, make in regressors.items()
    }
    print("return_1d done", flush=True)
    report["log_volatility_10d"] = {
        label: score_volatility(walk_forward(data, REGRESSION_TARGETS["log_volatility_10d"], make, start, end, False))
        for label, make in regressors.items()
    }
    return report


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "selection"
    cache_dir = sys.argv[2] if len(sys.argv) > 2 else None
    output = sys.argv[3] if len(sys.argv) > 3 else None
    data = build_dataset(cache_dir)
    print("rows", len(data), "dates", data["date"].min().date(), data["date"].max().date(), flush=True)

    if mode != "selection":
        raise SystemExit("Holdout scoring runs through train_models.py so it only sees the chosen models.")

    report = evaluate(data, SELECTION_START, SELECTION_END, classifier_candidates(), regressor_candidates())
    text = json.dumps(report, indent=1)
    if output:
        with open(output, "w") as f:
            f.write(text)
    print(text)


if __name__ == "__main__":
    main()
