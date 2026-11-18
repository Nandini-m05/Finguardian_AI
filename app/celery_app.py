"""Optional Celery app - only imported when ALERT_DELIVERY=celery."""
from celery import Celery

from app.config import settings

if not settings.redis_url:
    raise RuntimeError("ALERT_DELIVERY=celery needs REDIS_URL (e.g. a free Upstash Redis URL).")

celery_app = Celery(
    "finguardian",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)
