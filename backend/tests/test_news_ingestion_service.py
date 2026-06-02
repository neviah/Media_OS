from backend.services.news_ingestion_service import NewsIngestionService


def test_fetch_news_uses_reddit_for_subreddit_urls(monkeypatch):
    service = NewsIngestionService()

    called = {"subreddit": None}

    def fake_fetch_reddit(subreddit, limit):
        called["subreddit"] = subreddit
        return [
            {
                "title": "AI tools update",
                "content": "Some content",
                "url": "https://reddit.com/r/technology/post1",
                "score": 42,
                "published_at": None,
            }
        ]

    monkeypatch.setattr(service, "_fetch_reddit_items", fake_fetch_reddit)

    items = service.fetch_news(
        source_name="reddit",
        source_url="https://www.reddit.com/r/technology/",
        keywords="ai",
    )

    assert called["subreddit"] == "technology"
    assert len(items) == 1
    assert items[0]["title"] == "AI tools update"


def test_fetch_news_filters_by_keywords(monkeypatch):
    service = NewsIngestionService()

    def fake_fetch_rss(feed_url, limit):
        return [
            {
                "title": "Sports headlines",
                "content": "Team wins championship",
                "url": "https://example.com/sports",
                "score": 0,
                "published_at": None,
            },
            {
                "title": "AI policy brief",
                "content": "New AI regulation announced",
                "url": "https://example.com/ai",
                "score": 0,
                "published_at": None,
            },
        ]

    monkeypatch.setattr(service, "_fetch_rss_items", fake_fetch_rss)

    items = service.fetch_news(
        source_name="rss",
        source_url="https://example.com/feed.xml",
        keywords="ai,policy",
    )

    assert len(items) == 1
    assert items[0]["url"] == "https://example.com/ai"


def test_fetch_rss_items_parses_basic_rss(monkeypatch):
    service = NewsIngestionService()

    rss_xml = """
    <rss version="2.0">
      <channel>
        <title>Example Feed</title>
        <item>
          <title>Story One</title>
          <link>https://example.com/story-one</link>
          <description><![CDATA[<p>Paragraph <b>one</b></p>]]></description>
          <pubDate>Mon, 02 Jun 2026 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
    """

    class DummyResponse:
        def __init__(self, text):
            self.text = text

        def raise_for_status(self):
            return None

    class DummyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url):
            return DummyResponse(rss_xml)

    import backend.services.news_ingestion_service as ingestion_module

    monkeypatch.setattr(ingestion_module.httpx, "Client", DummyClient)

    items = service._fetch_rss_items("https://example.com/feed.xml", limit=5)

    assert len(items) == 1
    assert items[0]["title"] == "Story One"
    assert items[0]["url"] == "https://example.com/story-one"
    assert "Paragraph one" in items[0]["content"]
