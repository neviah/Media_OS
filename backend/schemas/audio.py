# backend/schemas/audio.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class AudioBase(BaseModel):
    file_path: str
    voice_profile_id: Optional[str] = None  # Reference to OpenVoice profile
    duration: Optional[float] = None  # in seconds
    sample_rate: Optional[int] = None
    is_normalized: Optional[bool] = False

class AudioCreate(AudioBase):
    workspace_id: int
    channel_id: int
    script_id: int

class AudioUpdate(BaseModel):
    file_path: Optional[str] = None
    voice_profile_id: Optional[str] = None
    duration: Optional[float] = None
    sample_rate: Optional[int] = None
    is_normalized: Optional[bool] = None

class AudioResponse(AudioBase):
    id: int
    workspace_id: int
    channel_id: int
    script_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)