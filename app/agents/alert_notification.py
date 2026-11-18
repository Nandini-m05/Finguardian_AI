from datetime import datetime, timezone

from langchain_core.runnables import RunnableConfig

from app.agents.state import AgentState
from app.events.event_bus import publish_event
from app.notifications import dispatch_alert

ALERTS_STREAM = "alert_events"


def determine_alert(state: dict) -> dict | None:
    """Decide whether this case warrants an alert, and at what severity.

    This agent decides AND records an alert; delivery is handed to a
    Celery task that consumes the same information.
    """
    symbol = state.get("symbol")
    fraud_flag = state.get("fraud_flag")
    human_decision = state.get("human_decision")
    outlook = state.get("outlook")
    risk_score = state.get("risk_score") or 0

    if fraud_flag or human_decision == "rejected":
        severity = "critical"
        reason = "Fraud signal confirmed or case rejected in human review"
    elif outlook == "negative_signals" or risk_score >= 60:
        severity = "warning"
        reason = f"Outlook shows negative signals or risk score is elevated ({risk_score})"
    else:
        return None

    return {
        "symbol": symbol,
        "severity": severity,
        "reason": reason,
        "risk_score": risk_score,
        "outlook": outlook,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
    }


async def alert_notification_node(state: AgentState, config: RunnableConfig) -> dict:
    """LangGraph node: Alert & Notification Agent."""
    symbol = state["symbol"]
    alert = determine_alert(state)

    if alert is None:
        return {
            "agent_log": [f"[AlertNotification] No alert warranted for {symbol}"],
        }

    # Durable record first (pipeline_events table), then fire-and-forget delivery.
    await publish_event(
        ALERTS_STREAM,
        alert,
        thread_id=(config or {}).get("configurable", {}).get("thread_id"),
        request_id=state.get("request_id"),
        symbol=symbol,
    )
    delivery = dispatch_alert(alert)

    return {
        "alerts_sent": [{**alert, "delivery": delivery}],
        "agent_log": [
            f"[AlertNotification] {alert['severity'].upper()} alert for {symbol}: {alert['reason']} (delivery: {delivery})"
        ],
    }
