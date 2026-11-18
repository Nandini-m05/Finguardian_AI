import sys
import asyncio

if sys.platform == "win32":
    # psycopg's async driver (LangGraph checkpointer) cannot use the Proactor loop.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging
import uuid
from contextlib import AsyncExitStack, asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.data_collector import SymbolNotFoundError
from app.config import settings
from app.database import async_session, engine, get_db
from app.dependencies import get_current_user, require_role
from app.graph import build_graph
from app.models import Analysis, User
from app.schemas import (
    AdminPendingReview,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisSummary,
    ResumeDecisionRequest,
    TokenOut,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("finguardian")

ANALYSIS_TIMEOUT_SECONDS = 120


def _warm_up_models() -> None:
    from app.agents.fraud_features import get_models
    from app.agents.news_intelligence import get_finbert

    get_models()
    get_finbert()
    logger.info("ML models loaded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    checkpoint_url = settings.effective_langgraph_db_url
    if urlsplit(checkpoint_url).port == 6543:
        raise RuntimeError(
            "LangGraph's checkpointer needs prepared statements, which Supabase's transaction "
            "pooler (port 6543) does not support. Use the Session pooler connection string "
            "(port 5432) for DATABASE_URL / LANGGRAPH_DB_URL."
        )

    async with AsyncExitStack() as stack:
        checkpointer = await stack.enter_async_context(AsyncPostgresSaver.from_conn_string(checkpoint_url))
        await checkpointer.setup()  # creates LangGraph's checkpoint tables on first run
        app.state.graph = build_graph(checkpointer)

        if settings.preload_models:
            await asyncio.to_thread(_warm_up_models)

        yield

    await engine.dispose()


app = FastAPI(title="FinGuardian AI", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # bearer tokens, no cookies
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "FinGuardian AI backend is running. See /docs."}


@app.get("/health")
async def health_check():
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        database = "ok"
    except Exception:  # noqa: BLE001
        logger.exception("Health check: database unreachable")
        raise HTTPException(status_code=503, detail={"status": "degraded", "database": "unreachable"})
    return {"status": "ok", "database": database, "environment": settings.app_env}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/register", response_model=UserOut, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User.id).where(User.email == user_data.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(email=user_data.email, hashed_password=hash_password(user_data.password))
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@app.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
async def login(request: Request, user_data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return TokenOut(access_token=create_access_token(user.id, user.role))


@app.get("/me", response_model=UserOut)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def _market_snapshot(result: dict) -> dict | None:
    raw = result.get("raw_market_data")
    if not raw:
        return None
    keep = (
        "company_name", "currency", "exchange", "current_price", "previous_close",
        "day_high", "day_low", "volume", "market_cap", "fifty_two_week_high",
        "fifty_two_week_low", "recent_dates", "recent_closes", "recent_volumes", "fetched_at",
    )
    snapshot = {key: raw.get(key) for key in keep}
    snapshot["technical_indicators"] = result.get("technical_indicators")
    snapshot["market_summary"] = result.get("market_summary")
    snapshot["sentiment_summary"] = result.get("sentiment_summary")
    return snapshot


def _build_analysis_response(request_id: str, thread_id: str, symbol: str, asset_type: str, result: dict) -> AnalysisResponse:
    is_paused = "__interrupt__" in result
    return AnalysisResponse(
        request_id=request_id,
        thread_id=thread_id,
        status="pending_review" if is_paused else "completed",
        symbol=symbol,
        asset_type=asset_type,
        risk_score=result.get("risk_score"),
        risk_factors=result.get("risk_factors"),
        fraud_flag=result.get("fraud_flag"),
        fraud_confidence=result.get("fraud_confidence"),
        shap_explanation=result.get("shap_explanation"),
        requires_human_review=result.get("requires_human_review"),
        human_decision=result.get("human_decision"),
        outlook=result.get("outlook"),
        outlook_rationale=result.get("outlook_rationale"),
        final_report=result.get("final_report"),
        alerts_sent=result.get("alerts_sent") or [],
        sentiment_score=result.get("sentiment_score"),
        market_snapshot=_market_snapshot(result),
        news_articles=result.get("scored_news") or [],
        agent_log=result.get("agent_log") or [],
    )


def _apply_response(record: Analysis, response: AnalysisResponse) -> None:
    record.status = response.status
    record.risk_score = response.risk_score
    record.risk_factors = response.risk_factors
    record.fraud_flag = response.fraud_flag
    record.fraud_confidence = response.fraud_confidence
    record.shap_explanation = response.shap_explanation
    record.requires_human_review = response.requires_human_review
    record.human_decision = response.human_decision
    record.outlook = response.outlook
    record.outlook_rationale = response.outlook_rationale
    record.final_report = response.final_report
    record.alerts_sent = response.alerts_sent
    record.sentiment_score = response.sentiment_score
    record.market_snapshot = response.market_snapshot
    record.news_articles = [a.model_dump() for a in response.news_articles]
    record.agent_log = response.agent_log


def _response_from_record(record: Analysis) -> AnalysisResponse:
    return AnalysisResponse(
        request_id=record.request_id,
        thread_id=record.thread_id,
        status=record.status,
        symbol=record.symbol,
        asset_type=record.asset_type,
        risk_score=record.risk_score,
        risk_factors=record.risk_factors,
        fraud_flag=record.fraud_flag,
        fraud_confidence=record.fraud_confidence,
        shap_explanation=record.shap_explanation,
        requires_human_review=record.requires_human_review,
        human_decision=record.human_decision,
        outlook=record.outlook,
        outlook_rationale=record.outlook_rationale,
        final_report=record.final_report,
        alerts_sent=record.alerts_sent or [],
        sentiment_score=record.sentiment_score,
        market_snapshot=record.market_snapshot,
        news_articles=record.news_articles or [],
        agent_log=record.agent_log or [],
        reviewed_at=record.reviewed_at,
        created_at=record.created_at,
    )


@app.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("5/minute")
async def analyze_symbol(
    request: Request,
    payload: AnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    graph = request.app.state.graph
    request_id = f"req-{uuid.uuid4().hex}"
    thread_id = f"analysis-{uuid.uuid4().hex}"
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "request_id": request_id,
        "symbol": payload.symbol,
        "asset_type": payload.asset_type,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }

    # End the auth lookup's transaction so this request does not hold a pooled
    # Supabase connection "idle in transaction" for the whole 10-60 s pipeline.
    # (expire_on_commit=False keeps current_user usable afterwards.)
    await db.commit()

    try:
        result = await asyncio.wait_for(graph.ainvoke(initial_state, config), timeout=ANALYSIS_TIMEOUT_SECONDS)
    except SymbolNotFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis timed out - the market data source is slow. Try again.")
    except Exception:  # noqa: BLE001
        logger.exception("Pipeline failed for %s (thread %s)", payload.symbol, thread_id)
        raise HTTPException(status_code=502, detail="The analysis pipeline failed. Please try again shortly.")

    response = _build_analysis_response(request_id, thread_id, payload.symbol, payload.asset_type, result)

    record = Analysis(
        thread_id=thread_id,
        request_id=request_id,
        symbol=payload.symbol,
        asset_type=payload.asset_type,
        requested_by=current_user.id,
    )
    _apply_response(record, response)
    db.add(record)
    await db.commit()
    await db.refresh(record)

    response.created_at = record.created_at
    return response


@app.post("/analyze/{thread_id}/resume", response_model=AnalysisResponse)
async def resume_analysis(
    thread_id: str,
    payload: ResumeDecisionRequest,
    request: Request,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: a human's decision always overrides the model. An admin
    cannot review their own submission (separation of duties), and the row
    is locked while the decision is applied, so two admins clicking at the
    same time cannot both resume the same case."""
    locked = await db.execute(select(Analysis).where(Analysis.thread_id == thread_id).with_for_update())
    record = locked.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if record.requested_by == current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot review your own submission. Ask another admin to review this case.",
        )
    if record.status != "pending_review":
        raise HTTPException(status_code=409, detail="This analysis has already been reviewed.")

    graph = request.app.state.graph
    config = {"configurable": {"thread_id": thread_id}}

    state = await graph.aget_state(config)
    if not state.next:
        raise HTTPException(status_code=409, detail="This analysis is not currently paused for review.")

    try:
        result = await graph.ainvoke(Command(resume=payload.decision), config)
    except Exception:  # noqa: BLE001
        logger.exception("Resume failed for %s", thread_id)
        await db.rollback()
        raise HTTPException(status_code=502, detail="Could not resume the analysis. Please try again.")

    response = _build_analysis_response(record.request_id, thread_id, record.symbol, record.asset_type, result)
    _apply_response(record, response)
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now(timezone.utc)
    await db.commit()

    response.reviewed_at = record.reviewed_at
    response.created_at = record.created_at
    return response


@app.get("/analyses", response_model=list[AnalysisSummary])
async def list_my_analyses(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    symbol: str | None = Query(None, max_length=20, description="Only runs for this symbol (e.g. AAPL) - used by Compare"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The current user's own analysis history, most recent first."""
    query = select(Analysis).where(Analysis.requested_by == current_user.id)
    if symbol:
        query = query.where(Analysis.symbol == symbol.strip().upper())
    result = await db.execute(query.order_by(Analysis.created_at.desc()).limit(limit).offset(offset))
    return result.scalars().all()


@app.get("/analyses/{thread_id}", response_model=AnalysisResponse)
async def get_analysis_detail(
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full detail for an analysis - the requester's own, or any if admin."""
    record = await db.get(Analysis, thread_id)
    if record is None or (record.requested_by != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _response_from_record(record)


@app.get("/admin/pending-reviews", response_model=list[AdminPendingReview])
async def list_pending_reviews(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Every OTHER user's cases awaiting review, oldest first."""
    result = await db.execute(
        select(Analysis, User.email)
        .outerjoin(User, Analysis.requested_by == User.id)
        .where(Analysis.status == "pending_review")
        .where((Analysis.requested_by != current_user.id) | (Analysis.requested_by.is_(None)))
        .order_by(Analysis.created_at.asc())
    )
    return [
        AdminPendingReview(
            thread_id=a.thread_id,
            symbol=a.symbol,
            risk_score=a.risk_score,
            fraud_flag=a.fraud_flag,
            fraud_confidence=a.fraud_confidence,
            requested_by_email=email,
            created_at=a.created_at,
        )
        for a, email in result.all()
    ]
