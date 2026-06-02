# backend/pipelines/metrics.py
"""
Metrics Pipeline
Tracks video performance across social media platforms
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from backend.models.database import Video, Metrics, PublishLog
from backend.database import SessionLocal

logger = logging.getLogger(__name__)

class MetricsPipeline:
    def __init__(self):
        self.db = SessionLocal()
        # In a real implementation, we would initialize platform API clients here
        # using credentials stored in the channel's social_platform_credentials
    
    def collect_metrics(self, video_id: int, platform: str) -> Optional[Metrics]:
        """
        Collect metrics for a video from a specific platform
        
        Args:
            video_id: ID of the video
            platform: Platform to collect metrics from ('youtube', 'tiktok', 'instagram', 'x')
            
        Returns:
            Created Metrics object or None if failed
        """
        try:
            # Get the video
            video = self.db.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.error(f"Video {video_id} not found")
                return None
            
            # Get channel for credentials
            from backend.models.database import Channel
            channel = self.db.query(Channel).filter(Channel.id == video.channel_id).first()
            if not channel:
                logger.error(f"Channel {video.channel_id} not found for video {video_id}")
                return None
            
            # Get the publish log for this video/platform to verify it was published
            publish_log = self.db.query(PublishLog).filter(
                PublishLog.video_id == video_id,
                PublishLog.platform == platform
            ).first()
            
            # In a real implementation, we would:
            # 1. Load platform-specific credentials from channel.social_platform_credentials
            # 2. Initialize the appropriate platform API client
            # 3. Fetch metrics for the video using the post URL from publish_log
            # 4. Extract views, likes, comments, watch time, subscribers, etc.
            # 5. Calculate engagement rate
            # 6. Store metrics snapshot
            
            # For stub, we'll simulate fetching metrics with some realistic-looking data
            import random
            
            # Simulate metrics based on whether the video was actually published
            if publish_log and publish_log.status == 'success':
                # Simulate some realistic metrics
                base_views = random.randint(100, 10000)
                views = base_views + random.randint(0, base_views // 2)  # Some growth
                likes = int(views * random.uniform(0.02, 0.08))  # 2-8% like rate
                comments = int(views * random.uniform(0.005, 0.03))  # 0.5-3% comment rate
                watch_time = int(views * random.randint(15, 60))  # 15-60 seconds avg watch time
                subscribers_gained = int(views * random.uniform(0.001, 0.01))  # 0.1-1% sub rate
                engagement_rate = (likes + comments) / views if views > 0 else 0
            else:
                # Not published or failed - zero metrics
                views = likes = comments = watch_time = subscribers_gained = 0
                engagement_rate = 0.0
            
            # Create metrics record
            metrics = models.Metrics(
                workspace_id=video.workspace_id,
                channel_id=video.channel_id,
                video_id=video.id,
                platform=platform,
                views=views,
                likes=likes,
                comments=comments,
                watch_time=watch_time,
                subscribers_gained=subscribers_gained,
                engagement_rate=engagement_rate,
                snapshot_date=datetime.utcnow()
            )
            
            self.db.add(metrics)
            self.db.commit()
            self.db.refresh(metrics)
            
            logger.info(f"Collected metrics for video {video_id} on {platform}: {views} views")
            return metrics
            
        except Exception as e:
            logger.error(f"Error collecting metrics for video {video_id} on {platform}: {e}")
            self.db.rollback()
            return None
        finally:
            self.db.close()
    
    def collect_all_platform_metrics(self, video_id: int) -> list:
        """
        Collect metrics for a video from all platforms it was published to
        
        Args:
            video_id: ID of the video
            
        Returns:
            List of created Metrics objects
        """
        try:
            # Get all publish logs for this video
            publish_logs = self.db.query(PublishLog).filter(
                PublishLog.video_id == video_id
            ).all()
            
            metrics_list = []
            for log in publish_logs:
                if log.status == 'success':  # Only collect from successful publishes
                    metrics = self.collect_metrics(video_id, log.platform)
                    if metrics:
                        metrics_list.append(metrics)
            
            return metrics_list
            
        except Exception as e:
            logger.error(f"Error collecting all platform metrics for video {video_id}: {e}")
            return []
    
    def get_latest_metrics(self, video_id: int, platform: str) -> Optional[Metrics]:
        """
        Get the latest metrics snapshot for a video on a platform
        
        Args:
            video_id: ID of the video
            platform: Platform to check
            
        Returns:
            Latest Metrics object or None if not found
        """
        try:
            metrics = self.db.query(Metrics).filter(
                Metrics.video_id == video_id,
                Metrics.platform == platform
            ).order_by(Metrics.snapshot_date.desc()).first()
            
            return metrics
        except Exception as e:
            logger.error(f"Error getting latest metrics for video {video_id} on {platform}: {e}")
            return None

# Global instance
metrics_pipeline = MetricsPipeline()