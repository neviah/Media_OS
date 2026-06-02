# backend/schemas/publish_log.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class PublishLogBase(BaseModel):
    platform: str  # e.g., 'youtube', 'tiktok'
    post_url: Optional[str] = None
    status: Optional[str] = 'pending'  # pending, success, failed
    error_message: Optional[str] = None
    published_at: Optional[datetime] = None

class PublishLogCreate(PublishLogBase):
    workspace_id: int
    channel_id: int
    video_id: int

class PublishLogUpdate(BaseModel):
    platform: Optional[str] = None
    post_url: Optional[str] = None
    status: Optional[str] = None
    error_message: Optional[str] = None
    published_at: Optional[datetime] = None

class PublishLogResponse(PublishLogBase):
    id: int
    workspace_id: int
    channel_id: int
    video_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)