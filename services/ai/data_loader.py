import os
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

API_BASE_URL = os.getenv("PREDIXA_API_BASE_URL", "http://localhost:5050")

DEFAULT_SYMBOLS = [
    "NVDA", "TSLA", "AMD", "PLTR", "META",
    "MSFT", "AAPL", "AMZN", "GOOG", "ORCL",
    "JPM", "GS", "BAC",
    "COST", "WMT", "NFLX",
    "XOM", "CVX",
    "CRWD", "SNOW",
]

MARKET_BENCHMARK_SYMBOL = "SPY"


def normalize_symbol_for_api(symbol: str) -> str:
    return symbol.upper().strip()


def fetch_eod_history(symbol: str, limit: int = 1200) -> pd.DataFrame:
    symbol = normalize_symbol_for_api(symbol)

    url = f"{API_BASE_URL}/api/real-data/eod"
    params = {
        "symbol": symbol,
        "limit": limit,
    }

    response = requests.get(url, params=params, timeout=90)
    response.raise_for_status()

    payload = response.json()
    points = payload.get("points", [])

    if not points:
        raise ValueError(f"No historical points returned for symbol '{symbol}'")

    df = pd.DataFrame(points)

    expected_columns = ["date", "open", "high", "low", "close", "volume"]
    missing = [col for col in expected_columns if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns from API for {symbol}: {missing}")

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    numeric_columns = ["open", "high", "low", "close", "volume", "vwap", "changePercent"]
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["date", "open", "high", "low", "close", "volume"])
    df["symbol"] = symbol

    return df


def fetch_training_universe_with_benchmark(
    symbols: list[str],
    limit: int = 1200,
) -> pd.DataFrame:
    frames = []
    failures = []

    benchmark_df = fetch_eod_history(MARKET_BENCHMARK_SYMBOL, limit=limit)
    frames.append(benchmark_df)

    for symbol in symbols:
        normalized = normalize_symbol_for_api(symbol)

        if normalized == MARKET_BENCHMARK_SYMBOL:
            continue

        try:
            df = fetch_eod_history(normalized, limit=limit)
            frames.append(df)
        except Exception as exc:
            failures.append({"symbol": normalized, "error": str(exc)})

    if len(frames) <= 1:
        raise ValueError(
            f"Only benchmark data was loaded. Stock universe failed. Failures: {failures}"
        )

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)

    return combined


def get_default_training_symbols(exclude_symbol: str | None = None) -> list[str]:
    exclude_symbol = normalize_symbol_for_api(exclude_symbol) if exclude_symbol else None

    symbols = []
    seen = set()

    for symbol in DEFAULT_SYMBOLS:
        normalized = normalize_symbol_for_api(symbol)
        if exclude_symbol and normalized == exclude_symbol:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        symbols.append(normalized)

    return symbols