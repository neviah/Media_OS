# backend/schemas/music.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class MusicBase(BaseModel):
    title: str
    file_path: str
    tags: Optional[str] = None  # Comma-separated tags
    mood: Optional[str] = None
    duration: Optional[float] = None  # in seconds
    is_approved: Optional[bool] = False
    generated_by: Optional[str] = None  # e.g., 'MusicGen'

class MusicCreate(MusicBase):
    workspace_id: int

class MusicUpdate(BaseModel):
    title: Optional[str] = None
    file_path: Optional[str] = None
    tags: Optional[str] = None
    mood: Optional[str] = None
    duration: Optional[float] = None
    is_approved: Optional[bool] = None
    generated_by: Optional[str] = None

class MusicResponse(MusicBase):
    id: int
    workspace_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)