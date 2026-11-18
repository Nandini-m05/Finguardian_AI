"""Pipeline audit trail.

Every event is written to the `pipeline_events` table (Supabase/Postgres),
which is durable, queryable from the SQL editor and needs no extra
service. If REDIS_URL is configured, the same event is also mirrored to a
Redis Stream for anyone who wants a live consumer.

Publishing NEVER raises: an audit-trail hiccup must not throw away an
analysis that has already been computed (the old code failed the whole
/analyze request when Redis was down).
"""
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def publish_event(
    stream: str,
    event: dict,
    *,
    thread_id: str | None = None,
    request_id: str | None = None,
    symbol: str | None = None,
) -> None:
    await _write_to_postgres(stream, event, thread_id=thread_id, request_id=request_id, symbol=symbol)
    if settings.redis_url:
        await _mirror_to_redis(stream, event)


async def _write_to_postgres(stream: str, event: dict, **ids) -> None:
    try:
        # Imported lazily so pure-logic unit tests can import agents without a DB driver.
        from app.database import async_session
        from app.models import PipelineEvent

        async with async_session() as session:
            session.add(PipelineEvent(stream=stream, payload=_jsonable(event), **ids))
            await session.commit()
    except Exception:  # noqa: BLE001 - audit trail is best-effort by design
        logger.warning("Could not write event to pipeline_events (stream=%s)", stream, exc_info=True)


async def _mirror_to_redis(stream: str, event: dict) -> None:
    try:
        from app.events.redis_client import get_redis_client

        flat = {key: "" if value is None else str(value) for key, value in event.items()}
        await get_redis_client().xadd(stream, flat)
    except Exception:  # noqa: BLE001
        logger.warning("Could not mirror event to Redis stream %s", stream, exc_info=True)


def _jsonable(value):
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)
