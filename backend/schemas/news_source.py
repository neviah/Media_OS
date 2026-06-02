# backend/schemas/news_source.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class NewsSourceBase(BaseModel):
    name: str
    source_url: str
    keywords: Optional[str] = None  # Comma-separated keywords
    pull_interval: Optional[int] = None  # in minutes
    last_pulled: Optional[datetime] = None
    is_active: Optional[bool] = True

class NewsSourceCreate(NewsSourceBase):
    workspace_id: int

class NewsSourceUpdate(BaseModel):
    name: Optional[str] = None
    source_url: Optional[str] = None
    keywords: Optional[str] = None
    pull_interval: Optional[int] = None
    last_pulled: Optional[datetime] = None
    is_active: Optional[bool] = None

class NewsSourceResponse(NewsSourceBase):
    id: int
    workspace_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)