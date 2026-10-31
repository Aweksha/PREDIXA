import numpy as np
import pandas as pd
from xgboost import XGBClassifier, XGBRegressor
from sklearn.metrics import roc_auc_score, mean_absolute_error

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
    TARGET_PROBABILITY_COLUMN,
    TARGET_RETURN_COLUMN,
    FORWARD_HORIZON_DAYS,
)


def add_symbol_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    symbol_codes = {symbol: idx for idx, symbol in enumerate(sorted(out["symbol"].unique()))}
    out["symbol_code"] = out["symbol"].map(symbol_codes).astype(int)
    return out


def feature_columns_with_symbol() -> list[str]:
    return FEATURE_COLUMNS + ["symbol_code"]


def infer_market_regime(row: pd.Series) -> str:
    market_up = bool(row.get("market_trend_spy", 0) == 1)
    stock_strong = bool(row.get("stock_above_market_10d", 0) == 1)
    vol20 = float(row["volatility_20d"]) if not pd.isna(row["volatility_20d"]) else 0.0

    if market_up and stock_strong and vol20 < 0.03:
        return "TRENDING_BULL"
    if (not market_up) and (not stock_strong) and vol20 >= 0.02:
        return "WEAK_OR_RISKY"
    if vol20 >= 0.035:
        return "HIGH_VOLATILITY"
    return "MIXED"


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
        featured = add_targets(featured, horizon_days=FORWARD_HORIZON_DAYS)
        featured["symbol"] = symbol
        frames.append(featured)

    if not frames:
        raise ValueError("No processed stock data available after feature and target generation.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    combined = add_symbol_features(combined)

    combined = combined.dropna(subset=feature_columns_with_symbol()).reset_index(drop=True)

    return combined


def split_train_and_live_rows(model_df: pd.DataFrame, test_symbol: str):
    test_symbol = test_symbol.upper().strip()

    symbol_df = model_df[model_df["symbol"] == test_symbol].copy()
    if len(symbol_df) < 180:
        raise ValueError(f"Not enough processed rows for prediction symbol {test_symbol}.")

    live_row = symbol_df.iloc[[-1]].copy()
    symbol_train_rows = symbol_df.iloc[:-1].copy()

    other_train_rows = model_df[model_df["symbol"] != test_symbol].copy()

    train_df = pd.concat([other_train_rows, symbol_train_rows], ignore_index=True)
    train_df = train_df.sort_values(["symbol", "date"]).reset_index(drop=True)

    return train_df, live_row


def train_probability_model(X_train: pd.DataFrame, y_train: pd.Series) -> XGBClassifier:
    model = XGBClassifier(
        n_estimators=450,
        learning_rate=0.03,
        max_depth=5,
        min_child_weight=4,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.1,
        reg_lambda=1.2,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)
    return model


def train_return_model(X_train: pd.DataFrame, y_train: pd.Series) -> XGBRegressor:
    model = XGBRegressor(
        n_estimators=450,
        learning_rate=0.03,
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
    return model


def compute_factor_scores(row: pd.Series) -> dict:
    trend_points = 0
    if row["close"] > row["sma_20"]:
        trend_points += 1
    if row["sma_20"] > row["sma_50"]:
        trend_points += 1
    if row["macd"] > row["macd_signal"]:
        trend_points += 1
    if row["ema_12_slope_5d"] > 0:
        trend_points += 1
    trend_score = round((trend_points / 4) * 100, 2)

    momentum_points = 0
    if row["momentum_5d"] > 0:
        momentum_points += 1
    if row["momentum_10d"] > 0:
        momentum_points += 1
    if row["momentum_20d"] > 0:
        momentum_points += 1
    if row["rel_return_10d_vs_spy"] > 0:
        momentum_points += 1
    momentum_score = round((momentum_points / 4) * 100, 2)

    relative_strength_points = 0
    if row["rel_return_5d_vs_spy"] > 0:
        relative_strength_points += 1
    if row["rel_return_10d_vs_spy"] > 0:
        relative_strength_points += 1
    if row["rel_momentum_20d_vs_spy"] > 0:
        relative_strength_points += 1
    if row["stock_above_market_10d"] == 1:
        relative_strength_points += 1
    relative_strength_score = round((relative_strength_points / 4) * 100, 2)

    vol = float(row["volatility_20d"]) if not pd.isna(row["volatility_20d"]) else 0.0
    raw_risk_score = max(0.0, 1.0 - min(vol / 0.05, 1.0))
    risk_score = round(raw_risk_score * 100, 2)

    market_points = 0
    if row["market_trend_spy"] == 1:
        market_points += 1
    if row["spy_return_10d"] > 0:
        market_points += 1
    if row["spy_momentum_20d"] > 0:
        market_points += 1
    if row["spy_volatility_20d"] < 0.025:
        market_points += 1
    market_score = round((market_points / 4) * 100, 2)

    return {
        "trend_score": trend_score,
        "momentum_score": momentum_score,
        "relative_strength_score": relative_strength_score,
        "risk_score": risk_score,
        "market_score": market_score,
    }


def compute_return_interval_from_residuals(
    actual_returns: pd.Series,
    predicted_returns: np.ndarray,
    confidence_level: float = 0.70,
) -> dict:
    residuals = actual_returns - predicted_returns

    lower_q = (1.0 - confidence_level) / 2.0
    upper_q = 1.0 - lower_q

    lower_residual = float(np.quantile(residuals, lower_q))
    upper_residual = float(np.quantile(residuals, upper_q))

    return {
        "confidence_level": confidence_level,
        "lower_residual": lower_residual,
        "upper_residual": upper_residual,
    }


def build_prediction_interval(expected_return: float, interval_info: dict) -> dict:
    lower = expected_return + interval_info["lower_residual"]
    upper = expected_return + interval_info["upper_residual"]

    if lower > upper:
        lower, upper = upper, lower

    return {
        "confidence_level": interval_info["confidence_level"],
        "lower": float(lower),
        "upper": float(upper),
    }


def map_price_interval(current_close: float, return_interval: dict) -> dict:
    lower_price = current_close * (1 + return_interval["lower"])
    upper_price = current_close * (1 + return_interval["upper"])

    if lower_price > upper_price:
        lower_price, upper_price = upper_price, lower_price

    return {
        "confidence_level": return_interval["confidence_level"],
        "lower": float(lower_price),
        "upper": float(upper_price),
    }


def compute_model_confidence(prob_up: float, return_interval: dict) -> float:
    prob_confidence = abs(prob_up - 0.5) * 2.0
    interval_width = return_interval["upper"] - return_interval["lower"]
    interval_confidence = max(0.0, 1.0 - min(interval_width / 0.20, 1.0))
    combined = (0.65 * prob_confidence) + (0.35 * interval_confidence)
    return round(float(combined), 4)


def build_reason_flags(
    live: pd.Series,
    factor_scores: dict,
    prob_up: float,
    expected_return: float,
    regime: str,
) -> dict:
    bullish_reasons = []
    bearish_reasons = []
    caution_reasons = []

    if factor_scores["trend_score"] >= 75:
        bullish_reasons.append("price and trend structure remain strong")
    if factor_scores["momentum_score"] >= 75:
        bullish_reasons.append("recent momentum is still strong")
    if factor_scores["relative_strength_score"] >= 75:
        bullish_reasons.append("the stock is outperforming SPY on a relative basis")
    if live["macd"] > live["macd_signal"]:
        bullish_reasons.append("MACD remains above the signal line")

    if prob_up <= 0.40:
        bearish_reasons.append("probability model leans negative over the next 10 trading days")
    if expected_return < 0:
        bearish_reasons.append("expected 10-day return is negative")
    if live["rel_return_10d_vs_spy"] < 0:
        bearish_reasons.append("the stock is lagging SPY over the recent window")

    if not pd.isna(live["rsi_14"]) and float(live["rsi_14"]) >= 75:
        caution_reasons.append("RSI is elevated and may signal overbought conditions")
    if regime == "HIGH_VOLATILITY":
        caution_reasons.append("the current regime is volatile")
    if regime == "WEAK_OR_RISKY":
        caution_reasons.append("market context and stock behavior point to a weaker regime")

    return {
        "bullish_reasons": bullish_reasons,
        "bearish_reasons": bearish_reasons,
        "caution_reasons": caution_reasons,
    }


def fuse_signal(
    prob_up: float,
    expected_return: float,
    factor_scores: dict,
    return_interval: dict,
    regime: str,
) -> tuple[str, str]:
    trend_score = factor_scores["trend_score"]
    momentum_score = factor_scores["momentum_score"]
    relative_strength_score = factor_scores["relative_strength_score"]
    market_score = factor_scores["market_score"]
    risk_score = factor_scores["risk_score"]

    lower = return_interval["lower"]
    upper = return_interval["upper"]

    model_bearish = (prob_up <= 0.40 and expected_return < 0)
    model_bullish = (prob_up >= 0.60 and expected_return > 0)

    strong_factors = (
        trend_score >= 75 and
        momentum_score >= 75 and
        relative_strength_score >= 50
    )

    weak_factors = (
        trend_score <= 25 and
        momentum_score <= 25
    )

    if model_bullish and strong_factors and market_score >= 50 and lower > -0.03:
        return "BULLISH", "model, trend, and market context align to the upside"

    if model_bearish and weak_factors and upper < 0.03:
        return "BEARISH", "model and factor conditions align to the downside"

    if model_bearish and strong_factors:
        return "CAUTIOUSLY_BEARISH", "trend is still strong, but the model sees short-term pullback risk"

    if model_bullish and risk_score < 50:
        return "CAUTIOUSLY_BULLISH", "upside is favored, but volatility still adds risk"

    if regime == "TRENDING_BULL" and prob_up >= 0.50 and expected_return >= 0:
        return "CAUTIOUSLY_BULLISH", "bullish regime support offsets some model uncertainty"

    if regime == "WEAK_OR_RISKY" and model_bearish:
        return "BEARISH", "weak regime and model outputs both lean negative"

    if lower > 0 and prob_up > 0.55:
        return "BULLISH", "probability and interval are skewed to the upside"

    if upper < 0 and prob_up < 0.45:
        return "BEARISH", "probability and interval are skewed to the downside"

    return "NEUTRAL", "signals are mixed across model outputs, relative strength, and market regime"


def run_prediction(test_symbol: str, limit: int = 1200) -> dict:
    test_symbol = test_symbol.upper().strip()

    training_symbols = get_default_training_symbols(exclude_symbol=test_symbol)
    fetch_symbols = sorted(set(training_symbols + [test_symbol]))

    raw_df = fetch_training_universe_with_benchmark(fetch_symbols, limit=limit)
    model_df = prepare_model_df(raw_df)

    train_df, live_row = split_train_and_live_rows(model_df, test_symbol=test_symbol)

    feature_cols = feature_columns_with_symbol()

    X_train = train_df[feature_cols]
    y_train_prob = train_df[TARGET_PROBABILITY_COLUMN]
    y_train_return = train_df[TARGET_RETURN_COLUMN]

    X_live = live_row[feature_cols]

    probability_model = train_probability_model(X_train, y_train_prob)
    return_model = train_return_model(X_train, y_train_return)

    prob_up_10d = float(probability_model.predict_proba(X_live)[0][1])
    expected_return_10d = float(return_model.predict(X_live)[0])

    train_prob_preds = probability_model.predict_proba(X_train)[:, 1]
    train_return_preds = return_model.predict(X_train)

    try:
        probability_train_auc = float(roc_auc_score(y_train_prob, train_prob_preds))
    except Exception:
        probability_train_auc = None

    return_train_mae = float(mean_absolute_error(y_train_return, train_return_preds))

    interval_info = compute_return_interval_from_residuals(
        actual_returns=y_train_return,
        predicted_returns=train_return_preds,
        confidence_level=0.70,
    )

    return_interval_70 = build_prediction_interval(
        expected_return=expected_return_10d,
        interval_info=interval_info,
    )

    current_close = float(live_row.iloc[0]["close"])
    expected_future_price = current_close * (1 + expected_return_10d)
    future_price_interval_70 = map_price_interval(
        current_close=current_close,
        return_interval=return_interval_70,
    )

    live = live_row.iloc[0]
    factor_scores = compute_factor_scores(live)
    regime = infer_market_regime(live)

    signal, signal_explanation = fuse_signal(
        prob_up=prob_up_10d,
        expected_return=expected_return_10d,
        factor_scores=factor_scores,
        return_interval=return_interval_70,
        regime=regime,
    )

    model_confidence = compute_model_confidence(
        prob_up=prob_up_10d,
        return_interval=return_interval_70,
    )

    reason_flags = build_reason_flags(
        live=live,
        factor_scores=factor_scores,
        prob_up=prob_up_10d,
        expected_return=expected_return_10d,
        regime=regime,
    )

    prob_importances = probability_model.feature_importances_
    prob_top_pairs = sorted(zip(feature_cols, prob_importances), key=lambda x: x[1], reverse=True)
    top_probability_features = [
        {"feature": feature, "importance": round(float(importance), 6)}
        for feature, importance in prob_top_pairs[:10]
    ]

    reg_importances = return_model.feature_importances_
    reg_top_pairs = sorted(zip(feature_cols, reg_importances), key=lambda x: x[1], reverse=True)
    top_return_features = [
        {"feature": feature, "importance": round(float(importance), 6)}
        for feature, importance in reg_top_pairs[:10]
    ]

    return {
        "symbol": test_symbol,
        "horizon_days": FORWARD_HORIZON_DAYS,
        "signal": signal,
        "signal_explanation": signal_explanation,
        "confidence": model_confidence,
        "regime": regime,
        "prediction": {
            "prob_up_10d": round(prob_up_10d, 4),
            "prob_down_10d": round(1 - prob_up_10d, 4),
            "expected_return_10d": round(expected_return_10d, 4),
            "return_interval_70": {
                "lower": round(return_interval_70["lower"], 4),
                "upper": round(return_interval_70["upper"], 4),
                "confidence_level": return_interval_70["confidence_level"],
            },
            "expected_future_price": round(expected_future_price, 2),
            "future_price_interval_70": {
                "lower": round(future_price_interval_70["lower"], 2),
                "upper": round(future_price_interval_70["upper"], 2),
                "confidence_level": future_price_interval_70["confidence_level"],
            },
        },
        "current_snapshot": {
            "date": str(live["date"]),
            "current_close": round(current_close, 2),
            "rsi_14": round(float(live["rsi_14"]), 2) if not pd.isna(live["rsi_14"]) else None,
            "macd": round(float(live["macd"]), 4) if not pd.isna(live["macd"]) else None,
            "macd_signal": round(float(live["macd_signal"]), 4) if not pd.isna(live["macd_signal"]) else None,
            "sma_20": round(float(live["sma_20"]), 2) if not pd.isna(live["sma_20"]) else None,
            "sma_50": round(float(live["sma_50"]), 2) if not pd.isna(live["sma_50"]) else None,
            "volatility_20d": round(float(live["volatility_20d"]), 4) if not pd.isna(live["volatility_20d"]) else None,
            "momentum_10d": round(float(live["momentum_10d"]), 4) if not pd.isna(live["momentum_10d"]) else None,
            "momentum_20d": round(float(live["momentum_20d"]), 4) if not pd.isna(live["momentum_20d"]) else None,
            "spy_return_10d": round(float(live["spy_return_10d"]), 4) if not pd.isna(live["spy_return_10d"]) else None,
            "rel_return_10d_vs_spy": round(float(live["rel_return_10d_vs_spy"]), 4) if not pd.isna(live["rel_return_10d_vs_spy"]) else None,
            "spy_volatility_20d": round(float(live["spy_volatility_20d"]), 4) if not pd.isna(live["spy_volatility_20d"]) else None,
        },
        "factor_scores": factor_scores,
        "reason_flags": reason_flags,
        "model_diagnostics": {
            "training_rows": int(len(train_df)),
            "probability_train_auc": round(probability_train_auc, 4) if probability_train_auc is not None else None,
            "return_train_mae": round(return_train_mae, 4),
            "interval_method": "residual_based_empirical_interval",
            "interval_residual_bounds": {
                "lower_residual": round(interval_info["lower_residual"], 4),
                "upper_residual": round(interval_info["upper_residual"], 4),
                "confidence_level": interval_info["confidence_level"],
            },
            "market_benchmark": MARKET_BENCHMARK_SYMBOL,
            "training_universe": training_symbols,
        },
        "top_probability_features": top_probability_features,
        "top_return_features": top_return_features,
    }