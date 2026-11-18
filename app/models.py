"""ORM models.

Must stay in step with supabase/01_schema.sql and the Alembic head
(c4e8f1a2b9d0). CHECK constraints, the updated_at trigger and RLS live in
the SQL/migration - the ORM only needs the columns.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    role: Mapped[str] = mapped_column(String(50), default="user", server_default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Analysis(Base):
    """One row per pipeline run - the queryable counterpart to the
    LangGraph checkpoint, which is built for resuming a specific run,
    not for searching or reporting across many.
    """
    __tablename__ = "analyses"

    thread_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(64))
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    asset_type: Mapped[str] = mapped_column(String(20), server_default="stock")
    status: Mapped[str] = mapped_column(String(20), index=True)

    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_factors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    fraud_flag: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    fraud_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    shap_explanation: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    requires_human_review: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    human_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    outlook: Mapped[str | None] = mapped_column(String(20), nullable=True)
    outlook_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    alerts_sent: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Dashboard payload (charts, news list, agent trace)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    news_articles: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    agent_log: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Kept current by the trg_analyses_updated_at trigger as well.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PipelineEvent(Base):
    """Durable audit trail of pipeline milestones (replaces Redis Streams)."""
    __tablename__ = "pipeline_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    stream: Mapped[str] = mapped_column(String(64))
    thread_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
