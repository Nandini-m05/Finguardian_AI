from app.agents.state import AgentState

OUTLOOK_LABELS = {
    "positive_signals": "Positive signals",
    "mixed_signals": "Mixed signals",
    "negative_signals": "Negative signals",
}

# Below this many relevant articles, a sentiment score is too thin to count.
MIN_NEWS_ARTICLES = 3


def compute_outlook(state: dict) -> tuple[str, str]:
    """Summarize what the pipeline's signals say about a symbol.

    This describes conditions (risk, momentum, sentiment) - it never tells
    anyone to buy, sell or hold. A human reviewer's rejection always takes
    precedence over the models, and a sentiment score only counts when it
    rests on enough relevant news.
    """
    symbol = state.get("symbol")
    risk_score = state.get("risk_score") or 0
    human_decision = state.get("human_decision")
    momentum = (state.get("technical_indicators") or {}).get("momentum", "flat")

    scored = state.get("scored_news")
    news_count = len(scored) if scored is not None else len(state.get("raw_news_data") or [])
    sentiment_usable = news_count >= MIN_NEWS_ARTICLES
    sentiment_score = (state.get("sentiment_score") or 0) if sentiment_usable else 0

    if human_decision == "rejected":
        return (
            "negative_signals",
            f"{symbol}: a human reviewer flagged this case as suspicious - overriding all other signals.",
        )

    if risk_score >= 60:
        outlook = "negative_signals"
    elif risk_score >= 30:
        outlook = "mixed_signals"
    elif momentum == "up" and sentiment_score > 0.15:
        outlook = "positive_signals"
    elif momentum == "down" and sentiment_score < -0.15:
        outlook = "negative_signals"
    else:
        outlook = "mixed_signals"

    # A missing or thin news feed is not a neutral reading - say so explicitly.
    if sentiment_usable:
        sentiment_text = f"sentiment {sentiment_score:+.2f} across {news_count} articles"
    elif news_count == 0:
        sentiment_text = "sentiment unavailable (no news data)"
    else:
        plural = "article" if news_count == 1 else "articles"
        sentiment_text = f"sentiment unavailable (only {news_count} relevant {plural})"

    rationale = (
        f"{symbol}: risk score {risk_score}/100, {momentum} momentum, "
        f"{sentiment_text} -> {OUTLOOK_LABELS[outlook].lower()}."
    )
    if human_decision == "approved" and state.get("requires_human_review"):
        rationale += " (Manually reviewed and cleared despite elevated risk signals.)"

    return outlook, rationale


def outlook_node(state: AgentState) -> dict:
    """LangGraph node: Outlook Agent."""
    symbol = state["symbol"]

    if state.get("risk_score") is None:
        return {
            "agent_log": [f"[Outlook] Skipped - missing upstream data for {symbol}"],
        }

    outlook, rationale = compute_outlook(state)

    return {
        "outlook": outlook,
        "outlook_rationale": rationale,
        "agent_log": [f"[Outlook] {rationale}"],
    }
