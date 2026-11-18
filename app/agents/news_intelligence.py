import logging
import threading

from app.agents.outlook import MIN_NEWS_ARTICLES
from app.agents.state import AgentState

logger = logging.getLogger(__name__)

FINBERT_MODEL = "ProsusAI/finbert"

_finbert = None
_finbert_lock = threading.Lock()


def get_finbert():
    """Load FinBERT once per process, on first use (or at API startup via
    preload). Importing this module no longer downloads a ~440 MB model,
    so unit tests and Alembic can import the agents cheaply."""
    global _finbert
    if _finbert is None:
        with _finbert_lock:
            if _finbert is None:
                from transformers import pipeline

                logger.info("Loading %s ...", FINBERT_MODEL)
                _finbert = pipeline("sentiment-analysis", model=FINBERT_MODEL)
    return _finbert


def _dedupe(articles: list[dict]) -> list[dict]:
    """Syndicated stories appear several times; count each headline once."""
    seen, unique = set(), []
    for article in articles:
        key = (article.get("title") or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(article)
    return unique


def score_articles(articles: list[dict]) -> list[dict]:
    """Run FinBERT sentiment scoring on a batch of news articles."""
    if not articles:
        return []

    texts = [
        f"{article.get('title', '')}. {article.get('summary', '')}".strip(". ")
        for article in articles
    ]
    results = get_finbert()(texts, truncation=True)

    return [
        {
            **article,
            "sentiment_label": result["label"],
            "sentiment_confidence": round(result["score"], 3),
        }
        for article, result in zip(articles, results)
    ]


def aggregate_sentiment(scored_articles: list[dict]) -> tuple[float, str]:
    """Combine per-article FinBERT scores into one overall sentiment score (-1 to +1).

    Confidence matters here, not just label - a 0.95-confidence negative
    should pull the average down harder than a 0.55-confidence one.
    """
    if not scored_articles:
        return 0.0, "No news articles available to assess sentiment."

    signed_scores = []
    counts = {"positive": 0, "negative": 0, "neutral": 0}

    for article in scored_articles:
        label = article["sentiment_label"]
        confidence = article["sentiment_confidence"]
        counts[label] = counts.get(label, 0) + 1
        if label == "positive":
            signed_scores.append(confidence)
        elif label == "negative":
            signed_scores.append(-confidence)
        else:
            signed_scores.append(0.0)

    overall_score = round(sum(signed_scores) / len(signed_scores), 3)
    tone = "positive" if overall_score > 0.15 else "negative" if overall_score < -0.15 else "mixed/neutral"

    summary = (
        f"Overall news sentiment is {tone} ({overall_score:+.2f}) across "
        f"{len(scored_articles)} articles - {counts['positive']} positive, "
        f"{counts['negative']} negative, {counts['neutral']} neutral."
    )

    return overall_score, summary


def news_intelligence_node(state: AgentState) -> dict:
    """LangGraph node: News Intelligence Agent."""
    symbol = state["symbol"]
    articles = _dedupe(state.get("raw_news_data") or [])

    if not articles:
        return {
            "sentiment_score": 0.0,
            "sentiment_reliable": False,
            "scored_news": [],
            "sentiment_summary": "No news articles available to assess sentiment.",
            "agent_log": [f"[NewsIntelligence] Skipped - no relevant news found for {symbol}"],
        }

    scored_articles = score_articles(articles)
    overall_score, summary = aggregate_sentiment(scored_articles)
    reliable = len(scored_articles) >= MIN_NEWS_ARTICLES
    if not reliable:
        summary += f" Too few articles (< {MIN_NEWS_ARTICLES}) to treat this as a signal."

    return {
        "sentiment_score": overall_score,
        "sentiment_reliable": reliable,
        "scored_news": [
            {
                "title": a.get("title"),
                "url": a.get("url"),
                "source": a.get("source"),
                "time_published": a.get("time_published"),
                "sentiment_label": a.get("sentiment_label"),
                "sentiment_confidence": a.get("sentiment_confidence"),
            }
            for a in scored_articles
        ],
        "sentiment_summary": summary,
        "agent_log": [f"[NewsIntelligence] Scored {len(scored_articles)} articles for {symbol}: {summary}"],
    }
