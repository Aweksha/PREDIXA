import os
from datetime import datetime, timezone

import pandas as pd
from dotenv import load_dotenv

from data_loader import (
    fetch_training_universe_with_benchmark,
    get_default_training_symbols,
    MARKET_BENCHMARK_SYMBOL,
)
from features import (
    add_features,
    add_market_context_features,
)
from targets import (
    add_targets,
    TARGET_5DAY_DIRECTION_COLUMN,
    TARGET_10DAY_SIGNAL_COLUMN,
)


MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
FIVE_DAY_MODEL_PATH = os.path.join(MODEL_DIR, "five_day_direction_model.pkl")
TEN_DAY_MODEL_PATH = os.path.join(MODEL_DIR, "ten_day_signal_model.pkl")
NEXT_CLOSE_MODEL_PATH = os.path.join(MODEL_DIR, "xgb_next_close_model.pkl")
DEFAULT_RETURN_CLIP_BOUNDS = (-0.15, 0.15)

MARCH_START = "2026-03-01"
MARCH_END = "2026-03-31"


def load_env() -> str:
    load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError(
            "DATABASE_URL is missing. Add it to services/ai/.env or your environment."
        )

    return database_url


def import_pg_connection():
    try:
        import psycopg2
        from psycopg2.extras import execute_values
    except ImportError as exc:
        raise ImportError(
            "psycopg2 is not installed. Run: python -m pip install psycopg2-binary"
        ) from exc

    return psycopg2, execute_values


def load_pickle_artifact(path: str) -> dict:
    import pickle

    if not os.path.exists(path):
        raise FileNotFoundError(f"Model artifact not found: {path}")

    with open(path, "rb") as f:
        return pickle.load(f)


def load_five_day_artifact() -> dict:
    return load_pickle_artifact(FIVE_DAY_MODEL_PATH)


def load_ten_day_artifact() -> dict:
    return load_pickle_artifact(TEN_DAY_MODEL_PATH)


def load_next_close_artifact() -> dict:
    return load_pickle_artifact(NEXT_CLOSE_MODEL_PATH)


def clip_predicted_return(raw_prediction: float, artifact: dict) -> float:
    lower, upper = artifact.get("return_clip_bounds", DEFAULT_RETURN_CLIP_BOUNDS)
    return float(min(max(raw_prediction, float(lower)), float(upper)))


def prepare_full_feature_df(raw_df: pd.DataFrame) -> pd.DataFrame:
    raw_df = raw_df.copy()
    raw_df["date"] = pd.to_datetime(raw_df["date"])

    market_df = raw_df[raw_df["symbol"] == MARKET_BENCHMARK_SYMBOL].copy()
    if market_df.empty:
        raise ValueError("SPY benchmark data is required.")

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
        raise ValueError("No stock frames were prepared.")

    df = pd.concat(frames, ignore_index=True)
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)

    return df


def create_table_if_needed(conn) -> None:
    create_sql = """
    CREATE TABLE IF NOT EXISTS prediction_evaluations (
        id BIGSERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        as_of_date DATE NOT NULL,

        current_close DOUBLE PRECISION,
        predicted_next_close DOUBLE PRECISION,
        expected_move_next_day DOUBLE PRECISION,
        expected_move_next_day_pct DOUBLE PRECISION,

        signal_5d TEXT,
        prob_up_5d DOUBLE PRECISION,
        prob_down_5d DOUBLE PRECISION,
        actual_direction_5d TEXT,
        actual_return_5d DOUBLE PRECISION,
        actual_close_5d DOUBLE PRECISION,
        direction_correct_5d BOOLEAN,

        signal_10d TEXT,
        prob_sell_10d DOUBLE PRECISION,
        prob_hold_10d DOUBLE PRECISION,
        prob_buy_10d DOUBLE PRECISION,
        actual_signal_10d TEXT,
        actual_return_10d DOUBLE PRECISION,
        actual_close_10d DOUBLE PRECISION,
        direction_correct_10d BOOLEAN,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE(symbol, as_of_date)
    );
    """

    with conn.cursor() as cur:
        cur.execute(create_sql)
    conn.commit()


