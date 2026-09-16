from __future__ import annotations

from typing import Protocol


class Cache(Protocol):
    async def get(self, key: str) -> str | None: ...
    async def set(self, key: str, value: str, ttl: int = 60) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def incr(self, key: str, ttl: int | None = None) -> int: ...
    async def ping(self) -> bool: ...


class MemoryCache:
    def __init__(self):
        self._store: dict[str, str] = {}
        self._counters: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str, ttl: int = 60) -> None:
        self._store[key] = value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)
        self._counters.pop(key, None)

    async def incr(self, key: str, ttl: int | None = None) -> int:
        self._counters[key] = self._counters.get(key, 0) + 1
        return self._counters[key]

    async def ping(self) -> bool:
        return True


class RedisCache:
    def __init__(self, client):
        self.client = client

    async def get(self, key: str) -> str | None:
        return await self.client.get(key)

    async def set(self, key: str, value: str, ttl: int = 60) -> None:
        await self.client.set(key, value, ex=ttl)

    async def delete(self, key: str) -> None:
        await self.client.delete(key)

    async def incr(self, key: str, ttl: int | None = None) -> int:
        value = await self.client.incr(key)
        if value == 1 and ttl:
            await self.client.expire(key, ttl)
        return int(value)

    async def ping(self) -> bool:
        return bool(await self.client.ping())
