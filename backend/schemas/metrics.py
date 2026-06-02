# backend/schemas/metrics.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class MetricsBase(BaseModel):
    platform: str  # e.g., 'youtube', 'tiktok'
    views: Optional[int] = 0
    likes: Optional[int] = 0
    comments: Optional[int] = 0
    watch_time: Optional[int] = 0  # in seconds
    subscribers_gained: Optional[int] = 0
    engagement_rate: Optional[float] = 0.0
    snapshot_date: Optional[datetime] = None

class MetricsCreate(MetricsBase):
    workspace_id: int
    channel_id: int
    video_id: int

class MetricsUpdate(BaseModel):
    platform: Optional[str] = None
    views: Optional[int] = None
    likes: Optional[int] = None
    comments: Optional[int] = None
    watch_time: Optional[int] = None
    subscribers_gained: Optional[int] = None
    engagement_rate: Optional[float] = None
    snapshot_date: Optional[datetime] = None

class MetricsResponse(MetricsBase):
    id: int
    workspace_id: int
    channel_id: int
    video_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)