from pathlib import Path
from urllib.parse import quote

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_RUNTIME_ROOT = Path(__file__).resolve().parents[1]
_SUPABASE_CA = _RUNTIME_ROOT / "certs" / "supabase-root-2021.crt"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_RUNTIME_ROOT / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://hitl:hitl@localhost:5432/hitl"
    REDIS_URL: str = "redis://localhost:6379/0"
    NATS_URL: str = "nats://localhost:4222"
    JWT_SECRET: str = "dev-jwt-secret-change-me"
    API_KEYS: str = "demo-runtime-key"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    LOG_LEVEL: str = "INFO"
    RATE_LIMIT_PER_MINUTE: int = 30
    TESTING: bool = False
    DEMO_MODE: bool = False
    SIGNET_BOOTSTRAP: bool = False
    OTEL_SERVICE_NAME: str = "signet-runtime"
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    @field_validator("*", mode="before")
    @classmethod
    def _strip_env(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [part.strip() for part in self.CORS_ORIGINS.split(",") if part.strip()]

    @property
    def api_key_set(self) -> set[str]:
        keys: set[str] = set()
        for raw in self.API_KEYS.split(","):
            part = raw.strip()
            if not part:
                continue
            keys.add(part)
            role, sep, rest = part.partition(":")
            if sep and rest.strip() and role in {"admin", "operator", "runtime"}:
                keys.add(rest.strip())
        return keys

    @property
    def is_supabase(self) -> bool:
        url = self.DATABASE_URL.lower()
        return "supabase.co" in url or "supabase.com" in url

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + url[len("postgresql://") :]
        if url.startswith("postgres://"):
            return "postgresql+asyncpg://" + url[len("postgres://") :]
        return url

    @property
    def supabase_ca_path(self) -> Path | None:
        return _SUPABASE_CA if _SUPABASE_CA.is_file() else None

    @property
    def sync_database_url(self) -> str:
        url = self.async_database_url
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
        url = url.replace("sqlite+aiosqlite://", "sqlite://")
        if self.is_supabase and "sslmode=" not in url:
            ca = self.supabase_ca_path
            sep = "&" if "?" in url else "?"
            if ca is not None:
                url += f"{sep}sslmode=verify-full&sslrootcert={quote(str(ca), safe='/')}"
            else:
                url += f"{sep}sslmode=require"
        return url

    def async_connect_args(self) -> dict:
        if self.DATABASE_URL.startswith("sqlite"):
            return {"check_same_thread": False}
        args: dict = {}
        if self.is_supabase:
            import ssl

            ca = self.supabase_ca_path
            args["ssl"] = ssl.create_default_context(cafile=str(ca)) if ca is not None else True
            # Supavisor transaction mode (port 6543) does not support prepared statements.
            if ":6543/" in self.DATABASE_URL or self.DATABASE_URL.rstrip("/").endswith(":6543"):
                args["statement_cache_size"] = 0
                args["prepared_statement_cache_size"] = 0
        return args


def get_settings() -> Settings:
    return Settings()
