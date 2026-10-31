import pandas as pd


def chronological_split_by_symbol(
    df: pd.DataFrame,
    train_ratio: float = 0.8,
) -> tuple[pd.DataFrame, pd.DataFrame]:
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
        raise ValueError("Could not build chronological train/test split.")

    train_df = pd.concat(train_frames, ignore_index=True)
    test_df = pd.concat(test_frames, ignore_index=True)

    return train_df, test_df