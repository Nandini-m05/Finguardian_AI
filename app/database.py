from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _connect_args() -> dict:
    # Supabase transaction pooler (port 6543) cannot keep prepared
    # statements between transactions; asyncpg caches them by default.
    # The session pooler (port 5432, recommended) needs nothing special.
    if settings.uses_transaction_pooler:
        return {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            # unique names so two pooled clients never collide on "__asyncpg_stmt_1__"
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4().hex}__",
        }
    return {}


engine = create_async_engine(
    settings.database_url,
    echo=settings.sql_echo,          # never log every SQL statement by default
    pool_pre_ping=True,               # pooled connections can be dropped by Supavisor
    pool_size=settings.db_pool_size,  # Supabase free tier allows a small number of
    max_overflow=settings.db_max_overflow,  # pooler clients - keep this modest
    pool_recycle=1800,
    connect_args=_connect_args(),
)

async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
