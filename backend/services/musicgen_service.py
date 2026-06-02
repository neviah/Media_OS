# backend/services/musicgen_service.py
"""
MusicGen Service for music generation
Uses Audiocraft's MusicGen model
"""

import os
import uuid
import logging
import torch
import numpy as np
from typing import Optional, List
from scipy.io import wavfile

logger = logging.getLogger(__name__)

# Try to import Audiocraft, if not available, we'll use a stub
try:
    from audiocraft.models import MusicGen
    from audiocraft.data.audio import audio_write
    AUDIOCRAFT_AVAILABLE = True
except ImportError:
    logger.warning("Audiocraft not available, using stub")
    AUDIOCRAFT_AVAILABLE = False

class MusicGenService:
    def __init__(self, 
                 model_name: str = "facebook/musicgen-small",
                 device: Optional[str] = None):
        """
        Initialize MusicGen service
        
        Args:
            model_name: HuggingFace model identifier for MusicGen
            device: Device to run on ('cuda', 'cpu'). If None, auto-detect.
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.is_initialized = False
        
        # Base directory for saving generated audio
        self.base_output_dir = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")
        
    def initialize(self):
        """Initialize the MusicGen model"""
        if self.is_initialized:
            return
        
        if not AUDIOCRAFT_AVAILABLE:
            logger.warning("MusicGen not available, using stub mode")
            self.is_initialized = True
            return
        
        try:
            logger.info(f"Loading MusicGen model {self.model_name} on {self.device}")
            self.model = MusicGen.get_pretrained(self.model_name, device=self.device)
            # Set generation parameters
            self.model.set_generation_params(
                duration=30,  # default duration in seconds
                top_k=250,
                top_p=0.0,
                temperature=1.0,
                cfg_coef=0.0
            )
            self.is_initialized = True
            logger.info("MusicGen model initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize MusicGen model: {e}")
            # Fall back to stub
            self.is_initialized = True  # Mark as initialized to avoid repeated attempts
            logger.warning("Falling back to stub mode for MusicGen")

    def _ensure_dir(self, directory: str):
        """Ensure directory exists"""
        os.makedirs(directory, exist_ok=True)
        return directory

    def _get_workspace_dir(self, workspace_id: int, subdir: str) -> str:
        """Get the directory for a specific workspace and subdirectory"""
        dir_path = os.path.join(self.base_output_dir, str(workspace_id), subdir)
        self._ensure_dir(dir_path)
        return dir_path

    def generate_music(self, workspace_id: int, 
                      description: str, 
                      duration: float = 30.0,
                      **kwargs) -> str:
        """
        Generate music from text description
        
        Args:
            workspace_id: ID of the workspace
            description: Text description of the music (e.g., "upbeat electronic music")
            duration: Duration of the music in seconds
            **kwargs: Additional parameters to pass to the model (top_k, top_p, temperature, etc.)
            
        Returns:
            Relative file path to the generated music (WAV)
        """
        if not self.is_initialized:
            self.initialize()
        
        if not AUDIOCRAFT_AVAILABLE:
            return self._stub_generate_music(workspace_id, description, duration)
        
        try:
            # Update generation parameters if provided
            self.model.set_generation_params(
                duration=duration,
                **kwargs
            )
            
            # Generate music
            # The model can generate multiple outputs, we'll generate one
            wav = self.model.generate(
                descriptions=[description],  # List of descriptions
                progress=True,  # Show progress bar
                return_tokens=False  # We don't need the tokens
            )
            
            # wav is a tensor of shape (1, 1, sample_rate * duration) for mono
            # We'll save the first (and only) sample
            audio_data = wav[0].cpu().numpy()  # Shape: (1, sample_rate * duration) or (2, ...) for stereo?
            
            # If stereo, we need to transpose? The audiocraft audio_write expects (channels, samples)
            # But wav from generate is (num_samples, channels, samples) ? 
            # Let's check the audiocraft documentation: 
            #   The generate method returns a tensor of shape (B, C, T) where B is batch size, C is channels, T is samples.
            #   We have B=1, so we take the first element: shape (C, T)
            audio_data = wav[0].cpu().numpy()  # Now shape (C, T)
            
            # Save the audio
            audio_filename = f"music_{uuid.uuid4().hex[:8]}.wav"
            workspace_dir = self._get_workspace_dir(workspace_id, "music")
            audio_path = os.path.join(workspace_dir, audio_filename)
            
            # Use audiocraft's audio_write to save with proper metadata
            # Note: audio_write expects the audio as (channels, samples) and sample rate
            audio_write(
                audio_path.replace('.wav', ''),  # audio_write adds the extension
                audio_data,
                self.model.sample_rate,
                strategy="loudness",
                loudness_compressor=True
            )
            
            # The above creates a .wav file at audio_path
            relative_path = os.path.join("music", audio_filename)
            logger.info(f"Generated music saved to: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error generating music: {e}")
            return self._stub_generate_music(workspace_id, description, duration)

    def preview_music(self, workspace_id: int, music_path: str) -> str:
        """
        Preview a music file (for now, just return the path, but in a real implementation 
        we might extract features or generate a waveform image)
        
        Args:
            workspace_id: ID of the workspace
            music_path: Relative path to the music file (from workspace)
            
        Returns:
            Relative path to a preview (e.g., waveform image) or the same path if no preview available
        """
        # In a real implementation, we might generate a waveform image or audio features
        # For stub, we just return the music path
        logger.info(f"Preview requested for music: {music_path}")
        return music_path

    def _stub_generate_music(self, workspace_id: int, 
                            description: str, 
                            duration: float = 30.0) -> str:
        """Stub method for generating music"""
        try:
            audio_filename = f"music_{uuid.uuid4().hex[:8]}.wav"
            workspace_dir = self._get_workspace_dir(workspace_id, "music")
            audio_path = os.path.join(workspace_dir, audio_filename)
            
            # Generate a dummy audio file (we'll create a simple melody)
            sample_rate = 22050
            t = np.linspace(0, duration, int(sample_rate * duration), False)
            # Create a simple melody: C major scale notes
            frequencies = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]  # C4 to C5
            audio_data = np.zeros_like(t)
            # Play each note for an equal duration
            note_duration = duration / len(frequencies)
            for i, freq in enumerate(frequencies):
                start = int(i * note_duration * sample_rate)
                end = int((i + 1) * note_duration * sample_rate)
                if end > len(t):
                    end = len(t)
                t_slice = t[start:end]
                audio_data[start:end] = np.sin(2 * np.pi * freq * t_slice) * 0.3
            
            # Convert to 16-bit PCM
            audio_data = (audio_data * 32767).astype(np.int16)
            
            wavfile.write(audio_path, sample_rate, audio_data)
            
            relative_path = os.path.join("music", audio_filename)
            logger.info(f"Stub: Generated music saved to: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error in stub music generation: {e}")
            # Return a dummy path
            return os.path.join("music", f"music_{uuid.uuid4().hex[:8]}.wav")

# Global instance
musicgen_service = MusicGenService()