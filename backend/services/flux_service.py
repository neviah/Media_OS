# backend/services/flux_service.py
"""
Flux AI Service for image generation
Handles base portrait and reference sheet generation for avatars, B-roll, and thumbnails
"""

import os
import uuid
import logging
from typing import Optional, List
from PIL import Image
import numpy as np
import torch
from diffusers import FluxPipeline

logger = logging.getLogger(__name__)

class FluxService:
    def __init__(self, model_name: str = "blackforestlabs/FLUX.1-schnell", device: Optional[str] = None):
        """
        Initialize Flux service
        
        Args:
            model_name: HuggingFace model identifier for Flux
            device: Device to run on ('cuda', 'cpu'). If None, auto-detect.
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipe = None
        self.is_initialized = False
        
        # Base directory for saving generated images
        self.base_output_dir = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")
        
    def initialize(self):
        """Initialize the Flux model"""
        if self.is_initialized:
            return
        
        try:
            logger.info(f"Loading Flux model {self.model_name} on {self.device}")
            self.pipe = FluxPipeline.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
            )
            self.pipe.to(self.device)
            # Enable memory savings if possible
            if self.device == "cuda":
                self.pipe.enable_attention_slicing()
            self.is_initialized = True
            logger.info("Flux model initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Flux model: {e}")
            raise

    def _ensure_dir(self, directory: str):
        """Ensure directory exists"""
        os.makedirs(directory, exist_ok=True)
        return directory

    def _get_workspace_dir(self, workspace_id: int, subdir: str) -> str:
        """Get the directory for a specific workspace and subdirectory"""
        dir_path = os.path.join(self.base_output_dir, str(workspace_id), subdir)
        self._ensure_dir(dir_path)
        return dir_path

    def generate_avatar_base(self, workspace_id: int, name: str, style_hints: str, channel_type: str) -> str:
        """
        Generate a base portrait for an avatar
        
        Args:
            workspace_id: ID of the workspace
            name: Avatar name
            style_hints: Style description hints
            channel_type: Type of channel (educational, entertainment, etc.)
            
        Returns:
            Relative file path to the generated portrait (from workspace root)
        """
        if not self.is_initialized:
            self.initialize()
            
        try:
            # Construct prompt
            prompt = f"a portrait of {name}, {style_hints}, {channel_type} channel host, high quality, detailed face, professional lighting"
            
            # Generate image
            image = self.pipe(
                prompt,
                height=512,
                width=512,
                num_inference_steps=4 if "schnell" in self.model_name else 50,
                guidance_scale=0.0 if "schnell" in self.model_name else 7.5
            ).images[0]
            
            # Save image
            filename = f"{name.lower().replace(' ', '_')}_base_{uuid.uuid4().hex[:8]}.png"
            workspace_dir = self._get_workspace_dir(workspace_id, "avatars")
            filepath = os.path.join(workspace_dir, filename)
            image.save(filepath)
            
            # Return relative path from workspace root
            relative_path = os.path.join("avatars", filename)
            logger.info(f"Generated avatar base portrait: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error generating avatar base: {e}")
            # Fallback to placeholder
            return self._generate_placeholder_image(workspace_id, "avatars", f"{name}_base.png")

    def generate_avatar_reference_sheet(self, workspace_id: int, base_portrait_path: str, num_views: int = 8) -> str:
        """
        Generate a multi-angle reference sheet from base portrait
        
        Args:
            workspace_id: ID of the workspace
            base_portrait_path: Path to the base portrait image (relative to workspace)
            num_views: Number of angles to generate (typically 6-8)
            
        Returns:
            Relative file path to the generated reference sheet
        """
        if not self.is_initialized:
            self.initialize()
            
        try:
            # Load base portrait
            base_image_path = os.path.join(self.base_output_dir, str(workspace_id), base_portrait_path)
            if not os.path.exists(base_image_path):
                logger.error(f"Base portrait not found: {base_image_path}")
                # Fallback: generate a new base portrait? For now, create placeholder
                return self._generate_placeholder_image(workspace_id, "avatars", "reference_sheet.png")
            
            base_image = Image.open(base_image_path)
            
            # For simplicity, we'll generate different angles by varying the prompt
            # In a more advanced implementation, we could use ControlNet or similar for pose control
            images = [base_image]  # Start with base
            
            # Generate additional views
            for i in range(num_views - 1):
                angle_prompt = f"same person as in the reference image, but from a different angle, view {i+1}, consistent lighting and clothing"
                # We would need img2img for this, but for simplicity we'll just use text-to-image with a descriptive prompt
                # This is a limitation - in production we'd use proper pose control
                try:
                    img = self.pipe(
                        angle_prompt,
                        height=512,
                        width=512,
                        num_inference_steps=4 if "schnell" in self.model_name else 50,
                        guidance_scale=0.0 if "schnell" in self.model_name else 7.5
                    ).images[0]
                    images.append(img)
                except Exception as e:
                    logger.warning(f"Failed to generate view {i+1}: {e}")
                    # Use base image as fallback
                    images.append(base_image.copy())
            
            # Create a sheet (arrange in grid)
            cols = min(4, num_views)
            rows = (num_views + cols - 1) // cols
            sheet_width = cols * 512
            sheet_height = rows * 512
            sheet = Image.new('RGB', (sheet_width, sheet_height), color='white')
            
            for idx, img in enumerate(images[:num_views]):
                x = (idx % cols) * 512
                y = (idx // cols) * 512
                sheet.paste(img.resize((512, 512)), (x, y))
            
            # Save sheet
            filename = f"reference_sheet_{uuid.uuid4().hex[:8]}.png"
            workspace_dir = self._get_workspace_dir(workspace_id, "avatars")
            filepath = os.path.join(workspace_dir, filename)
            sheet.save(filepath)
            
            relative_path = os.path.join("avatars", filename)
            logger.info(f"Generated avatar reference sheet: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error generating avatar reference sheet: {e}")
            return self._generate_placeholder_image(workspace_id, "avatars", "reference_sheet.png")

    def generate_broll(self, workspace_id: int, prompt: str, count: int = 1) -> List[str]:
        """
        Generate B-roll images or short video clips (as images for stub)
        
        Args:
            workspace_id: ID of the workspace
            prompt: Description of the B-roll content
            count: Number of B-roll items to generate
            
        Returns:
            List of relative file paths to the generated B-roll
        """
        if not self.is_initialized:
            self.initialize()
            
        try:
            paths = []
            for i in range(count):
                # Generate image
                image = self.pipe(
                    prompt,
                    height=512,
                    width=512,
                    num_inference_steps=4 if "schnell" in self.model_name else 50,
                    guidance_scale=0.0 if "schnell" in self.model_name else 7.5
                ).images[0]
                
                filename = f"broll_{uuid.uuid4().hex[:8]}_{i}.png"
                workspace_dir = self._get_workspace_dir(workspace_id, "broll")
                filepath = os.path.join(workspace_dir, filename)
                image.save(filepath)
                
                relative_path = os.path.join("broll", filename)
                paths.append(relative_path)
                logger.info(f"Generated B-roll: {relative_path}")
            
            return paths
            
        except Exception as e:
            logger.error(f"Error generating B-roll: {e}")
            # Return placeholder paths
            return [self._generate_placeholder_image(workspace_id, "broll", f"broll_{i}.png") for i in range(count)]

    def generate_thumbnail(self, workspace_id: int, prompt: str) -> str:
        """
        Generate a thumbnail image for a video
        
        Args:
            workspace_id: ID of the workspace
            prompt: Description for the thumbnail
            
        Returns:
            Relative file path to the generated thumbnail
        """
        if not self.is_initialized:
            self.initialize()
            
        try:
            # Thumbnails are often 1280x720 or similar
            image = self.pipe(
                prompt,
                height=720,
                width=1280,
                num_inference_steps=4 if "schnell" in self.model_name else 50,
                guidance_scale=0.0 if "schnell" in self.model_name else 7.5
            ).images[0]
            
            filename = f"thumbnail_{uuid.uuid4().hex[:8]}.png"
            workspace_dir = self._get_workspace_dir(workspace_id, "thumbnails")
            filepath = os.path.join(workspace_dir, filename)
            image.save(filepath)
            
            relative_path = os.path.join("thumbnails", filename)
            logger.info(f"Generated thumbnail: {relative_path}")
            return relative_path
            
        except Exception as e:
            logger.error(f"Error generating thumbnail: {e}")
            return self._generate_placeholder_image(workspace_id, "thumbnails", "thumbnail.png")

    def _generate_placeholder_image(self, workspace_id: int, subdir: str, filename: str) -> str:
        """Generate a placeholder image when real generation fails"""
        try:
            workspace_dir = self._get_workspace_dir(workspace_id, subdir)
            filepath = os.path.join(workspace_dir, filename)
            # Create a simple colored placeholder
            img = Image.new('RGB', (512, 512), color='lightgray')
            img.save(filepath)
            return os.path.join(subdir, filename)
        except Exception as e:
            logger.error(f"Failed to create placeholder image: {e}")
            # Return a dummy path
            return os.path.join(subdir, filename)

# Global instance
flux_service = FluxService()