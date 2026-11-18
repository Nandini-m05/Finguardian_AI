"""Celery tasks - only used when ALERT_DELIVERY=celery.

Run a worker with:
    celery -A app.celery_app worker --loglevel=info --pool=solo
"""
from app.celery_app import celery_app
from app.notifications import send_alert_email


@celery_app.task
def ping() -> str:
    return "pong"


@celery_app.task(name="deliver_alert")
def deliver_alert(alert: dict) -> dict:
    """A failed send never crashes the worker - the alert is already
    recorded in the analyses row and the pipeline_events table."""
    return send_alert_email(alert)
