from app.agents.alert_notification import determine_alert


def test_fraud_flag_triggers_critical():
    state = {"symbol": "XYZ", "fraud_flag": True, "human_decision": "approved",
             "outlook": "negative_signals", "risk_score": 82.0}
    assert determine_alert(state)["severity"] == "critical"


def test_human_rejection_triggers_critical():
    state = {"symbol": "XYZ", "fraud_flag": False, "human_decision": "rejected",
             "outlook": "negative_signals", "risk_score": 40.0}
    assert determine_alert(state)["severity"] == "critical"


def test_negative_signals_with_high_risk_trigger_warning():
    state = {"symbol": "AAPL", "fraud_flag": False, "human_decision": "approved",
             "outlook": "negative_signals", "risk_score": 65.0}
    assert determine_alert(state)["severity"] == "warning"


def test_negative_outlook_alone_triggers_warning():
    state = {"symbol": "AAPL", "fraud_flag": False, "human_decision": "approved",
             "outlook": "negative_signals", "risk_score": 20.0}
    assert determine_alert(state)["severity"] == "warning"


def test_clean_case_triggers_no_alert():
    state = {"symbol": "AAPL", "fraud_flag": False, "human_decision": "approved",
             "outlook": "mixed_signals", "risk_score": 41.3}
    assert determine_alert(state) is None
