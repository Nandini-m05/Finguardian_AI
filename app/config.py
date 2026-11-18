import json
from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _to_psycopg_url(url: str) -> str:
    """Turn the app's SQLAlchemy/asyncpg URL into a plain libpq URL for
    LangGraph's psycopg-based checkpointer.

    postgresql+asyncpg://u:p@h:5432/db?ssl=require
        -> postgresql://u:p@h:5432/db?sslmode=require
    """
    parts = urlsplit(url)
    scheme = parts.scheme.split("+", 1)[0]
    if scheme == "postgres":
        scheme = "postgresql"
    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "ssl":
            key = "sslmode"
        if key in {"prepared_statement_cache_size", "statement_cache_size"}:
            continue
        query.append((key, value))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"

    # --- Database (Supabase) -------------------------------------------
    # SQLAlchemy async URL, e.g.
    # postgresql+asyncpg://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres?ssl=require
    database_url: str
    # Optional. LangGraph's checkpointer needs a psycopg-style URL; when
    # left empty it is derived from DATABASE_URL automatically.
    langgraph_db_url: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 5
    sql_echo: bool = False

    # --- Auth -------------------------------------------------------------
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # --- CORS (Streamlit runs server-side; a browser frontend needs this) --
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:8501", "http://localhost:5173", "http://localhost:3000"]

    # --- Optional infrastructure -----------------------------------------
    # Leave REDIS_URL empty to run with no Redis at all. Events then go
    # only to the pipeline_events table in Postgres.
    redis_url: str = ""
    # inline  = send alert emails from the API process (no extra services)
    # celery  = hand off to a Celery worker (needs REDIS_URL)
    # disabled = record alerts but never send email
    alert_delivery: Literal["inline", "celery", "disabled"] = "inline"

    # --- Email (Resend) - optional; without a key alerts are only recorded --
    resend_api_key: str = ""
    alert_recipient_email: str = ""
    alert_from_email: str = "FinGuardian AI <onboarding@resend.dev>"

    # --- ML -----------------------------------------------------------------
    # Load FinBERT at startup so the first /analyze is not 10+ s slower.
    preload_models: bool = True

    @field_validator("jwt_secret")
    @classmethod
    def _secret_long_enough(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        return value

    @property
    def effective_langgraph_db_url(self) -> str:
        return self.langgraph_db_url or _to_psycopg_url(self.database_url)

    @property
    def uses_transaction_pooler(self) -> bool:
        """Supabase's shared pooler in transaction mode listens on 6543 and
        does not support prepared statements."""
        return urlsplit(self.database_url).port == 6543

    @property
    def email_enabled(self) -> bool:
        return bool(self.resend_api_key and self.alert_recipient_email)


settings = Settings()