def build_row_records(
    full_df: pd.DataFrame,
    five_day_artifact: dict,
    ten_day_artifact: dict,
    next_close_artifact: dict,
) -> list[tuple]:
    five_day_model = five_day_artifact["model"]
    five_day_feature_columns = five_day_artifact["feature_columns"]
    five_day_threshold = float(five_day_artifact.get("threshold", 0.50))

    ten_day_model = ten_day_artifact["model"]
    ten_day_feature_columns = ten_day_artifact["feature_columns"]
    label_to_signal = ten_day_artifact["label_to_signal"]

    next_close_model = next_close_artifact["model"]
    next_close_feature_columns = next_close_artifact["feature_columns"]
    next_close_target_type = next_close_artifact.get("target_type", "next_day_close")

    records: list[tuple] = []

    march_start = pd.Timestamp(MARCH_START).tz_localize("UTC")
    march_end = pd.Timestamp(MARCH_END).tz_localize("UTC")
    
    march_mask = (
    (full_df["date"] >= march_start)
    & (full_df["date"] <= march_end)
)

    df = full_df[march_mask].copy()

    # Drop only rows that cannot be evaluated because actual future labels/returns are missing
    df = df.dropna(
    subset=[
        TARGET_5DAY_DIRECTION_COLUMN,
        TARGET_10DAY_SIGNAL_COLUMN,
        "target_return_5d",
        "target_return_10d",
        "close",
    ]
    ).reset_index(drop=True)
    
    df["target_close_5d"] = df["close"] * (1 + df["target_return_5d"])
    df["target_close_10d"] = df["close"] * (1 + df["target_return_10d"])

    if df.empty:
        raise ValueError("No usable March evaluation rows found.")

    now = datetime.now(timezone.utc)

    for _, row in df.iterrows():
        symbol = str(row["symbol"]).upper().strip()
        as_of_date = pd.to_datetime(row["date"]).date()

        # 5-day direction
        X_5d = pd.DataFrame([row[five_day_feature_columns].to_dict()])
        five_day_probs = five_day_model.predict_proba(X_5d)[0]
        five_day_classes = list(five_day_model.classes_)

        prob_up_5d = 0.0
        prob_down_5d = 0.0

        for cls, prob in zip(five_day_classes, five_day_probs):
            if int(cls) == 1:
                prob_up_5d = float(prob)
            elif int(cls) == 0:
                prob_down_5d = float(prob)

        signal_5d = "UP" if prob_up_5d >= five_day_threshold else "DOWN"
        actual_direction_5d = "UP" if int(row[TARGET_5DAY_DIRECTION_COLUMN]) == 1 else "DOWN"
        direction_correct_5d = signal_5d == actual_direction_5d

        # 10-day signal
        X_10d = pd.DataFrame([row[ten_day_feature_columns].to_dict()])
        pred_10d_label = int(ten_day_model.predict(X_10d)[0])
        probs_10d = ten_day_model.predict_proba(X_10d)[0]
        classes_10d = list(ten_day_model.classes_)

        prob_sell_10d = 0.0
        prob_hold_10d = 0.0
        prob_buy_10d = 0.0

        for cls, prob in zip(classes_10d, probs_10d):
            signal = label_to_signal[int(cls)]
            if signal == "SELL":
                prob_sell_10d = float(prob)
            elif signal == "HOLD":
                prob_hold_10d = float(prob)
            elif signal == "BUY":
                prob_buy_10d = float(prob)

        signal_10d = label_to_signal[pred_10d_label]
        actual_signal_10d = label_to_signal[int(row[TARGET_10DAY_SIGNAL_COLUMN])]
        direction_correct_10d = signal_10d == actual_signal_10d

        # next-close price model
        X_price = pd.DataFrame([row[next_close_feature_columns].to_dict()])
        current_close = float(row["close"])
        raw_price_prediction = float(next_close_model.predict(X_price)[0])
        clipped_price_prediction = (
            clip_predicted_return(raw_price_prediction, next_close_artifact)
            if next_close_target_type == "next_day_return"
            else raw_price_prediction
        )
        predicted_next_close = (
            current_close * (1 + clipped_price_prediction)
            if next_close_target_type == "next_day_return"
            else raw_price_prediction
        )
        expected_move_next_day = predicted_next_close - current_close
        expected_move_next_day_pct = (
            (expected_move_next_day / current_close) * 100 if current_close else 0.0
        )

        records.append(
            (
                symbol,
                as_of_date,

                round(current_close, 6),
                round(predicted_next_close, 6),
                round(expected_move_next_day, 6),
                round(expected_move_next_day_pct, 6),

                signal_5d,
                round(prob_up_5d, 6),
                round(prob_down_5d, 6),
                actual_direction_5d,
                round(float(row["target_return_5d"]), 6),
                round(float(row["target_close_5d"]), 6),
                bool(direction_correct_5d),

                signal_10d,
                round(prob_sell_10d, 6),
                round(prob_hold_10d, 6),
                round(prob_buy_10d, 6),
                actual_signal_10d,
                round(float(row["target_return_10d"]), 6),
                round(float(row["target_close_10d"]), 6),
                bool(direction_correct_10d),

                now,
                now,
            )
        )

    return records


