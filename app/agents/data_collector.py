import asyncio
import logging
import math
import re
from datetime import datetime, timezone

import yfinance as yf
from langchain_core.runnables import RunnableConfig

from app.agents.state import AgentState
from app.events.event_bus import publish_event

logger = logging.getLogger(__name__)

DATA_COLLECTOR_STREAM = "data_collector_events"

# ~3 months of daily bars: enough for 20-day volatility and volume baselines.
HISTORY_PERIOD = "3mo"
# How many recent bars to keep in state (and in the DB snapshot for charts).
HISTORY_POINTS_KEPT = 60


class SymbolNotFoundError(ValueError):
    """Raised when Yahoo Finance has no price data for a symbol.

    Before this existed, an unknown ticker sailed through the pipeline with
    all-zero inputs and came out as a confident-looking 'mixed signals'
    report with risk score 0.
    """

# Words that appear in company names but say nothing about which company it is.
_NAME_NOISE = {"the", "inc", "corp", "corporation", "company", "co", "ltd", "limited", "plc", "holdings", "group"}


def _clean(value):
    """float() or None - drops NaN/inf that yfinance returns for gaps."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def fetch_market_data(symbol: str) -> dict:
    """Pull a market snapshot plus ~3 months of daily history for a symbol.

    Raises SymbolNotFoundError when there is no price history at all.
    """
    ticker = yf.Ticker(symbol)
    history = ticker.history(period=HISTORY_PERIOD, interval="1d")  # split/dividend adjusted
    if history is None or history.empty or history["Close"].dropna().empty:
        raise SymbolNotFoundError(f"No price data found for '{symbol}'. Check the ticker (e.g. RELIANCE.NS for NSE).")

    history = history.dropna(subset=["Close"]).tail(HISTORY_POINTS_KEPT)

    try:
        info = ticker.info or {}
    except Exception as exc:  # noqa: BLE001 - .info is flaky; history is enough
        logger.warning("[DataCollector] ticker.info failed for %s: %s", symbol, exc)
        info = {}

    closes = [_clean(c) for c in history["Close"].tolist()]
    volumes = [_clean(v) for v in history["Volume"].tolist()] if "Volume" in history else []
    dates = [idx.strftime("%Y-%m-%d") for idx in history.index]

    last_close = next((c for c in reversed(closes) if c is not None), None)
    prev_close = next((c for c in reversed(closes[:-1]) if c is not None), None)

    return {
        "company_name": info.get("shortName") or info.get("longName"),
        "currency": info.get("currency"),
        "exchange": info.get("exchange"),
        "current_price": _clean(info.get("currentPrice") or info.get("regularMarketPrice")) or last_close,
        "previous_close": _clean(info.get("previousClose") or info.get("regularMarketPreviousClose")) or prev_close,
        "day_high": _clean(info.get("dayHigh")),
        "day_low": _clean(info.get("dayLow")),
        "volume": _clean(info.get("volume")) or (volumes[-1] if volumes else None),
        "market_cap": _clean(info.get("marketCap")),
        "fifty_two_week_high": _clean(info.get("fiftyTwoWeekHigh")),
        "fifty_two_week_low": _clean(info.get("fiftyTwoWeekLow")),
        "recent_dates": dates,
        "recent_closes": closes,
        "recent_volumes": volumes,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def normalize_news_item(item: dict) -> dict | None:
    """Flatten one yfinance news item into the shape the pipeline expects.

    yfinance news comes in two shapes: nested under a 'content' key, or flat
    (title / publisher / link / providerPublishTime), which is what Yahoo's
    search results use. Handling both means a library or Yahoo change can't
    silently empty the news feed.
    """
    content = item.get("content") if isinstance(item.get("content"), dict) else item

    title = content.get("title")
    if not title:
        return None

    provider = content.get("provider")
    source = provider.get("displayName") if isinstance(provider, dict) else content.get("publisher")

    url_info = content.get("canonicalUrl") or content.get("clickThroughUrl")
    url = url_info.get("url") if isinstance(url_info, dict) else content.get("link")

    published = content.get("pubDate")
    if published is None and content.get("providerPublishTime"):
        published = datetime.fromtimestamp(content["providerPublishTime"], tz=timezone.utc).isoformat()

    return {
        "title": title,
        "url": url,
        "source": source,
        "summary": content.get("summary") or content.get("description") or "",
        "time_published": published,
    }


def company_keyword(company_name: str | None) -> str | None:
    """First meaningful word of a company name: 'Apple Inc.' -> 'Apple'."""
    if not company_name:
        return None
    for token in re.split(r"[\s,]+", company_name.strip()):
        word = token.strip(".,()").replace(".com", "")
        if len(word) >= 3 and word.lower() not in _NAME_NOISE:
            return word
    return None


def is_relevant(title: str, symbol: str, keyword: str | None) -> bool:
    """True if the headline names the company, or the ticker when it is 3+ letters.

    Yahoo search results are loosely tagged: a headline can carry a symbol in
    its tags without being about that company, so require the name in the text.
    """
    terms = []
    if keyword:
        terms.append(keyword)
    if len(symbol) >= 3:
        terms.append(symbol)
    return any(
        re.search(rf"(?<!\w){re.escape(term)}(?!\w)", title or "", flags=re.IGNORECASE)
        for term in terms
    )


def _search_news(symbol: str, count: int, keyword: str | None) -> list[dict]:
    """Fallback: Yahoo search results, kept only if tagged with the symbol AND
    actually about the company. Newest first.
    """
    results = yf.Search(symbol, news_count=max(count * 4, 40)).news or []
    wanted = symbol.upper()
    relevant = []
    for item in results:
        if not isinstance(item, dict):
            continue
        tags = [str(t).upper() for t in (item.get("relatedTickers") or [])]
        if wanted not in tags:
            continue
        if not is_relevant(item.get("title") or "", symbol, keyword):
            continue
        relevant.append(item)
    relevant.sort(key=lambda item: item.get("providerPublishTime") or 0, reverse=True)
    return relevant


def fetch_news_data(symbol: str, limit: int = 10, company_name: str | None = None) -> list[dict]:
    """Recent news for a symbol from Yahoo Finance.

    Tries the ticker's own feed first (so a fixed yfinance release takes over
    automatically), then falls back to relevance-filtered Yahoo search.
    Never raises: an empty result means the rest of the pipeline reports
    sentiment as unavailable.
    """
    raw_items = []
    try:
        raw_items = yf.Ticker(symbol).news or []
    except Exception as exc:
        logger.warning("[DataCollector] Ticker news issue: %s", exc)

    if not raw_items:
        try:
            raw_items = _search_news(symbol, limit, company_keyword(company_name))
        except Exception as exc:
            logger.warning("[DataCollector] News fetch issue: %s", exc)
            return []

    articles = []
    for item in raw_items:
        article = normalize_news_item(item) if isinstance(item, dict) else None
        if article:
            articles.append(article)

    if not articles:
        logger.info("[DataCollector] No relevant news items found for %s", symbol)

    return articles[:limit]


async def data_collector_node(state: AgentState, config: RunnableConfig) -> dict:
    """LangGraph node: Data Collector Agent."""
    symbol = state["symbol"]
    request_id = state["request_id"]
    thread_id = (config or {}).get("configurable", {}).get("thread_id")

    # yfinance is synchronous: run it in worker threads so the event loop
    # (and every other request) isn't blocked while it waits on the network.
    market_data = await asyncio.to_thread(fetch_market_data, symbol)
    news_data = await asyncio.to_thread(fetch_news_data, symbol, 10, market_data.get("company_name"))

    await publish_event(
        DATA_COLLECTOR_STREAM,
        {
            "status": "completed",
            "price_points": len(market_data["recent_closes"]),
            "articles_count": len(news_data),
            "published_at": datetime.now(timezone.utc).isoformat(),
        },
        thread_id=thread_id,
        request_id=request_id,
        symbol=symbol,
    )

    return {
        "raw_market_data": market_data,
        "raw_news_data": news_data,
        "agent_log": [
            f"[DataCollector] Fetched {len(market_data['recent_closes'])} daily bars for {symbol} at {market_data['fetched_at']}",
            f"[DataCollector] Fetched {len(news_data)} relevant news articles for {symbol}",
            "[DataCollector] Recorded completion event in pipeline_events",
        ],
    }
