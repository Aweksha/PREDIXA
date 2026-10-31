import pandas as pd


def clean_5day_direction_data(df: pd.DataFrame, is_train: bool = True) -> pd.DataFrame:
    out = df.copy()

    # always remove extreme outliers
    out = out[(out["target_return_5d"] < 0.30) & (out["target_return_5d"] > -0.30)]

    if is_train:
        # stricter filtering for training
        out = out[out["target_return_5d"].abs() > 0.01]

        out["volume_avg_20"] = (
            out.groupby("symbol")["volume"]
            .transform(lambda s: s.rolling(20).mean())
        )

        out = out[out["volume"] > (out["volume_avg_20"] * 0.5)]
        out = out.drop(columns=["volume_avg_20"], errors="ignore")

    else:
        # lighter filtering for test/live-style evaluation
        out = out[out["target_return_5d"].abs() > 0.005]

    out = out.dropna().reset_index(drop=True)
    return out


def clean_10day_signal_data(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    out = out[(out["target_return_10d"] < 0.40) & (out["target_return_10d"] > -0.40)]

    out["volume_avg_20"] = (
        out.groupby("symbol")["volume"]
        .transform(lambda s: s.rolling(20).mean())
    )

    out = out[out["volume"] > (out["volume_avg_20"] * 0.5)]

    out = out.drop(columns=["volume_avg_20"], errors="ignore")
    out = out.dropna().reset_index(drop=True)

    return out