from app.agents import data_collector
from app.agents.data_collector import normalize_news_item, company_keyword, is_relevant


def _patch_yfinance(monkeypatch, ticker_news, search_news):
    """Replace yfinance's Ticker and Search with fakes; returns a call counter."""
    calls = {"search": 0}

    class FakeTicker:
        def __init__(self, symbol):
            if isinstance(ticker_news, Exception):
                raise ticker_news
            self.news = ticker_news

    class FakeSearch:
        def __init__(self, symbol, news_count=10, **kwargs):
            calls["search"] += 1
            self.news = search_news

    monkeypatch.setattr(data_collector.yf, "Ticker", FakeTicker)
    monkeypatch.setattr(data_collector.yf, "Search", FakeSearch)
    return calls


def test_nested_format():
    item = {
        "id": "abc",
        "content": {
            "title": "Apple unveils new chip",
            "summary": "Apple announced a new chip today.",
            "pubDate": "2026-10-26T16:20:58Z",
            "provider": {"displayName": "Reuters"},
            "canonicalUrl": {"url": "https://example.com/apple-chip"},
        },
    }
    assert normalize_news_item(item) == {
        "title": "Apple unveils new chip",
        "url": "https://example.com/apple-chip",
        "source": "Reuters",
        "summary": "Apple announced a new chip today.",
        "time_published": "2026-10-26T16:20:58Z",
    }


def test_flat_format_as_used_by_yahoo_search():
    item = {
        "title": "Old style headline",
        "publisher": "Bloomberg",
        "link": "https://example.com/old",
        "providerPublishTime": 1761495658,
    }
    article = normalize_news_item(item)
    assert article["title"] == "Old style headline"
    assert article["source"] == "Bloomberg"
    assert article["url"] == "https://example.com/old"
    assert article["summary"] == ""
    assert article["time_published"].startswith("2025-10-26")


def test_item_without_a_title_is_dropped():
    assert normalize_news_item({"content": {"summary": "no headline"}}) is None
    assert normalize_news_item({}) is None


def test_missing_summary_becomes_empty_string():
    item = {"content": {"title": "Headline only", "provider": {"displayName": "AP"}}}
    article = normalize_news_item(item)
    assert article["summary"] == ""
    assert article["source"] == "AP"


def test_malformed_nested_fields_do_not_crash():
    item = {"content": {"title": "Odd shape", "provider": "just-a-string", "canonicalUrl": None}}
    article = normalize_news_item(item)
    assert article["title"] == "Odd shape"
    assert article["url"] is None
    assert article["source"] is None


def test_ticker_feed_is_used_first_and_capped(monkeypatch):
    items = [{"content": {"title": f"Headline {i}"}} for i in range(15)] + [{"content": {}}]
    calls = _patch_yfinance(monkeypatch, items, [])
    articles = data_collector.fetch_news_data("AAPL", limit=10)
    assert len(articles) == 10
    assert articles[0]["title"] == "Headline 0"
    assert calls["search"] == 0


def test_search_fallback_keeps_only_tagged_and_relevant_articles_newest_first(monkeypatch):
    search_items = [
        {"title": "Apple jumps on AI news", "relatedTickers": ["AAPL"], "providerPublishTime": 1000},
        {"title": "Why Apple stock is rising", "relatedTickers": ["AAPL", "MSFT"], "providerPublishTime": 2000},
        {"title": "Nvidia CEO under pressure", "relatedTickers": ["AAPL", "NVDA"], "providerPublishTime": 3000},
        {"title": "Apple at risk", "relatedTickers": ["MSFT"], "providerPublishTime": 4000},
        {"title": "Apple untagged", "providerPublishTime": 5000},
    ]
    calls = _patch_yfinance(monkeypatch, [], search_items)
    articles = data_collector.fetch_news_data("aapl", company_name="Apple Inc.")
    assert [a["title"] for a in articles] == ["Why Apple stock is rising", "Apple jumps on AI news"]
    assert calls["search"] == 1


def test_search_fallback_without_a_company_name_matches_the_ticker_only(monkeypatch):
    search_items = [
        {"title": "AAPL hits a record", "relatedTickers": ["AAPL"], "providerPublishTime": 1000},
        {"title": "Apple hits a record", "relatedTickers": ["AAPL"], "providerPublishTime": 2000},
    ]
    _patch_yfinance(monkeypatch, [], search_items)
    articles = data_collector.fetch_news_data("AAPL", company_name=None)
    assert [a["title"] for a in articles] == ["AAPL hits a record"]


def test_short_symbol_without_a_company_name_returns_nothing_instead_of_unfiltered_news(monkeypatch):
    search_items = [{"title": "Anything at all", "relatedTickers": ["T"], "providerPublishTime": 1000}]
    _patch_yfinance(monkeypatch, [], search_items)
    assert data_collector.fetch_news_data("T", company_name=None) == []


def test_returns_empty_list_when_ticker_raises_and_search_is_empty(monkeypatch):
    _patch_yfinance(monkeypatch, RuntimeError("network down"), [])
    assert data_collector.fetch_news_data("AAPL") == []


def test_returns_empty_list_when_nothing_is_found(monkeypatch):
    _patch_yfinance(monkeypatch, [], [])
    assert data_collector.fetch_news_data("AAPL") == []


def test_company_keyword():
    assert company_keyword("Apple Inc.") == "Apple"
    assert company_keyword("NVIDIA Corporation") == "NVIDIA"
    assert company_keyword("Meta Platforms, Inc.") == "Meta"
    assert company_keyword("Amazon.com, Inc.") == "Amazon"
    assert company_keyword("The Coca-Cola Company") == "Coca-Cola"
    assert company_keyword(None) is None
    assert company_keyword("") is None


def test_is_relevant():
    assert is_relevant("Apple Makes Major AI Pricing Move", "AAPL", "Apple")
    assert is_relevant("Apple's new chip", "AAPL", "Apple")
    assert is_relevant("AAPL options surge", "AAPL", None)
    assert not is_relevant("Nvidia's Huang scandal rattles AI industry", "AAPL", "Apple")
    assert not is_relevant("Why Is TSM Stock Rising Overnight?", "AAPL", "Apple")
    assert not is_relevant("Pineapple prices fall", "AAPL", "Apple")
