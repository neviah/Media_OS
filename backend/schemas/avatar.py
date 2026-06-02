# backend/schemas/avatar.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class AvatarBase(BaseModel):
    name: str
    style_hints: Optional[str] = None
    channel_type: Optional[str] = None
    base_portrait_path: Optional[str] = None
    reference_sheet_path: Optional[str] = None
    voice_profile_id: Optional[str] = None

class AvatarCreate(AvatarBase):
    workspace_id: int

class AvatarUpdate(BaseModel):
    name: Optional[str] = None
    style_hints: Optional[str] = None
    channel_type: Optional[str] = None
    base_portrait_path: Optional[str] = None
    reference_sheet_path: Optional[str] = None
    voice_profile_id: Optional[str] = None

class AvatarResponse(AvatarBase):
    id: int
    workspace_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)