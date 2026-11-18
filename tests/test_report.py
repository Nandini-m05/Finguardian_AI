from app.agents.report import build_final_report
from app.disclaimer import DISCLAIMER


def test_report_has_outlook_section_and_disclaimer():
    state = {
        "symbol": "AAPL",
        "requested_at": "2026-10-15T00:00:00Z",
        "market_summary": "Market summary.",
        "sentiment_summary": "Sentiment summary.",
        "risk_score": 41.3,
        "risk_factors": ["Elevated price volatility (3.68)"],
        "fraud_flag": False,
        "fraud_confidence": 0.001,
        "shap_explanation": {"volatility": 1.2, "five_day_range_pct": -2.5},
        "human_decision": "approved",
        "outlook": "mixed_signals",
        "outlook_rationale": "AAPL: risk score 41.3/100 -> mixed signals.",
    }
    report = build_final_report(state)
    assert "Outlook (analysis only - not advice)" in report
    assert "MIXED SIGNALS" in report
    assert DISCLAIMER in report


def test_report_handles_missing_data_and_still_carries_disclaimer():
    report = build_final_report({"symbol": "XYZ"})
    assert "N/A" in report
    assert DISCLAIMER in report
