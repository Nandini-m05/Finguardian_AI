import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.disclaimer import DISCLAIMER

# Tickers: AAPL, BRK-B, RELIANCE.NS, ^NSEI, BTC-USD, EURUSD=X
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$")

# bcrypt only looks at the first 72 bytes, and bcrypt>=5 raises on longer
# input - which used to surface as a 500 on /register.
BCRYPT_MAX_BYTES = 72
MIN_PASSWORD_LENGTH = 8


def _normalise_email(value: str) -> str:
    return value.strip().lower()


class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="after")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return _normalise_email(value)

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
        if len(value.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes.")
        if value.strip() == "":
            raise ValueError("Password cannot be blank.")
        return value


class UserLogin(BaseModel):
    """Login deliberately has no password policy: older accounts may predate it."""
    email: EmailStr
    password: str

    @field_validator("email", mode="after")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return _normalise_email(value)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_active: bool
    role: str


class AnalysisRequest(BaseModel):
    symbol: str
    asset_type: Literal["stock", "crypto", "forex"] = "stock"

    @field_validator("symbol")
    @classmethod
    def _valid_symbol(cls, value: str) -> str:
        symbol = value.strip().upper()
        if not SYMBOL_PATTERN.fullmatch(symbol):
            raise ValueError(
                "Symbol must be 1-20 characters: letters, digits, '.', '-', '=' or '^' "
                "(e.g. AAPL, RELIANCE.NS, BTC-USD)."
            )
        return symbol


class NewsArticleOut(BaseModel):
    title: str
    url: str | None = None
    source: str | None = None
    time_published: str | None = None
    sentiment_label: str | None = None
    sentiment_confidence: float | None = None


class AnalysisResponse(BaseModel):
    request_id: str
    thread_id: str
    status: Literal["completed", "pending_review"]
    symbol: str
    asset_type: str = "stock"
    risk_score: float | None = None
    risk_factors: list[str] | None = None
    fraud_flag: bool | None = None
    fraud_confidence: float | None = None
    shap_explanation: dict | None = None
    requires_human_review: bool | None = None
    human_decision: str | None = None
    outlook: str | None = None
    outlook_rationale: str | None = None
    final_report: str | None = None
    alerts_sent: list = []

    # Richer payload for charts / news list / agent trace
    sentiment_score: float | None = None
    market_snapshot: dict | None = None
    news_articles: list[NewsArticleOut] = []
    agent_log: list[str] = []
    reviewed_at: datetime | None = None
    created_at: datetime | None = None

    disclaimer: str = DISCLAIMER


class ResumeDecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]


class AnalysisSummary(BaseModel):
    """One row of the history list - enough for the dashboard and for
    picking two runs to compare, without the heavy chart/news payload."""
    model_config = ConfigDict(from_attributes=True)

    thread_id: str
    symbol: str
    asset_type: str | None = None
    status: str
    risk_score: float | None = None
    outlook: str | None = None
    fraud_flag: bool | None = None
    fraud_confidence: float | None = None
    sentiment_score: float | None = None
    requires_human_review: bool | None = None
    human_decision: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


class AdminPendingReview(BaseModel):
    thread_id: str
    symbol: str
    risk_score: float | None = None
    fraud_flag: bool | None = None
    fraud_confidence: float | None = None
    requested_by_email: str | None = None
    created_at: datetime
