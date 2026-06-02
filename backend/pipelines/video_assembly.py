# backend/pipelines/video_assembly.py
"""
Video Assembly Pipeline
Combines talking-head video, music, B-roll, and captions into final video
"""

import logging
from typing import Optional, List
import json

from backend.models.database import Video, Audio, Music, Script
from backend.services.video_assembly_service import video_assembly_service
from backend.services.music_service import music_service
from backend.services.flux_service import flux_service
from backend.database import SessionLocal
from backend import models

logger = logging.getLogger(__name__)

class VideoAssemblyPipeline:
    def __init__(self):
        self.db = SessionLocal()
    
    def process_video_assembly(self, video_id: int, 
                             music_id: Optional[int] = None,
                             b_roll_prompts: Optional[List[str]] = None) -> Optional[Video]:
        """
        Assemble final video from talking-head video, music, B-roll, and captions
        
        Args:
            video_id: ID of the video (containing talking-head and audio)
            music_id: Optional ID of music track to add
            b_roll_prompts: Optional list of prompts for generating B-roll
            
        Returns:
            Updated Video object with final_video_path set or None if failed
        """
        try:
            # Get the video
            video = self.db.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.error(f"Video {video_id} not found")
                return None
            
            # Get audio to confirm we have narration
            audio = self.db.query(Audio).filter(Audio.id == video.audio_id).first()
            if not audio:
                logger.error(f"Audio {video.audio_id} not found for video {video_id}")
                return None
            
            # Process music if specified
            music_file_path = None
            if music_id:
                music = self.db.query(Music).filter(Music.id == music_id).first()
                if music and music.is_approved:
                    music_file_path = music.file_path
                else:
                    logger.warning(f"Music {music_id} not found or not approved")
            
            # Generate B-roll if prompts provided
            b_roll_paths = []
            if b_roll_prompts:
                # Use the flux service to generate B-roll images
                # We'll use the workspace_id from the video
                workspace_id = video.workspace_id
                b_roll_paths = flux_service.generate_broll(
                    workspace_id=workspace_id,
                    prompt=", ".join(b_roll_prompts),
                    count=len(b_roll_prompts)
                )
            
            # Generate captions from audio (using speech-to-text or from script)
            # In a real implementation:
            # 1. Use speech-to-text on audio file OR
            # 2. Extract text from associated script
            # 3. Format as captions (SRT/VTT)
            captions = self._generate_captions_from_audio(audio.id)
            
            # Step 1: Combine avatar video, audio, music, and B-roll
            combined_video_path = video_assembly_service.combine_avatar_music_broll(
                workspace_id=video.workspace_id,
                avatar_video_path=video.avatar_video_path,
                audio_path=audio.file_path,
                music_path=music_file_path,
                broll_paths=b_roll_paths,
                music_volume=0.3  # Background music at 30% volume
            )
            
            # Step 2: Add captions
            captioned_video_path = video_assembly_service.add_captions(
                workspace_id=video.workspace_id,
                video_path=combined_video_path,
                captions=captions
            )
            
            # Step 3: Render final video
            final_video_path = video_assembly_service.render_final_video(
                workspace_id=video.workspace_id,
                combined_video_path=captioned_video_path,
                output_name=f"final_{video.id}"
            )
            
            # Update video record
            video.music_id = music_id
            video.b_roll_paths = json.dumps(b_roll_paths) if b_roll_paths else None
            video.captions = captions
            video.final_video_path = final_video_path
            # Note: is_approved would be set after review, not automatically
            
            self.db.commit()
            self.db.refresh(video)
            
            logger.info(f"Assembled final video {video_id} -> {final_video_path}")
            return video
            
        except Exception as e:
            logger.error(f"Error in video assembly pipeline: {e}")
            self.db.rollback()
            return None
    
    def _generate_captions_from_audio(self, audio_id: int) -> str:
        """
        Generate captions from audio file
        
        Args:
            audio_id: ID of the audio file
            
        Returns:
            Caption text (in a real implementation, this would be SRT/VTT format)
        """
        try:
            # Get audio and its associated script
            audio = self.db.query(Audio).filter(Audio.id == audio_id).first()
            if not audio:
                return ""
            
            script = self.db.query(Script).filter(Script.id == audio.script_id).first()
            if script and script.content:
                # In a real implementation, we would:
                # 1. Use speech-to-time alignment to create proper timestamps
                # 2. Format as SRT or VTT
                # For now, we'll just return the script content as placeholder captions
                # In a future improvement, we could use a speech-to-text model like Whisper
                return script.content
            return ""
        except Exception as e:
            logger.error(f"Error generating captions: {e}")
            return ""

# Global instance
video_assembly_pipeline = VideoAssemblyPipeline()