from behavior_groups import get_behavior_group
from predict_behavior_model import predict_symbol as predict_behavior_symbol
from predict_5day_direction import predict_symbol as predict_global_symbol


def predict_symbol(symbol: str, limit: int = 1200) -> dict:
    symbol = symbol.upper().strip()
    group = get_behavior_group(symbol)

    if group == "momentum":
        result = predict_behavior_symbol(symbol, limit=limit)
        result["model_route"] = "behavior_momentum"
        return result

    if group == "weak":
        return {
            "symbol": symbol,
            "group": group,
            "model_route": "no_prediction",
            "prediction_type": "5_day_direction_hybrid_model",
            "signal": "NO_PREDICTION",
            "reason": "This stock is currently classified as weak/noisy, so the hybrid system is skipping prediction.",
        }

    result = predict_global_symbol(symbol, limit=limit)
    result["model_route"] = "global_fallback"
    result["prediction_type"] = "5_day_direction_hybrid_model"
    return result


if __name__ == "__main__":
    for test_symbol in ["NVDA", "MSFT", "AMZN", "AAPL", "TSLA"]:
        print(predict_symbol(test_symbol))