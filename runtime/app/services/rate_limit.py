from __future__ import annotations

from app.schemas.api import AppError
from app.services.cache import Cache


class RateLimiter:
    def __init__(self, cache: Cache, limit: int, window_seconds: int = 60):
        self.cache = cache
        self.limit = limit
        self.window = window_seconds

    async def hit(self, identity: str, route: str) -> None:
        key = f"ratelimit:{identity}:{route}"
        count = await self.cache.incr(key, ttl=self.window)
        if count > self.limit:
            raise AppError("Too many requests", status_code=429, error="RATE_LIMITED")
