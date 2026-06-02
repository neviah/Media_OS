# backend/pipelines/news_to_script.py
"""News to Script pipeline.

Flow:
1) Resolve and fetch active news from source (RSS or Reddit)
2) Summarize top item with the task-routed LLM service
3) Generate script + hashtags + QA check
4) Persist script to DB
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from backend import models
from backend.database import SessionLocal
from backend.models.database import Channel, NewsSource, Script
from backend.services.llm_service import llm_service
from backend.services.news_ingestion_service import news_ingestion_service

logger = logging.getLogger(__name__)

class NewsToScriptPipeline:
    def __init__(self):
        self.db = SessionLocal()
    
    def fetch_news_from_source(self, news_source_id: int) -> list:
        """
        Fetch news from a configured news source
        
        Args:
            news_source_id: ID of the news source
            
        Returns:
            List of news items (each as dict with title, content, url, etc.)
        """
        news_source = self.db.query(NewsSource).filter(NewsSource.id == news_source_id).first()
        if not news_source:
            logger.error(f"News source {news_source_id} not found")
            return []
        
        try:
            items = news_ingestion_service.fetch_news(
                source_name=news_source.name,
                source_url=news_source.source_url,
                keywords=news_source.keywords,
                limit=10,
            )
            news_source.last_pulled = datetime.utcnow()
            self.db.commit()
            return items
        except Exception as exc:
            logger.error(f"Failed fetching news source {news_source_id}: {exc}")
            return []
    
    def summarize_news(self, news_item: Dict[str, Any]) -> str:
        """
        Summarize a news item using LLM
        
        Args:
            news_item: Dictionary containing news data
            
        Returns:
            Summary text
        """
        try:
            prompt = (
                "Please provide a concise summary of the following news article.\n\n"
                f"Title: {news_item.get('title', '')}\n"
                f"Content: {news_item.get('content', '')}\n"
                f"URL: {news_item.get('url', '')}\n\n"
                "Summary:"
            )
            summary = llm_service.generate_text(prompt, task="summarize", max_tokens=220)
            return summary.strip()
        except Exception as e:
            logger.error(f"Error summarizing news: {e}")
            # Fallback to truncation
            content = news_item.get('content', '')
            return content[:200] + "..." if len(content) > 200 else content
    
    def generate_script(self, summary: str, channel_id: int, 
                       script_style_preset: str = "informative") -> str:
        """
        Generate a script from summary using LLM
        
        Args:
            summary: News summary
            channel_id: ID of the channel (for style context)
            script_style_preset: Style preset for the script
            
        Returns:
            Generated script text
        """
        try:
            channel = self.db.query(Channel).filter(Channel.id == channel_id).first()
            channel_name = channel.name if channel else "Unknown Channel"

            prompt = (
                "Generate an engaging video script based on the following news summary.\n"
                f"Channel: {channel_name}\n"
                f"Style: {script_style_preset}\n\n"
                f"News Summary:\n{summary}\n\n"
                "Script:"
            )

            script = llm_service.generate_text(prompt, task="script", max_tokens=900)
            return script.strip()
        except Exception as e:
            logger.error(f"Error generating script: {e}")
            return f"[Script generation failed: {str(e)}]"

    def _resolve_news_source_id(self, workspace_id: int, news_source_id: Optional[int]) -> Optional[int]:
        if news_source_id is not None:
            return news_source_id

        source = (
            self.db.query(NewsSource)
            .filter(NewsSource.workspace_id == workspace_id, NewsSource.is_active == True)
            .order_by(NewsSource.updated_at.desc())
            .first()
        )
        if source:
            return source.id

        logger.warning(f"No active news source found for workspace {workspace_id}")
        return None
    
    def process_news_to_script(self, workspace_id: int, channel_id: int, 
                              news_source_id: Optional[int] = None) -> Optional[Script]:
        """
        Complete pipeline: fetch news -> summarize -> generate script
        
        Args:
            workspace_id: ID of the workspace
            channel_id: ID of the channel
            news_source_id: Optional specific news source to use
            
        Returns:
            Created Script object or None if failed
        """
        try:
            news_source_id = self._resolve_news_source_id(workspace_id=workspace_id, news_source_id=news_source_id)
            if news_source_id is None:
                return None
            
            # Fetch news
            news_items = self.fetch_news_from_source(news_source_id)
            if not news_items:
                logger.warning(f"No news found for source {news_source_id}")
                return None
            
            # Use highest score if provided (Reddit), otherwise first feed item.
            top_news = sorted(news_items, key=lambda item: item.get("score") or 0, reverse=True)[0]
            
            # Summarize
            summary = self.summarize_news(top_news)
            
            # Generate script
            channel = self.db.query(Channel).filter(Channel.id == channel_id).first()
            script_style = channel.script_style_preset if channel else "informative"

            script_content = self.generate_script(summary, channel_id, script_style)
            hashtags = llm_service.generate_hashtags(script_content, count=5)
            qa_result = llm_service.qa_check(script_content, summary)
            is_validated = qa_result.strip().upper().startswith("PASS")
            
            # Create script record
            new_script = models.Script(
                workspace_id=workspace_id,
                channel_id=channel_id,
                news_source_id=news_source_id,
                title=f"Script: {top_news.get('title', 'Untitled')[:80]}",
                content=script_content,
                summary=summary,
                hashtags=hashtags,
                is_validated=is_validated,
                validation_notes=None if is_validated else qa_result,
            )
            
            self.db.add(new_script)
            self.db.commit()
            self.db.refresh(new_script)
            
            logger.info(f"Created script {new_script.id} from news source {news_source_id}")
            return new_script
            
        except Exception as e:
            logger.error(f"Error in news to script pipeline: {e}")
            self.db.rollback()
            return None
        finally:
            self.db.close()

# Global instance
news_to_script_pipeline = NewsToScriptPipeline()