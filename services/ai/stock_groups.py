STOCK_GROUPS = {
    "momentum_ai": ["NVDA", "TSLA", "AMD", "PLTR", "CRWD", "SNOW"],
    "big_tech_stable": ["MSFT", "AAPL", "AMZN", "GOOG", "ORCL", "META"],
    "finance": ["JPM", "GS", "BAC"],
    "consumer_retail": ["COST", "WMT", "NFLX"],
    "energy": ["XOM", "CVX"],
}


def get_group_for_symbol(symbol: str) -> str | None:
    symbol = symbol.upper().strip()

    for group_name, symbols in STOCK_GROUPS.items():
        if symbol in symbols:
            return group_name

    return None


def get_symbols_for_group(group_name: str) -> list[str]:
    return STOCK_GROUPS.get(group_name, []).copy()


def get_all_group_names() -> list[str]:
    return list(STOCK_GROUPS.keys())