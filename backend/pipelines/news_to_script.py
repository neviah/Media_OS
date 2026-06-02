# backend/pipelines/news_to_script.py
"""
News to Script Pipeline
Fetches news, summarizes, and generates scripts using LLMs
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime

from backend.models.database import NewsSource, Script
from backend.services.llm_service import llm_service
from backend.database import SessionLocal
from backend import models

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
        
        # In a real implementation:
        # 1. Based on source type (reddit, rss, etc.), fetch news
        # 2. Apply filters (keywords, recency, score)
        # 3. Return processed news items
        
        # For now, we'll use a placeholder implementation
        # In a real system, this would connect to Reddit API, RSS feeds, etc.
        mock_news = [
            {
                "title": "Sample News Article",
                "content": "This is a sample news article content for demonstration purposes. In a real implementation, this would be fetched from actual news sources.",
                "url": "https://example.com/news/1",
                "source_id": news_source_id,
                "score": 100,
                "published_at": datetime.utcnow()
            }
        ]
        return mock_news
    
    def summarize_news(self, news_item: Dict[str, Any]) -> str:
        """
        Summarize a news item using LLM
        
        Args:
            news_item: Dictionary containing news data
            
        Returns:
            Summary text
        """
        try:
            prompt = f"""
            Please provide a concise summary of the following news article:
            
            Title: {news_item['title']}
            Content: {news_item['content']}
            
            Summary:
            """
            
            # Use the real LLM service
            summary = llm_service.generate_text(prompt, max_length=150)
            return summary.strip()
        except Exception as e:
            logger.error(f"Error summarizing news: {e}")
            # Fallback to truncation
            return news_item['content'][:200] + "..." if len(news_item['content']) > 200 else news_item['content']
    
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
            # Get channel info for context
            from backend.models.database import Channel
            channel = self.db.query(Channel).filter(Channel.id == channel_id).first()
            channel_name = channel.name if channel else "Unknown Channel"
            
            prompt = f"""
            Generate an engaging video script based on the following news summary.
            Channel: {channel_name}
            Style: {script_style_preset}
            
            News Summary:
            {summary}
            
            The script should be:
            - Engaging and suitable for video presentation
            - Appropriate length for a 1-3 minute video
            - Include a hook, main content, and call-to-action if appropriate
            - Match the {script_style_preset} style
            
            Script:
            """
            
            # Use the real LLM service
            script = llm_service.generate_text(prompt, max_length=500)
            return script.strip()
        except Exception as e:
            logger.error(f"Error generating script: {e}")
            return f"[Script generation failed: {str(e)}]"
    
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
            # Determine news source to use
            if news_source_id is None:
                # Get default news source for workspace/channel
                # In reality, this would come from channel/workspace config
                news_source_id = 1  # Stub - in reality, we'd get this from config
            
            # Fetch news
            news_items = self.fetch_news_from_source(news_source_id)
            if not news_items:
                logger.warning(f"No news found for source {news_source_id}")
                return None
            
            # Process the top news item
            top_news = news_items[0]
            
            # Summarize
            summary = self.summarize_news(top_news)
            
            # Generate script
            # Get channel's script style preset
            from backend.models.database import Channel
            channel = self.db.query(Channel).filter(Channel.id == channel_id).first()
            script_style = channel.script_style_preset if channel else "informative"
            
            script_content = self.generate_script(summary, channel_id, script_style)
            
            # Create script record
            new_script = models.Script(
                workspace_id=workspace_id,
                channel_id=channel_id,
                news_source_id=news_source_id,
                title=f"Script: {top_news['title'][:50]}...",
                content=script_content,
                summary=summary,
                hashtags="#news #update",  # Could be generated by LLM
                is_validated=False  # Will be validated by Hermes Agent
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