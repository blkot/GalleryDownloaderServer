from redis import Redis
from rq import Queue

from app.config import settings


def get_queue(name: str = "downloads") -> Queue:
    """Return an RQ queue using the configured Redis connection."""
    connection = Redis.from_url(str(settings.redis_url))
    return Queue(name, connection=connection)
