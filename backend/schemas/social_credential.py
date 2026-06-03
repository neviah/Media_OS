from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class SocialCredentialSecretUpsert(BaseModel):
    workspace_id: int
    channel_id: Optional[int] = None
    platform: str
    account_hint: Optional[str] = None
    secret_payload: Dict[str, str]


class OAuthStartRequest(BaseModel):
    workspace_id: int
    channel_id: Optional[int] = None
    platform: str
    client_id: str
    client_secret: str
    redirect_uri: str
    scopes: Optional[List[str]] = None
    login_hint: Optional[str] = None


class OAuthStartResponse(BaseModel):
    authorization_url: str
    state: str
    platform: str


class OAuthCallbackRequest(BaseModel):
    workspace_id: int
    channel_id: Optional[int] = None
    platform: str
    code: str
    state: Optional[str] = None
    account_hint: Optional[str] = None


class SocialCredentialStatusResponse(BaseModel):
    id: int
    workspace_id: int
    channel_id: Optional[int] = None
    platform: str
    account_hint: Optional[str] = None
    is_connected: bool
    scopes: List[str] = []
    has_refresh_token: bool = False
    connected_at: Optional[datetime] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
