# backend/pipelines/script_to_voice.py
"""
Script to Voice Pipeline
Converts scripts to narration audio using OpenVoice
"""

import logging
from typing import Optional

from backend.models.database import Script, Audio
from backend.services.openvoice_service import openvoice_service
from backend.database import SessionLocal
from backend import models

logger = logging.getLogger(__name__)

class ScriptToVoicePipeline:
    def __init__(self):
        self.db = SessionLocal()
    
    def process_script_to_voice(self, script_id: int) -> Optional[Audio]:
        """
        Convert a script to narration audio using OpenVoice
        
        Args:
            script_id: ID of the script to convert
            
        Returns:
            Created Audio object or None if failed
        """
        try:
            # Get the script
            script = self.db.query(Script).filter(Script.id == script_id).first()
            if not script:
                logger.error(f"Script {script_id} not found")
                return None
            
            # Get channel to get avatar's voice profile
            from backend.models.database import Channel, Avatar
            channel = self.db.query(Channel).filter(Channel.id == script.channel_id).first()
            if not channel:
                logger.error(f"Channel {script.channel_id} not found for script {script_id}")
                return None
            
            avatar = self.db.query(Avatar).filter(Avatar.id == channel.avatar_id).first()
            if not avatar:
                logger.error(f"Avatar {channel.avatar_id} not found for channel {channel.id}")
                return None
            
            voice_profile_path = avatar.voice_profile_id  # This is now a path to the voice profile
            if not voice_profile_path:
                logger.error(f"No voice profile ID for avatar {avatar.id}")
                return None
            
            # Generate audio from script content using the real OpenVoice service
            audio_file_path = openvoice_service.synthesize(
                workspace_id=script.workspace_id,
                text=script.content,
                voice_profile_path=voice_profile_path
            )
            
            # Normalize the audio
            normalized_audio_path = openvoice_service.normalize_audio(
                workspace_id=script.workspace_id,
                audio_path=audio_file_path
            )
            
            # Create audio record
            new_audio = models.Audio(
                workspace_id=script.workspace_id,
                channel_id=script.channel_id,
                script_id=script.id,
                file_path=normalized_audio_path,
                voice_profile_id=voice_profile_path,  # Store the voice profile path
                is_normalized=True  # Since we normalized it
            )
            
            # In a real implementation, we would:
            # 1. Get actual duration from the audio file
            # 2. Get sample rate
            # For now, we'll use placeholder values that could be improved
            # We could use librosa or similar to get actual duration, but for now:
            new_audio.duration = 60.0  # Placeholder - we should get this from the audio file
            new_audio.sample_rate = 22050  # Placeholder
            
            self.db.add(new_audio)
            self.db.commit()
            self.db.refresh(new_audio)
            
            logger.info(f"Created audio {new_audio.id} from script {script_id}")
            return new_audio
            
        except Exception as e:
            logger.error(f"Error in script to voice pipeline: {e}")
            self.db.rollback()
            return None
        finally:
            self.db.close()

# Global instance
script_to_voice_pipeline = ScriptToVoicePipeline()