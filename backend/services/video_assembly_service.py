# backend/services/video_assembly_service.py
"""
Video Assembly Service using FFmpeg + MoviePy
Combines talking-head video, music, B-roll, and captions into final video
"""

import os
import uuid
import logging
import json
from typing import Optional, List
from moviepy.editor import VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip, TextClip, concatenate_videoclips
import numpy as np

logger = logging.getLogger(__name__)

class VideoAssemblyService:
    def __init__(self):
        """
        Initialize Video Assembly service
        """
        # Base directory for saving generated videos
        self.base_output_dir = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")
        
        # Check if FFmpeg is accessible (MoviePy uses it)
        try:
            # This will raise an exception if FFmpeg is not found
            from moviepy.config import get_setting
            get_setting("FFMPEG_BINARY")
            logger.info("FFmpeg is available for MoviePy")
        except Exception as e:
            logger.warning(f"FFmpeg may not be properly configured: {e}")
            # We'll still try to proceed - MoviePy might have its own fallback

    def _ensure_dir(self, directory: str):
        """Ensure directory exists"""
        os.makedirs(directory, exist_ok=True)
        return directory

    def _get_workspace_dir(self, workspace_id: int, subdir: str) -> str:
        """Get the directory for a specific workspace and subdirectory"""
        dir_path = os.path.join(self.base_output_dir, str(workspace_id), subdir)
        self._ensure_dir(dir_path)
        return dir_path

    def combine_avatar_music_broll(self, workspace_id: int,
                                  avatar_video_path: str,
                                  audio_path: str,
                                  music_path: Optional[str] = None,
                                  broll_paths: Optional[List[str]] = None,
                                  music_volume: float = 0.3) -> str:
        """
        Combine avatar video, audio, music, and B-roll
        
        Args:
            workspace_id: ID of the workspace
            avatar_video_path: Path to the talking-head video (relative to workspace)
            audio_path: Path to the narration audio (relative to workspace)
            music_path: Optional path to background music (relative to workspace)
            broll_paths: Optional list of paths to B-roll videos/images (relative to workspace)
            music_volume: Volume level for background music (0.0 to 1.0)
            
        Returns:
            Relative file path to the combined video (without captions yet)
        """
        try:
            # Load the main components
            avatar_video_full = os.path.join(self.base_output_dir, str(workspace_id), avatar_video_path)
            audio_full = os.path.join(self.base_output_dir, str(workspace_id), audio_path)
            
            if not os.path.exists(avatar_video_full):
                logger.error(f"Avatar video not found: {avatar_video_full}")
                return avatar_video_path  # fallback
            
            if not os.path.exists(audio_full):
                logger.error(f"Audio not found: {audio_full}")
                return avatar_video_path  # fallback
            
            # Load the avatar video and audio
            video_clip = VideoFileClip(avatar_video_full)
            audio_clip = AudioFileClip(audio_full)
            
            # Ensure the video has the audio (replace or set audio)
            # The avatar video from LivePortrait might not have audio, so we set it
            final_video = video_clip.set_audio(audio_clip)
            
            # Prepare list of video clips to composite
            clips_to_composite = [final_video]  # Start with the main video
            
            # Add music if provided
            if music_path:
                music_full = os.path.join(self.base_output_dir, str(workspace_id), music_path)
                if os.path.exists(music_full):
                    try:
                        music_clip = AudioFileClip(music_full)
                        # Adjust music volume
                        music_clip = music_clip.volumex(music_volume)
                        # Set the audio to be the mix of original audio and music
                        # We'll mix the audio tracks
                        mixed_audio = audio_clip.volumex(1.0 - music_volume) + music_clip.volumex(music_volume)
                        final_video = final_video.set_audio(mixed_audio)
                        logger.info(f"Added background music: {music_path}")
                    except Exception as e:
                        logger.error(f"Error adding music: {e}")
                else:
                    logger.warning(f"Music file not found: {music_full}")
            
            # Add B-roll if provided
            if broll_paths:
                # For simplicity, we'll overlay B-roll at the beginning or at intervals
                # In a more advanced implementation, we would place B-roll at specific timestamps
                # based on content analysis
                
                # We'll add B-roll clips as overlays at the start for now
                # Each B-roll item could be a video or image
                for i, broll_path in enumerate(broll_paths):
                    broll_full = os.path.join(self.base_output_dir, str(workspace_id), broll_path)
                    if not os.path.exists(broll_full):
                        logger.warning(f"B-roll file not found: {broll_full}")
                        continue
                    
                    try:
                        # Check if it's an image or video
                        if broll_path.lower().endswith(('.png', '.jpg', '.jpeg')):
                            # It's an image - show it for a few seconds at the start
                            image_clip = ImageClip(broll_full, duration=min(5, video_clip.duration))
                            # Position it in the center, possibly scaled
                            image_clip = image_clip.set_pos('center').resize(height=video_clip.h * 0.8)
                            clips_to_composite.append(image_clip)
                            logger.info(f"Added image B-roll: {broll_path}")
                        else:
                            # It's a video
                            broll_clip = VideoFileClip(broll_full)
                            # We might want to trim or loop it to fit
                            # For simplicity, we'll use it as-is or trim to video duration
                            if broll_clip.duration > video_clip.duration:
                                broll_clip = broll_clip.subclip(0, video_clip.duration)
                            else:
                                # Loop it if needed (simplified)
                                pass
                            # Overlay it at the start
                            broll_clip = broll_clip.set_pos('center').resize(height=video_clip.h * 0.8)
                            clips_to_composite.append(broll_clip)
                            logger.info(f"Added video B-roll: {broll_path}")
                    except Exception as e:
                        logger.error(f"Error processing B-roll {broll_path}: {e}")
            
            # Composite all video clips
            if len(clips_to_composite) > 1:
                # Use CompositeVideoClip to overlay
                final_video = CompositeVideoClip(clips_to_composite, size=video_clip.size)
            # else, final_video remains as is
            
            # Ensure the duration matches the audio
            if final_video.duration < audio_clip.duration:
                # If video is shorter than audio, we might want to loop or extend
                # For simplicity, we'll just use the audio duration
                final_video = final_video.set_duration(audio_clip.duration)
            elif audio_clip.duration < final_video.duration:
                # If audio is shorter, trim video to audio length
                final_video = final_video.subclip(0, audio_clip.duration)
            
            # Write the result to a temporary file
            temp_filename = f"temp_combined_{uuid.uuid4().hex[:8]}.mp4"
            workspace_dir = self._get_workspace_dir(workspace_id, "temp")
            temp_path = os.path.join(workspace_dir, temp_filename)
            
            # Write the video
            final_video.write_videofile(
                temp_path,
                codec='libx264',
                audio_codec='aac',
                temp_audiofile=os.path.join(workspace_dir, f"temp_audio_{uuid.uuid4().hex[:8]}.m4a"),
                remove_temp=True,
                fps=video_clip.fps,
                preset='medium',
                ffmpeg_params=['-crf', '23']  # Good quality
            )
            
            # Close clips to free resources
            video_clip.close()
            audio_clip.close()
            final_video.close()
            
            # Return the relative path
            relative_path = os.path.join("temp", temp_filename)
            logger.info(f"Combined video saved to: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error in combine_avatar_music_broll: {e}")
            # Fallback to just returning the avatar video path
            return avatar_video_path

    def add_captions(self, workspace_id: int,
                    video_path: str,
                    captions: str,
                    caption_style: Optional[dict] = None) -> str:
        """
        Add captions to a video
        
        Args:
            workspace_id: ID of the workspace
            video_path: Path to the video (relative to workspace)
            captions: Caption text (in a real implementation, this would be timed subtitles)
            caption_style: Optional dictionary for styling (font, color, size, etc.)
            
        Returns:
            Relative file path to the video with captions
        """
        try:
            video_full = os.path.join(self.base_output_dir, str(workspace_id), video_path)
            if not os.path.exists(video_full):
                logger.error(f"Video not found: {video_full}")
                return video_path  # fallback
            
            # Load the video
            video_clip = VideoFileClip(video_full)
            
            # Set default caption style
            default_style = {
                'font': 'Arial',
                'color': 'white',
                'fontsize': 24,
                'stroke_color': 'black',
                'stroke_width': 1,
                'method': 'caption',
                'align': 'center'
            }
            if caption_style:
                default_style.update(caption_style)
            
            # For simplicity, we'll add the entire caption text as a single text clip
            # In a real implementation, we would parse timed captions (SRT/VTT) and
            # add text clips at specific times
            
            # Create a text clip
            # We'll make it appear for the duration of the video at the bottom
            txt_clip = TextClip(captions, **default_style)
            # Position at bottom
            txt_clip = txt_clip.set_pos(('center', 'bottom')).set_duration(video_clip.duration)
            
            # Composite the video and text
            final_video = CompositeVideoClip([video_clip, txt_clip])
            
            # Write the result
            output_filename = f"captioned_{uuid.uuid4().hex[:8]}.mp4"
            workspace_dir = self._get_workspace_dir(workspace_id, "processed")
            output_path = os.path.join(workspace_dir, output_filename)
            
            final_video.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                temp_audiofile=os.path.join(workspace_dir, f"temp_audio_{uuid.uuid4().hex[:8]}.m4a"),
                remove_temp=True,
                fps=video_clip.fps,
                preset='medium',
                ffmpeg_params=['-crf', '23']
            )
            
            # Close clips
            video_clip.close()
            final_video.close()
            
            # Return relative path
            relative_path = os.path.join("processed", output_filename)
            logger.info(f"Added captions to video: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error adding captions: {e}")
            return video_path  # fallback to original

    def render_final_video(self, workspace_id: int,
                          combined_video_path: str,
                          output_name: str = "final_video") -> str:
        """
        Render the final video (this is essentially just copying/moving the processed video
        to a final location with a proper name)
        
        Args:
            workspace_id: ID of the workspace
            combined_video_path: Path to the combined video (with captions, etc.) (relative to workspace)
            output_name: Base name for the output file
            
        Returns:
            Relative file path to the final video
        """
        try:
            input_full = os.path.join(self.base_output_dir, str(workspace_id), combined_video_path)
            if not os.path.exists(input_full):
                logger.error(f"Combined video not found: {input_full}")
                return combined_video_path  # fallback
            
            # Generate output filename
            output_filename = f"{output_name}_{uuid.uuid4().hex[:8]}.mp4"
            workspace_dir = self._get_workspace_dir(workspace_id, "final")
            output_path = os.path.join(workspace_dir, output_filename)
            
            # Simply copy the file (in a real implementation, we might do a final encode pass)
            import shutil
            shutil.copy2(input_full, output_path)
            
            # Return relative path
            relative_path = os.path.join("final", output_filename)
            logger.info(f"Rendered final video: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error rendering final video: {e}")
            return combined_video_path  # fallback

# Global instance
video_assembly_service = VideoAssemblyService()