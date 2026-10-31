BEHAVIOR_GROUPS = {
    "momentum": ["NVDA", "TSLA", "AMD", "PLTR", "CRWD", "SNOW"],
    "weak": ["AMZN"],
}


def get_behavior_group(symbol: str) -> str:
    symbol = symbol.upper().strip()

    for group_name, symbols in BEHAVIOR_GROUPS.items():
        if symbol in symbols:
            return group_name

    return "global"


def get_symbols_for_behavior_group(group_name: str) -> list[str]:
    return BEHAVIOR_GROUPS.get(group_name, []).copy()