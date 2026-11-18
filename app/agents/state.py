from typing import TypedDict, Optional, Literal, Annotated
import operator


class AgentState(TypedDict):
    # ── Request identity ──────────────────────────────
    request_id: str                     # unique per request (thread_id lives in the run config)
    symbol: str                         # e.g. "AAPL", "BTC-USD"
    asset_type: Literal["stock", "crypto", "forex"]
    requested_at: str                   # ISO timestamp

    # ── Data Collector Agent writes ───────────────────
    raw_market_data: Optional[dict]
    raw_news_data: Optional[list]

    # ── Market Analysis Agent writes ──────────────────
    technical_indicators: Optional[dict]
    market_summary: Optional[str]

    # ── News Intelligence Agent writes ────────────────
    sentiment_score: Optional[float]
    sentiment_summary: Optional[str]
    sentiment_reliable: Optional[bool]  # False when fewer than MIN_NEWS_ARTICLES back it
    scored_news: Optional[list]         # articles + FinBERT label/confidence (for the UI)

    # ── Risk Assessment Agent writes ──────────────────
    risk_score: Optional[float]
    risk_factors: Optional[list]

    # ── Fraud Detection Agent writes ──────────────────
    fraud_flag: Optional[bool]
    fraud_confidence: Optional[float]
    shap_explanation: Optional[dict]

    # ── Human-in-the-loop control ─────────────────────
    requires_human_review: Optional[bool]
    human_decision: Optional[Literal["approved", "rejected", "pending"]]

    # ── Outlook Agent writes ────────
    outlook: Optional[str]
    outlook_rationale: Optional[str]

    # ── Explainability / Report Agent writes ──────────
    final_report: Optional[str]

    # ── Alert & Notification Agent writes ─────────────
    alerts_sent: Annotated[list, operator.add]

    # ── Cross-cutting audit trail ─────────────────────
    agent_log: Annotated[list, operator.add]