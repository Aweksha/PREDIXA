import numpy as np
import pandas as pd

NEXT_DAY_HORIZON = 1
FIVE_DAY_HORIZON = 5
TEN_DAY_HORIZON = 10

TARGET_NEXT_CLOSE_COLUMN = "target_future_close_1d"
TARGET_5DAY_DIRECTION_COLUMN = "target_up_5d"
TARGET_10DAY_SIGNAL_COLUMN = "target_signal_10d"
TARGET_RETURN_10D_COLUMN = "target_return_10d"


def add_targets(
    df: pd.DataFrame,
    buy_threshold_10d: float = 0.04,
    sell_threshold_10d: float = -0.04,
) -> pd.DataFrame:
    out = df.copy()

    # next-day close target
    out["target_future_close_1d"] = out["close"].shift(-NEXT_DAY_HORIZON)
    out["target_return_1d"] = (out["target_future_close_1d"] / out["close"]) - 1

    # 5-day direction target
    out["target_future_close_5d"] = out["close"].shift(-FIVE_DAY_HORIZON)
    out["target_return_5d"] = (out["target_future_close_5d"] / out["close"]) - 1
    out["target_up_5d"] = (out["target_return_5d"] > 0).astype(int)

    # 10-day buy / hold / sell target
    out["target_future_close_10d"] = out["close"].shift(-TEN_DAY_HORIZON)
    out["target_return_10d"] = (out["target_future_close_10d"] / out["close"]) - 1

    out["target_signal_10d"] = np.select(
        [
            out["target_return_10d"] > buy_threshold_10d,
            out["target_return_10d"] < sell_threshold_10d,
        ],
        [
            1,
            -1,
        ],
        default=0,
    )

    out = out.dropna().reset_index(drop=True)
    return out