from app.agents.outlook import compute_outlook, OUTLOOK_LABELS, MIN_NEWS_ARTICLES

THREE_ARTICLES = [{"title": "a"}, {"title": "b"}, {"title": "c"}]


def _state(**overrides):
    base = {
        "symbol": "AAPL",
        "risk_score": 15.0,
        "human_decision": "approved",
        "technical_indicators": {"momentum": "flat"},
        "sentiment_score": 0.0,
        "raw_news_data": THREE_ARTICLES,
    }
    base.update(overrides)
    return base


def test_human_rejection_overrides_everything():
    state = _state(
        risk_score=5.0,
        human_decision="rejected",
        technical_indicators={"momentum": "up"},
        sentiment_score=0.9,
    )
    outlook, rationale = compute_outlook(state)
    assert outlook == "negative_signals"
    assert "reviewer" in rationale.lower()


def test_high_risk_gives_negative_signals():
    outlook, _ = compute_outlook(_state(risk_score=82.0))
    assert outlook == "negative_signals"


def test_moderate_risk_gives_mixed_signals():
    state = _state(risk_score=41.3, technical_indicators={"momentum": "up"}, sentiment_score=0.39)
    outlook, _ = compute_outlook(state)
    assert outlook == "mixed_signals"


def test_low_risk_with_supportive_signals_is_positive():
    state = _state(risk_score=15.0, technical_indicators={"momentum": "up"}, sentiment_score=0.5)
    outlook, _ = compute_outlook(state)
    assert outlook == "positive_signals"


def test_low_risk_with_deteriorating_signals_is_negative():
    state = _state(risk_score=15.0, technical_indicators={"momentum": "down"}, sentiment_score=-0.5)
    outlook, _ = compute_outlook(state)
    assert outlook == "negative_signals"


def test_output_never_uses_advice_language():
    """Guards the analysis-not-advice framing: the engine describes
    signals and must never tell anyone to act."""
    banned = ("buy", "sell", "hold", "avoid", "recommend")
    for risk in (0, 15, 41.3, 82):
        for momentum in ("up", "down", "flat"):
            for sentiment in (-0.5, 0.0, 0.5):
                for decision in ("approved", "rejected", None):
                    state = _state(
                        risk_score=risk,
                        technical_indicators={"momentum": momentum},
                        sentiment_score=sentiment,
                        human_decision=decision,
                        requires_human_review=True,
                    )
                    outlook, rationale = compute_outlook(state)
                    text = (outlook + " " + rationale).lower()
                    for word in banned:
                        assert word not in text, (word, text)
    assert set(OUTLOOK_LABELS) == {"positive_signals", "mixed_signals", "negative_signals"}


def test_no_news_says_sentiment_unavailable_and_ignores_the_score():
    state = _state(risk_score=15.0, technical_indicators={"momentum": "up"}, sentiment_score=0.9, raw_news_data=[])
    outlook, rationale = compute_outlook(state)
    assert outlook == "mixed_signals"
    assert "sentiment unavailable (no news data)" in rationale
    assert "+0.90" not in rationale


def test_enough_news_reports_the_sentiment_and_its_basis():
    state = _state(risk_score=15.0, technical_indicators={"momentum": "up"}, sentiment_score=0.5)
    outlook, rationale = compute_outlook(state)
    assert outlook == "positive_signals"
    assert "sentiment +0.50 across 3 articles" in rationale


def test_thin_news_cannot_drive_the_outlook():
    thin = THREE_ARTICLES[: MIN_NEWS_ARTICLES - 1]
    state = _state(risk_score=15.0, technical_indicators={"momentum": "up"}, sentiment_score=0.9, raw_news_data=thin)
    outlook, rationale = compute_outlook(state)
    assert outlook == "mixed_signals"
    assert "only 2 relevant articles" in rationale
