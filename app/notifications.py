"""Alert email delivery.

Three modes (ALERT_DELIVERY):
* inline   - send from the API process in a background thread (default,
             no Redis, no Celery, nothing extra to run)
* celery   - hand off to a Celery worker (needs REDIS_URL)
* disabled - alerts are recorded in the DB/report but never emailed

Without RESEND_API_KEY + ALERT_RECIPIENT_EMAIL, email is skipped in every
mode - the backend still starts and the alert is still recorded.
"""
import asyncio
import html
import logging

from app.config import settings
from app.disclaimer import DISCLAIMER_SHORT

logger = logging.getLogger(__name__)

# Strong references so fire-and-forget tasks are not garbage-collected mid-send.
_background_tasks: set[asyncio.Task] = set()


def build_alert_email(alert: dict) -> tuple[str, str]:
    """Subject + HTML body. Every value is escaped: the symbol is user input."""
    esc = lambda value: html.escape(str(value if value is not None else "n/a"))  # noqa: E731
    severity = str(alert.get("severity", "")).upper()
    outlook_label = str(alert.get("outlook") or "n/a").replace("_", " ").title()

    subject = f"[FinGuardian AI] {severity} Alert - {alert.get('symbol')}"
    body = (
        f"<h2>{esc(severity)} Alert: {esc(alert.get('symbol'))}</h2>"
        f"<p><strong>Reason:</strong> {esc(alert.get('reason'))}</p>"
        f"<p><strong>Risk score:</strong> {esc(alert.get('risk_score'))}/100</p>"
        f"<p><strong>Analysis outlook:</strong> {esc(outlook_label)}</p>"
        f"<p><strong>Triggered at:</strong> {esc(alert.get('triggered_at'))}</p>"
        f"<hr><p style='font-size:12px;color:#666'>{esc(DISCLAIMER_SHORT)}</p>"
    )
    return subject, body


def send_alert_email(alert: dict) -> dict:
    """Blocking send via Resend. Never raises."""
    base = {"symbol": alert.get("symbol"), "severity": alert.get("severity")}
    if not settings.email_enabled:
        return {**base, "delivered": False, "error": "email not configured"}

    try:
        import resend

        resend.api_key = settings.resend_api_key
        subject, body = build_alert_email(alert)
        response = resend.Emails.send({
            "from": settings.alert_from_email,
            "to": settings.alert_recipient_email,
            "subject": subject,
            "html": body,
        })
        email_id = response.get("id") if isinstance(response, dict) else getattr(response, "id", None)
        logger.info("Alert email sent for %s (id=%s)", alert.get("symbol"), email_id)
        return {**base, "delivered": True, "email_id": email_id}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alert email failed for %s: %s", alert.get("symbol"), exc)
        return {**base, "delivered": False, "error": str(exc)}


def dispatch_alert(alert: dict) -> str:
    """Start delivery without blocking the pipeline. Returns the mode used."""
    mode = settings.alert_delivery
    if mode == "disabled" or not settings.email_enabled:
        return "skipped"

    if mode == "celery":
        try:
            from app.tasks import deliver_alert

            deliver_alert.delay(alert)
            return "celery"
        except Exception:  # noqa: BLE001 - broker down: fall back to inline
            logger.warning("Celery hand-off failed; sending inline instead", exc_info=True)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        send_alert_email(alert)
        return "inline-sync"

    task = loop.create_task(asyncio.to_thread(send_alert_email, alert))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return "inline"
