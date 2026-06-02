# backend/schemas/channel.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ChannelBase(BaseModel):
    name: str
    script_style_preset: Optional[str] = None
    music_policy: Optional[str] = None
    social_platform_credentials: Optional[str] = None  # JSON string
    posting_schedule: Optional[str] = None  # Cron expression or similar
    branding_colors: Optional[str] = None  # JSON string
    intro_outro_paths: Optional[str] = None  # JSON string for paths
    is_active: Optional[bool] = True

class ChannelCreate(ChannelBase):
    workspace_id: int
    avatar_id: int

class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    script_style_preset: Optional[str] = None
    music_policy: Optional[str] = None
    social_platform_credentials: Optional[str] = None
    posting_schedule: Optional[str] = None
    branding_colors: Optional[str] = None
    intro_outro_paths: Optional[str] = None
    is_active: Optional[bool] = None

class ChannelResponse(ChannelBase):
    id: int
    workspace_id: int
    avatar_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)