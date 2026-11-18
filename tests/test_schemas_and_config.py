import pytest
from pydantic import ValidationError

from app.config import _to_psycopg_url
from app.notifications import build_alert_email
from app.schemas import AnalysisRequest, UserCreate


@pytest.mark.parametrize("symbol", ["AAPL", "aapl", " msft ", "RELIANCE.NS", "BRK-B", "BTC-USD", "^NSEI", "EURUSD=X"])
def test_valid_symbols_are_normalised(symbol):
    assert AnalysisRequest(symbol=symbol).symbol == symbol.strip().upper()


@pytest.mark.parametrize("symbol", ["", "   ", "A" * 21, "AAPL MSFT", "<script>", "AAPL;DROP"])
def test_invalid_symbols_are_rejected(symbol):
    with pytest.raises(ValidationError):
        AnalysisRequest(symbol=symbol)


def test_register_email_is_lowercased():
    assert UserCreate(email="Kartik@Example.COM", password="longenough").email == "kartik@example.com"


def test_password_over_72_bytes_is_rejected():
    with pytest.raises(ValidationError):
        UserCreate(email="a@example.com", password="é" * 40)  # 80 bytes, 40 chars


def test_supabase_url_is_converted_for_langgraph():
    url = "postgresql+asyncpg://postgres.abc:p%40ss@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?ssl=require"
    assert _to_psycopg_url(url) == (
        "postgresql://postgres.abc:p%40ss@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    )


def test_alert_email_escapes_user_controlled_values():
    subject, body = build_alert_email({
        "symbol": "<img src=x onerror=alert(1)>",
        "severity": "warning",
        "reason": "test",
        "risk_score": 70,
        "outlook": "negative_signals",
        "triggered_at": "now",
    })
    assert "<img" not in body
    assert "&lt;img" in body
