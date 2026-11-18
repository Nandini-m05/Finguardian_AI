"""Optional Redis client - only used when REDIS_URL is set."""
from app.config import settings

_redis_client = None


def get_redis_client():
    """Return a shared Redis client, creating it on first use.

    redis-py manages its own connection pool internally, so one client is
    reused rather than opening a fresh connection per publish.
    """
    global _redis_client
    if not settings.redis_url:
        raise RuntimeError("REDIS_URL is not configured")
    if _redis_client is None:
        import redis.asyncio as redis  # optional dependency (requirements-optional.txt)

        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client
