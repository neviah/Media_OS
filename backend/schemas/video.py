# backend/schemas/video.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class VideoBase(BaseModel):
    avatar_video_path: Optional[str] = None  # Talking-head video from LivePortrait
    final_video_path: str  # After assembly with music, B-roll, captions
    b_roll_paths: Optional[str] = None  # JSON string of paths
    captions: Optional[str] = None  # Generated captions
    duration: Optional[float] = None  # in seconds
    is_approved: Optional[bool] = False

class VideoCreate(VideoBase):
    workspace_id: int
    channel_id: int
    avatar_id: Optional[int] = None
    audio_id: int
    music_id: Optional[int] = None

class VideoUpdate(BaseModel):
    avatar_video_path: Optional[str] = None
    final_video_path: Optional[str] = None
    b_roll_paths: Optional[str] = None
    captions: Optional[str] = None
    duration: Optional[float] = None
    is_approved: Optional[bool] = None

class VideoResponse(VideoBase):
    id: int
    workspace_id: int
    channel_id: int
    avatar_id: Optional[int] = None
    audio_id: int
    music_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)