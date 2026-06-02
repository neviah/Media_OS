"""
News ingestion service.

Fetches news from:
- Reddit subreddit URLs (public JSON endpoint)
- RSS/Atom feed URLs

Each returned item follows a normalized shape:
{
  "title": str,
  "content": str,
  "url": str,
  "score": int,
  "published_at": datetime | None,
}
"""

from __future__ import annotations

import html
import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

import httpx


logger = logging.getLogger(__name__)

_REDDIT_SUBREDDIT_PATTERN = re.compile(r"reddit\.com/r/([^/]+)", re.IGNORECASE)
_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    plain = _HTML_TAG_PATTERN.sub(" ", text or "")
    plain = html.unescape(plain)
    return " ".join(plain.split())


def _parse_keywords(keywords: str | None) -> list[str]:
    if not keywords:
        return []
    return [item.strip().lower() for item in keywords.split(",") if item.strip()]


def _keyword_match(item: dict[str, Any], keywords: list[str]) -> bool:
    if not keywords:
        return True
    haystack = f"{item.get('title', '')} {item.get('content', '')}".lower()
    return any(keyword in haystack for keyword in keywords)


def _coerce_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return None


def _extract_atom_link(entry: ET.Element) -> str:
    for node in entry.findall("{*}link"):
        href = node.attrib.get("href")
        if href:
            return href
        if node.text:
            return node.text.strip()
    return ""


class NewsIngestionService:
    def __init__(self, timeout_seconds: float = 12.0):
        self.timeout_seconds = timeout_seconds

    def fetch_news(self, source_name: str, source_url: str, keywords: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
        if not source_url:
            return []

        subreddit = self._extract_subreddit(source_name=source_name, source_url=source_url)
        if subreddit:
            items = self._fetch_reddit_items(subreddit=subreddit, limit=limit)
        else:
            items = self._fetch_rss_items(feed_url=source_url, limit=limit)

        parsed_keywords = _parse_keywords(keywords)
        filtered = [item for item in items if _keyword_match(item, parsed_keywords)]
        return filtered

    def _extract_subreddit(self, source_name: str, source_url: str) -> str | None:
        # Detect reddit sources via URL first, then source name fallback.
        match = _REDDIT_SUBREDDIT_PATTERN.search(source_url)
        if match:
            return match.group(1)

        if (source_name or "").lower() == "reddit":
            path_segments = [segment for segment in urlparse(source_url).path.split("/") if segment]
            if path_segments:
                return path_segments[-1]
        return None

    def _fetch_reddit_items(self, subreddit: str, limit: int) -> list[dict[str, Any]]:
        url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={max(1, min(limit, 25))}"
        headers = {
            "User-Agent": "MediaOS/1.0 (news ingestion)",
            "Accept": "application/json",
        }

        with httpx.Client(timeout=self.timeout_seconds, headers=headers, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            payload = response.json()

        children = payload.get("data", {}).get("children", [])
        items: list[dict[str, Any]] = []
        for child in children:
            data = child.get("data", {})
            title = (data.get("title") or "").strip()
            if not title:
                continue

            content = (data.get("selftext") or "").strip()
            if not content:
                content = (data.get("url") or "").strip()

            permalink = data.get("permalink") or ""
            article_url = f"https://www.reddit.com{permalink}" if permalink.startswith("/") else (data.get("url") or "")
            created_ts = data.get("created_utc")
            published_at = datetime.utcfromtimestamp(created_ts) if created_ts else None

            items.append(
                {
                    "title": title,
                    "content": content,
                    "url": article_url,
                    "score": int(data.get("score") or 0),
                    "published_at": published_at,
                }
            )

        return items

    def _fetch_rss_items(self, feed_url: str, limit: int) -> list[dict[str, Any]]:
        headers = {
            "User-Agent": "MediaOS/1.0 (news ingestion)",
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml",
        }

        with httpx.Client(timeout=self.timeout_seconds, headers=headers, follow_redirects=True) as client:
            response = client.get(feed_url)
            response.raise_for_status()
            xml_text = response.text

        root = ET.fromstring(xml_text)

        items: list[dict[str, Any]] = []
        rss_items = root.findall(".//item")
        atom_entries = root.findall(".//{*}entry") if not rss_items else []

        if rss_items:
            for node in rss_items[: max(1, min(limit, 25))]:
                title = (node.findtext("title") or "").strip()
                if not title:
                    continue

                content = (
                    node.findtext("description")
                    or node.findtext("content:encoded")
                    or node.findtext("summary")
                    or ""
                )
                content = _strip_html(content)
                link = (node.findtext("link") or "").strip()
                published_at = _coerce_datetime(node.findtext("pubDate") or node.findtext("published") or node.findtext("updated"))

                items.append(
                    {
                        "title": title,
                        "content": content,
                        "url": link,
                        "score": 0,
                        "published_at": published_at,
                    }
                )

        else:
            for entry in atom_entries[: max(1, min(limit, 25))]:
                title = (entry.findtext("{*}title") or "").strip()
                if not title:
                    continue

                content = entry.findtext("{*}summary") or entry.findtext("{*}content") or ""
                content = _strip_html(content)
                link = _extract_atom_link(entry)
                published_at = _coerce_datetime(entry.findtext("{*}published") or entry.findtext("{*}updated"))

                items.append(
                    {
                        "title": title,
                        "content": content,
                        "url": link,
                        "score": 0,
                        "published_at": published_at,
                    }
                )

        return items


news_ingestion_service = NewsIngestionService()
