# backend/pipelines/publishing.py
"""
Publishing Pipeline
Uploads final video to social media platforms (YouTube, TikTok, Instagram, X)
"""

import logging
from typing import Optional, Dict, Any
import json
import time

from backend.models.database import Video, PublishLog, Channel, Workspace
from backend.services.publishing_service import publishing_service
from backend.services.llm_service import llm_service
from backend.database import SessionLocal
from backend import models

logger = logging.getLogger(__name__)

class PublishingPipeline:
    def __init__(self):
        self.db = SessionLocal()
    
    def publish_video(self, video_id: int, platform: str, 
                     schedule_time: Optional[float] = None) -> Optional[PublishLog]:
        """
        Publish a video to a social media platform
        
        Args:
            video_id: ID of the video to publish
            platform: Target platform ('youtube', 'tiktok', 'instagram', 'x')
            schedule_time: Optional Unix timestamp for scheduled publishing
            
        Returns:
            Created PublishLog object or None if failed
        """
        try:
            # Get the video
            video = self.db.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.error(f"Video {video_id} not found")
                return None
            
            # Check if video has final video path
            if not video.final_video_path:
                logger.error(f"Video {video_id} has no final video path - not ready for publishing")
                return None
            
            # Get channel for credentials and metadata
            from backend.models.database import Channel
            channel = self.db.query(Channel).filter(Channel.id == video.channel_id).first()
            if not channel:
                logger.error(f"Channel {video.channel_id} not found for video {video_id}")
                return None
            
            # Get workspace for additional context
            from backend.models.database import Workspace
            workspace = self.db.query(Workspace).filter(Workspace.id == video.workspace_id).first()
            
            # Generate metadata (title, description, hashtags) using LLM
            metadata = self._generate_publish_metadata(video, channel, workspace)
            
            # Publish to the specified platform using the real publishing service
            result = None
            if platform.lower() == 'youtube':
                result = publishing_service.upload_youtube(
                    workspace_id=video.workspace_id,
                    video_path=video.final_video_path,
                    title=metadata['title'],
                    description=metadata['description'],
                    tags=metadata.get('hashtags', ''),
                    privacy='private',  # Could be made configurable
                    channel_id=video.channel_id,
                )
            elif platform.lower() == 'tiktok':
                result = publishing_service.upload_tiktok(
                    workspace_id=video.workspace_id,
                    video_path=video.final_video_path,
                    title=metadata['title'],
                    privacy='private',  # Could be made configurable
                    channel_id=video.channel_id,
                )
            elif platform.lower() == 'instagram':
                result = publishing_service.upload_instagram(
                    workspace_id=video.workspace_id,
                    video_path=video.final_video_path,
                    caption=metadata['description'],  # Using description as caption for Instagram
                    channel_id=video.channel_id,
                )
            elif platform.lower() == 'x':
                result = publishing_service.upload_x(
                    workspace_id=video.workspace_id,
                    video_path=video.final_video_path,
                    title=metadata['title'],  # Using title as the tweet text
                    channel_id=video.channel_id,
                )
            else:
                logger.error(f"Unsupported platform: {platform}")
                return None
            
            # Create publish log based on the result
            if result and result.get('success'):
                publish_log = models.PublishLog(
                    workspace_id=video.workspace_id,
                    channel_id=video.channel_id,
                    video_id=video.id,
                    platform=platform,
                    post_url=result.get('video_url'),
                    status='success' if schedule_time is None else 'scheduled',
                    published_at=None if schedule_time else None,  # Will be set when actually published
                    error_message=result.get('error')
                )
            else:
                # Failed to publish
                publish_log = models.PublishLog(
                    workspace_id=video.workspace_id,
                    channel_id=video.channel_id,
                    video_id=video.id,
                    platform=platform,
                    post_url=None,
                    status='failed',
                    published_at=None,
                    error_message=(
                        f"{result.get('error_code', 'publish_error')}: {result.get('error', 'Unknown error')}"
                        if result
                        else 'Publishing service returned no result'
                    )
                )
            
            self.db.add(publish_log)
            self.db.commit()
            self.db.refresh(publish_log)
            
            logger.info(f"Published video {video_id} to {platform} -> {publish_log.post_url}")
            return publish_log
            
        except Exception as e:
            logger.error(f"Error publishing video to {platform}: {e}")
            # Create a failed publish log
            try:
                failed_log = models.PublishLog(
                    workspace_id=video.workspace_id if 'video' in locals() and video else 0,
                    channel_id=video.channel_id if 'video' in locals() and video else 0,
                    video_id=video_id,
                    platform=platform,
                    status="failed",
                    error_message=str(e)
                )
                self.db.add(failed_log)
                self.db.commit()
                self.db.refresh(failed_log)
                return failed_log
            except:
                self.db.rollback()
                return None
        finally:
            self.db.close()
    
    def _generate_publish_metadata(self, video: Video, channel: Channel,
                                 workspace: Optional[Workspace]) -> Dict[str, Any]:
        """
        Generate publishing metadata (title, description, hashtags) using LLM
        
        Args:
            video: Video object
            channel: Channel object
            workspace: Workspace object (optional)
            
        Returns:
            Dictionary with title, description, hashtags
        """
        try:
            # Get the script associated with the video's audio
            from backend.models.database import Audio, Script
            audio = self.db.query(Audio).filter(Audio.id == video.audio_id).first()
            script = None
            if audio:
                script = self.db.query(Script).filter(Script.id == audio.script_id).first()
            
            # Prepare context for LLM
            context_parts = []
            if script:
                context_parts.append(f"Script: {script.content[:500]}...")  # Limit length
            if video.captions:
                context_parts.append(f"Captions: {video.captions[:300]}...")
            
            context = "\n\n".join(context_parts) if context_parts else "Video content"
            
            # Get channel style and workspace info
            channel_name = channel.name if channel else "Unknown Channel"
            channel_style = getattr(channel, 'script_style_preset', 'informative')
            workspace_name = workspace.name if workspace else "Unknown Workspace"
            
            prompt = f"""
            Generate engaging social media metadata for a video.
            
            Workspace: {workspace_name}
            Channel: {channel_name} (style: {channel_style})
            
            Video Context:
            {context}
            
            Please generate:
            1. A catchy title (under 100 characters)
            2. A detailed description (under 5000 characters)
            3. Relevant hashtags (as a comma-separated list)
            
            The metadata should be appropriate for the platform and audience,
            and should encourage engagement.
            
            Result format:
            TITLE: [title here]
            DESCRIPTION: [description here]
            HASHTAGS: [hashtags here]
            """
            
            # Use the real LLM service
            metadata_text = llm_service.generate_text(prompt, max_length=800)
            
            # Parse the response
            title = "Video Update"
            description = "New video content"
            hashtags = "#news #update"
            
            # Try to extract structured data from the response
            if "TITLE:" in metadata_text:
                title_line = metadata_text.split("TITLE:")[1].split("\n")[0]
                title = title_line.strip()
            
            if "DESCRIPTION:" in metadata_text:
                desc_part = metadata_text.split("DESCRIPTION:")[1]
                if "HASHTAGS:" in desc_part:
                    description = desc_part.split("HASHTAGS:")[0].strip()
                    hashtag_part = desc_part.split("HASHTAGS:")[1]
                    hashtags = hashtag_part.strip()
                else:
                    description = desc_part.strip()
            
            # Clean up hashtags - ensure they start with #
            if hashtags:
                hashtag_list = [tag.strip() for tag in hashtags.split(',') if tag.strip()]
                hashtag_list = [tag if tag.startswith('#') else f'#{tag}' for tag in hashtag_list]
                hashtags = ', '.join(hashtag_list)
            else:
                hashtags = "#news #update"
            
            return {
                "title": title,
                "description": description,
                "hashtags": hashtags
            }
            
        except Exception as e:
            logger.error(f"Error generating publish metadata: {e}")
            # Return basic fallback metadata
            return {
                "title": f"Video from {channel.name if channel else 'Channel'}",
                "description": "New video content",
                "hashtags": "#video"
            }

# Global instance
publishing_pipeline = PublishingPipeline()