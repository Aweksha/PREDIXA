"""Scores the chosen models on untouched data, then trains and saves the production models.

Run from services/ai:
    python train_models.py [price_cache_dir]

Models were chosen on the 2020 to mid-2025 walk-forward in evaluate_walkforward.py using
the lowest error for that target. Holdout results are recorded, not used to choose.
"""

import json
import os
import pickle
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import sklearn
import xgboost

from evaluate_walkforward import (
    REGRESSION_TARGETS,
    SELECTION_END,
    SELECTION_START,
    SIGNAL_TARGET,
    TRAIN_DATA_END_OFFSET_DAYS,
    classifier_candidates,
    regressor_candidates,
    score_binary,
    score_return,
    score_signal,
    score_volatility,
    walk_forward,
)
from model_core import FEATURE_COLUMNS, MODEL_PATH, UNIVERSE, build_dataset

NEXT_DAY_MODEL = "xgboost"
FIVE_DAY_MODEL = "forest"
TEN_DAY_MODEL = "forest"
VOLATILITY_MODEL = "forest"

# Share of 10-day moves a one-standard-deviation range should contain
TARGET_RANGE_COVERAGE = 0.68


def range_scale(rows: pd.DataFrame) -> float:
    """Multiplier on predicted volatility so the 10-day range holds TARGET_RANGE_COVERAGE of moves."""
    predicted_move = np.exp(rows["pred"]) * np.sqrt(10)
    return float((rows["target_return_10d"].abs() / predicted_move).quantile(TARGET_RANGE_COVERAGE))


def volatility_rows(data, make_model, start, end):
    rows = walk_forward(data, "target_log_volatility_10d", make_model, start, end, False)
    outcomes = data[["date", "symbol", "target_return_10d"]]
    return rows.merge(outcomes, on=["date", "symbol"]).dropna(subset=["target_return_10d"])


def main():
    cache_dir = sys.argv[1] if len(sys.argv) > 1 else None
    data = build_dataset(cache_dir)
    classifiers = classifier_candidates()
    regressors = regressor_candidates()
    holdout_start = SELECTION_END
    holdout_end = data["date"].max() + pd.Timedelta(days=1)

    # Calibrated before the holdout, then checked on it
    scale = range_scale(volatility_rows(data, regressors[VOLATILITY_MODEL], SELECTION_START, SELECTION_END))
    holdout_volatility = volatility_rows(data, regressors[VOLATILITY_MODEL], holdout_start, holdout_end)
    coverage = float(
        (holdout_volatility["target_return_10d"].abs()
         <= np.exp(holdout_volatility["pred"]) * np.sqrt(10) * scale).mean()
    )

    holdout = {
        "next_day": score_return(
            walk_forward(data, "target_return_1d", regressors[NEXT_DAY_MODEL], holdout_start, holdout_end, False)
        ),
        "five_day": score_binary(
            walk_forward(data, "target_up_5d", classifiers[FIVE_DAY_MODEL], holdout_start, holdout_end, True),
            "target_up_5d",
        ),
        "ten_day": score_signal(
            walk_forward(data, SIGNAL_TARGET, classifiers[TEN_DAY_MODEL], holdout_start, holdout_end, True)
        ),
        "volatility": {
            **score_volatility(holdout_volatility),
            "range_coverage": round(coverage, 4),
            "target_range_coverage": TARGET_RANGE_COVERAGE,
        },
    }
    print(json.dumps(holdout, indent=1), flush=True)

    # Site forecasts are graded from 30 days back, so production training must stop before
    # that date, including the 10-day outcomes of its last rows.
    cutoff = pd.Timestamp((datetime.today() - timedelta(days=TRAIN_DATA_END_OFFSET_DAYS)).date())
    training = data[data["date"] <= cutoff]

    def fit(make_model, target, shift=0):
        rows = training[training[target].notna()]
        model = make_model()
        model.fit(rows[FEATURE_COLUMNS], rows[target] + shift)
        return model

    artifact = {
        "next_day": fit(regressors[NEXT_DAY_MODEL], REGRESSION_TARGETS["return_1d"]),
        "five_day": fit(classifiers[FIVE_DAY_MODEL], "target_up_5d"),
        "ten_day": fit(classifiers[TEN_DAY_MODEL], SIGNAL_TARGET, shift=1),
        "volatility": fit(regressors[VOLATILITY_MODEL], REGRESSION_TARGETS["log_volatility_10d"]),
        "feature_columns": FEATURE_COLUMNS,
        "ten_day_labels": {0: "SELL", 1: "HOLD", 2: "BUY"},
        "range_scale": scale,
        "report": {
            "trained_through": str(cutoff.date()),
            "trained_on": str(datetime.today().date()),
            "holdout_start": str(holdout_start.date()),
            "holdout_end": str(data["date"].max().date()),
            "universe": UNIVERSE,
            "holdout": holdout,
            "versions": {"scikit-learn": sklearn.__version__, "xgboost": xgboost.__version__},
        },
    }

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)
    print(f"Saved {MODEL_PATH}; trained through {cutoff.date()}; range scale {scale:.3f}")


if __name__ == "__main__":
    main()
