# backend/schemas/script.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ScriptBase(BaseModel):
    title: str
    content: str
    summary: Optional[str] = None
    hashtags: Optional[str] = None  # Comma-separated hashtags
    is_validated: Optional[bool] = False
    validation_notes: Optional[str] = None

class ScriptCreate(ScriptBase):
    workspace_id: int
    channel_id: int
    news_source_id: Optional[int] = None

class ScriptUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    hashtags: Optional[str] = None
    is_validated: Optional[bool] = None
    validation_notes: Optional[str] = None

class ScriptResponse(ScriptBase):
    id: int
    workspace_id: int
    channel_id: int
    news_source_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)