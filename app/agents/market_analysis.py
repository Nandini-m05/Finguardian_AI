import numpy as np

from app.agents.state import AgentState

# Volatility window: up to the last 20 trading sessions (~1 month).
VOLATILITY_WINDOW = 20
MOMENTUM_WINDOW = 5


def _finite(values) -> list[float]:
    return [float(v) for v in (values or []) if v is not None and v == v and np.isfinite(v)]


def compute_technical_indicators(market_data: dict) -> dict:
    """Technical indicators from the Data Collector's price/volume history.

    Volatility is the standard deviation of DAILY % RETURNS (ddof=1), not
    of raw prices. The old version took the std of closing prices in
    currency units, which made a Rs 1,400 / $500 stock look "volatile" and
    a penny stock look calm no matter how they actually moved - and that
    number fed straight into the risk score and the fraud model.
    """
    closes = _finite(market_data.get("recent_closes"))
    volumes = _finite(market_data.get("recent_volumes"))

    current_price = market_data.get("current_price")
    previous_close = market_data.get("previous_close")

    price_change_pct = None
    if current_price is not None and previous_close:
        price_change_pct = round((current_price - previous_close) / previous_close * 100, 2)

    last_five = closes[-MOMENTUM_WINDOW:]
    five_day_high = round(max(last_five), 2) if last_five else None
    five_day_low = round(min(last_five), 2) if last_five else None
    five_day_range_pct = None
    if five_day_high is not None and five_day_low:
        five_day_range_pct = round((five_day_high - five_day_low) / five_day_low * 100, 2)

    window = closes[-(VOLATILITY_WINDOW + 1):]
    returns_pct = [
        (window[i] - window[i - 1]) / window[i - 1] * 100
        for i in range(1, len(window))
        if window[i - 1]
    ]
    volatility = round(float(np.std(returns_pct, ddof=1)), 2) if len(returns_pct) >= 2 else None

    momentum = "flat"
    if len(last_five) >= 2:
        if last_five[-1] > last_five[0]:
            momentum = "up"
        elif last_five[-1] < last_five[0]:
            momentum = "down"

    # Volume spike: latest session vs the average of the previous 20.
    # A core manipulation signal (pump-and-dump moves come with volume).
    volume_ratio = None
    if len(volumes) >= 6:
        baseline = volumes[-(VOLATILITY_WINDOW + 1):-1]
        avg = float(np.mean(baseline)) if baseline else 0.0
        if avg > 0:
            volume_ratio = round(volumes[-1] / avg, 2)

    return {
        "price_change_pct": price_change_pct,
        "five_day_high": five_day_high,
        "five_day_low": five_day_low,
        "five_day_range_pct": five_day_range_pct,
        "volatility": volatility,                 # % daily-return std
        "volatility_window": len(returns_pct),
        "momentum": momentum,
        "volume_ratio": volume_ratio,
    }


def build_market_summary(symbol: str, indicators: dict) -> str:
    change = indicators["price_change_pct"] or 0
    direction = "up" if change >= 0 else "down"
    summary = (
        f"{symbol} is {direction} {abs(change)}% from the previous close, "
        f"with {indicators['momentum']} momentum over the last 5 trading days "
        f"(range: {indicators['five_day_low']}-{indicators['five_day_high']})"
    )
    if indicators.get("volatility") is not None:
        summary += f"; daily volatility {indicators['volatility']}% over {indicators.get('volatility_window')} sessions"
    if indicators.get("volume_ratio") is not None:
        summary += f"; latest volume {indicators['volume_ratio']}x its 20-day average"
    return summary + "."


def market_analysis_node(state: AgentState) -> dict:
    """LangGraph node: Market Analysis Agent."""
    symbol = state["symbol"]
    market_data = state.get("raw_market_data")

    if not market_data:
        return {
            "agent_log": [f"[MarketAnalysis] Skipped - no raw_market_data found for {symbol}"],
        }

    indicators = compute_technical_indicators(market_data)
    summary = build_market_summary(symbol, indicators)

    return {
        "technical_indicators": indicators,
        "market_summary": summary,
        "agent_log": [f"[MarketAnalysis] Computed indicators for {symbol}: {summary}"],
    }