def upsert_records(conn, execute_values, records: list[tuple]) -> None:
    if not records:
        print("No records to write.")
        return

    sql = """
    INSERT INTO prediction_evaluations (
        symbol,
        as_of_date,

        current_close,
        predicted_next_close,
        expected_move_next_day,
        expected_move_next_day_pct,

        signal_5d,
        prob_up_5d,
        prob_down_5d,
        actual_direction_5d,
        actual_return_5d,
        actual_close_5d,
        direction_correct_5d,

        signal_10d,
        prob_sell_10d,
        prob_hold_10d,
        prob_buy_10d,
        actual_signal_10d,
        actual_return_10d,
        actual_close_10d,
        direction_correct_10d,

        created_at,
        updated_at
    )
    VALUES %s
    ON CONFLICT (symbol, as_of_date)
    DO UPDATE SET
        current_close = EXCLUDED.current_close,
        predicted_next_close = EXCLUDED.predicted_next_close,
        expected_move_next_day = EXCLUDED.expected_move_next_day,
        expected_move_next_day_pct = EXCLUDED.expected_move_next_day_pct,

        signal_5d = EXCLUDED.signal_5d,
        prob_up_5d = EXCLUDED.prob_up_5d,
        prob_down_5d = EXCLUDED.prob_down_5d,
        actual_direction_5d = EXCLUDED.actual_direction_5d,
        actual_return_5d = EXCLUDED.actual_return_5d,
        actual_close_5d = EXCLUDED.actual_close_5d,
        direction_correct_5d = EXCLUDED.direction_correct_5d,

        signal_10d = EXCLUDED.signal_10d,
        prob_sell_10d = EXCLUDED.prob_sell_10d,
        prob_hold_10d = EXCLUDED.prob_hold_10d,
        prob_buy_10d = EXCLUDED.prob_buy_10d,
        actual_signal_10d = EXCLUDED.actual_signal_10d,
        actual_return_10d = EXCLUDED.actual_return_10d,
        actual_close_10d = EXCLUDED.actual_close_10d,
        direction_correct_10d = EXCLUDED.direction_correct_10d,

        updated_at = EXCLUDED.updated_at
    ;
    """

    with conn.cursor() as cur:
        execute_values(cur, sql, records, page_size=500)
    conn.commit()


def print_summary(records: list[tuple]) -> None:
    print("\n=== MARCH EVALUATION SUMMARY ===")
    print(f"Rows prepared: {len(records)}")

    if not records:
        return

    sample_df = pd.DataFrame(
        records,
        columns=[
            "symbol",
            "as_of_date",
            "current_close",
            "predicted_next_close",
            "expected_move_next_day",
            "expected_move_next_day_pct",
            "signal_5d",
            "prob_up_5d",
            "prob_down_5d",
            "actual_direction_5d",
            "actual_return_5d",
            "actual_close_5d",
            "direction_correct_5d",
            "signal_10d",
            "prob_sell_10d",
            "prob_hold_10d",
            "prob_buy_10d",
            "actual_signal_10d",
            "actual_return_10d",
            "actual_close_10d",
            "direction_correct_10d",
            "created_at",
            "updated_at",
        ],
    )

    print("\nSample rows:")
    print(
        sample_df[
            [
                "symbol",
                "as_of_date",
                "current_close",
                "predicted_next_close",
                "signal_5d",
                "actual_direction_5d",
                "signal_10d",
                "actual_signal_10d",
                "actual_return_5d",
                "actual_return_10d",
            ]
        ]
        .head(15)
        .to_string(index=False)
    )

    print("\n5-day accuracy:")
    print(round(float(sample_df["direction_correct_5d"].mean()) * 100, 2), "%")

    print("10-day accuracy:")
    print(round(float(sample_df["direction_correct_10d"].mean()) * 100, 2), "%")


def main() -> None:
    database_url = load_env()
    psycopg2, execute_values = import_pg_connection()

    print("Loading model artifacts...")
    five_day_artifact = load_five_day_artifact()
    ten_day_artifact = load_ten_day_artifact()
    next_close_artifact = load_next_close_artifact()

    print("Loading stock universe...")
    symbols = get_default_training_symbols()
    raw_df = fetch_training_universe_with_benchmark(symbols, limit=1200)

    print("Preparing full feature dataframe...")
    full_df = prepare_full_feature_df(raw_df)

    print(
        f"Prepared rows: {len(full_df)} | "
        f"Min date: {full_df['date'].min()} | "
        f"Max date: {full_df['date'].max()}"
    )

    print("Building March evaluation records...")
    records = build_row_records(
        full_df=full_df,
        five_day_artifact=five_day_artifact,
        ten_day_artifact=ten_day_artifact,
        next_close_artifact=next_close_artifact,
    )

    print_summary(records)

    print("Connecting to PostgreSQL...")
    conn = psycopg2.connect(database_url)

    try:
        print("Creating table if needed...")
        create_table_if_needed(conn)

        print("Upserting March evaluation rows...")
        upsert_records(conn, execute_values, records)

        print("\nDone. March evaluations are now stored in prediction_evaluations.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
