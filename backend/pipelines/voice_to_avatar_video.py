# backend/pipelines/voice_to_avatar_video.py
"""
Voice to Avatar Video Pipeline
Creates talking-head video from audio using LivePortrait and avatar image
"""

import logging
from typing import Optional

from backend.models.database import Audio, Video, Avatar
from backend.services.liveportrait_service import liveportrait_service
from backend.database import SessionLocal
from backend import models

logger = logging.getLogger(__name__)

class VoiceToAvatarVideoPipeline:
    def __init__(self):
        self.db = SessionLocal()
    
    def process_voice_to_avatar_video(self, audio_id: int) -> Optional[Video]:
        """
        Create talking-head video from audio using LivePortrait
        
        Args:
            audio_id: ID of the audio to use for lip-sync
            
        Returns:
            Created Video object or None if failed
        """
        try:
            # Get the audio
            audio = self.db.query(Audio).filter(Audio.id == audio_id).first()
            if not audio:
                logger.error(f"Audio {audio_id} not found")
                return None
            
            # Get channel to get avatar
            from backend.models.database import Channel
            channel = self.db.query(Channel).filter(Channel.id == audio.channel_id).first()
            if not channel:
                logger.error(f"Channel {audio.channel_id} not found for audio {audio_id}")
                return None
            
            avatar = self.db.query(Avatar).filter(Avatar.id == channel.avatar_id).first()
            if not avatar:
                logger.error(f"Avatar {channel.avatar_id} not found for channel {channel.id}")
                return None
            
            # Get avatar's base portrait or reference image
            # In a real implementation, we might use the reference sheet or a specific frame
            avatar_image_path = avatar.base_portrait_path or avatar.reference_sheet_path
            if not avatar_image_path:
                logger.error(f"No avatar image available for avatar {avatar.id}")
                return None
            
            # Generate talking-head video using the real LivePortrait service
            avatar_video_path = liveportrait_service.animate(
                workspace_id=audio.workspace_id,
                avatar_image_path=avatar_image_path,
                audio_path=audio.file_path
            )
            
            # Create video record (just the talking-head portion for now)
            new_video = models.Video(
                workspace_id=audio.workspace_id,
                channel_id=audio.channel_id,
                avatar_id=avatar.id,
                audio_id=audio.id,
                avatar_video_path=avatar_video_path,
                # final_video_path will be filled in by video assembly pipeline
                is_approved=False  # Will be reviewed after assembly
            )
            
            self.db.add(new_video)
            self.db.commit()
            self.db.refresh(new_video)
            
            logger.info(f"Created talking-head video {new_video.id} from audio {audio_id}")
            return new_video
            
        except Exception as e:
            logger.error(f"Error in voice to avatar video pipeline: {e}")
            self.db.rollback()
            return None
        finally:
            self.db.close()

# Global instance
voice_to_avatar_video_pipeline = VoiceToAvatarVideoPipeline()