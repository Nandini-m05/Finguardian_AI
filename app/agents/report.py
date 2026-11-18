from app.agents.state import AgentState
from app.agents.outlook import OUTLOOK_LABELS
from app.disclaimer import DISCLAIMER

FEATURE_LABELS = {
    "price_change_pct": "today's price movement",
    "volatility": "5-day price volatility",
    "five_day_range_pct": "5-day trading range",
    "sentiment_score": "news sentiment",
    "momentum_numeric": "price momentum direction",
}


def describe_shap_drivers(shap_explanation: dict, top_n: int = 2) -> str:
    """Translate raw SHAP feature/value pairs into a plain-English phrase,
    ranked by which features mattered most for this specific case.
    """
    if not shap_explanation:
        return "no fraud-model signal breakdown available"

    ranked = sorted(shap_explanation.items(), key=lambda kv: abs(kv[1]), reverse=True)
    top = [FEATURE_LABELS.get(name, name) for name, value in ranked[:top_n] if abs(value) > 0.01]

    if not top:
        return "no single factor stood out"
    return " and ".join(top)


def build_final_report(state: dict) -> str:
    symbol = state.get("symbol")
    requested_at = state.get("requested_at")
    risk_score = state.get("risk_score")
    risk_factors = state.get("risk_factors") or []
    fraud_flag = state.get("fraud_flag")
    fraud_confidence = state.get("fraud_confidence")
    drivers = describe_shap_drivers(state.get("shap_explanation") or {})
    outlook_label = OUTLOOK_LABELS.get(state.get("outlook"), "N/A")

    lines = [
        f"FinGuardian AI Analysis Report - {symbol}",
        f"Generated: {requested_at}",
        "",
        "Market Snapshot",
        state.get("market_summary") or "No market summary available.",
        "",
        "News Sentiment",
        state.get("sentiment_summary") or "No sentiment summary available.",
        "",
        "Risk Assessment",
        f"Risk score: {risk_score}/100" if risk_score is not None else "Risk score: unavailable",
        f"Key factors: {', '.join(risk_factors)}" if risk_factors else "No notable risk factors.",
        "",
        "Fraud Detection",
        f"Flagged: {fraud_flag} (confidence {fraud_confidence})" if fraud_confidence is not None else "Not evaluated.",
        f"Primarily driven by: {drivers}",
        "",
        "Human Review",
        f"Status: {state.get('human_decision') or 'not required'}",
        "",
        "Outlook (analysis only - not advice)",
        f"{outlook_label.upper()} - {state.get('outlook_rationale') or ''}",
        "",
        "Disclaimer",
        DISCLAIMER,
    ]
    return "\n".join(lines)


def report_node(state: AgentState) -> dict:
    """LangGraph node: Explainability / Report Agent."""
    symbol = state["symbol"]
    report = build_final_report(state)

    return {
        "final_report": report,
        "agent_log": [f"[Report] Generated final report for {symbol}"],
    }
