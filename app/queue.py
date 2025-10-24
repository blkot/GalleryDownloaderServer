from redis import Redis
from rq import Queue

from app.config import settings


def get_queue() -> Queue:
    """Return the primary RQ queue using configured Redis connection."""
    connection = Redis.from_url(str(settings.redis_url))
    return Queue("downloads", connection=connection)

