import pytest
from app.agents.risk_assessment import compute_risk_score


def test_calm_case_low_score_no_factors():
    indicators = {"volatility": 0.5, "price_change_pct": 0.2}
    score, factors = compute_risk_score(indicators, sentiment_score=0.3)

    assert score < 20
    assert factors == ["No significant risk signals detected"]


def test_weighted_scoring_matches_manual_calculation():
    # volatility_points = min(2.0*10, 40) = 20
    # sentiment_points  = min(0.5*30, 30) = 15 (negative sentiment only)
    # momentum_points   = min(5.0*5, 20)  = 20 (capped)
    indicators = {"volatility": 2.0, "price_change_pct": 5.0}
    score, factors = compute_risk_score(indicators, sentiment_score=-0.5)

    assert score == pytest.approx(55.0)
    assert len(factors) == 3


def test_positive_sentiment_never_adds_risk():
    indicators = {"volatility": 1.0, "price_change_pct": 0.0}
    score, _ = compute_risk_score(indicators, sentiment_score=0.9)
    assert score == pytest.approx(10.0)  # only volatility contributes


def test_score_never_exceeds_the_combined_component_caps():
    # Individual caps are 40 + 30 + 20 = 90 - the score can never reach
    # 100 through normal inputs, even at extreme values.
    indicators = {"volatility": 999, "price_change_pct": 999}
    score, _ = compute_risk_score(indicators, sentiment_score=-999)
    assert score == pytest.approx(90.0)


def test_volume_spike_adds_points_and_a_named_factor():
    indicators = {"volatility": 0.5, "price_change_pct": 0.0, "volume_ratio": 4.0}
    score, factors = compute_risk_score(indicators, sentiment_score=0.0)
    assert score == pytest.approx(5.0 + 10.0)  # 0.5*10 + capped volume points
    assert any("Unusual trading volume" in f for f in factors)


def test_node_ignores_sentiment_backed_by_too_few_articles():
    from app.agents.risk_assessment import risk_assessment_node

    state = {
        "symbol": "XYZ",
        "technical_indicators": {"volatility": 1.0, "price_change_pct": 0.0},
        "sentiment_score": -0.9,
        "sentiment_reliable": False,
    }
    assert risk_assessment_node(state)["risk_score"] == pytest.approx(10.0)
