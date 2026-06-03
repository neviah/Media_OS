import secrets
from datetime import datetime
from typing import List, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.database import Channel, SocialCredential, Workspace
from backend.schemas.social_credential import (
    OAuthCallbackRequest,
    OAuthStartRequest,
    OAuthStartResponse,
    SocialCredentialSecretUpsert,
    SocialCredentialStatusResponse,
)
from backend.services.credential_vault_service import CredentialVaultService

router = APIRouter()

YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DEFAULT_SCOPES = {
    "youtube": [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
    ]
}
SUPPORTED_OAUTH_PLATFORMS = {"youtube"}


def _scopes_to_string(scopes: Optional[List[str]]) -> str:
    if not scopes:
        return ""
    return " ".join([scope.strip() for scope in scopes if scope and scope.strip()])


def _parse_scopes(scope_string: Optional[str]) -> List[str]:
    if not scope_string:
        return []
    return [value for value in scope_string.split(" ") if value]


def _ensure_scope_exists(db: Session, workspace_id: int, channel_id: Optional[int]) -> None:
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if channel_id is None:
        return
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if channel is None or channel.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Channel not found for workspace")


def _get_or_create_credential(db: Session, workspace_id: int, channel_id: Optional[int], platform: str) -> SocialCredential:
    credential = (
        db.query(SocialCredential)
        .filter(
            SocialCredential.workspace_id == workspace_id,
            SocialCredential.channel_id == channel_id,
            SocialCredential.platform == platform,
        )
        .first()
    )
    if credential is None:
        credential = SocialCredential(
            workspace_id=workspace_id,
            channel_id=channel_id,
            platform=platform,
            encrypted_payload="",
            is_connected=False,
        )
        db.add(credential)
    return credential


def _to_status(credential: SocialCredential, vault: CredentialVaultService) -> SocialCredentialStatusResponse:
    has_refresh_token = False
    if credential.encrypted_payload:
        try:
            payload = vault.decrypt_dict(credential.encrypted_payload)
            has_refresh_token = bool(payload.get("tokens", {}).get("refresh_token"))
        except ValueError:
            has_refresh_token = False

    return SocialCredentialStatusResponse(
        id=credential.id,
        workspace_id=credential.workspace_id,
        channel_id=credential.channel_id,
        platform=credential.platform,
        account_hint=credential.provider_account_hint,
        is_connected=credential.is_connected,
        scopes=_parse_scopes(credential.scopes),
        has_refresh_token=has_refresh_token,
        connected_at=credential.connected_at,
        updated_at=credential.updated_at,
    )


@router.get("/", response_model=List[SocialCredentialStatusResponse])
def list_social_credentials(
    workspace_id: Optional[int] = Query(default=None),
    channel_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(SocialCredential)
    if workspace_id is not None:
        query = query.filter(SocialCredential.workspace_id == workspace_id)
    if channel_id is not None:
        query = query.filter(SocialCredential.channel_id == channel_id)

    try:
        vault = CredentialVaultService()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    credentials = query.order_by(SocialCredential.updated_at.desc()).all()
    return [_to_status(item, vault) for item in credentials]


@router.post("/secrets", response_model=SocialCredentialStatusResponse, status_code=status.HTTP_201_CREATED)
def upsert_social_secret(payload: SocialCredentialSecretUpsert, db: Session = Depends(get_db)):
    platform = payload.platform.strip().lower()
    if not payload.secret_payload:
        raise HTTPException(status_code=400, detail="secret_payload must not be empty")

    _ensure_scope_exists(db, payload.workspace_id, payload.channel_id)

    try:
        vault = CredentialVaultService()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    credential = _get_or_create_credential(db, payload.workspace_id, payload.channel_id, platform)
    credential.provider_account_hint = payload.account_hint
    credential.encrypted_payload = vault.encrypt_dict(
        {
            "kind": "manual-secret",
            "secret_payload": payload.secret_payload,
            "updated_at": datetime.utcnow().isoformat(),
        }
    )
    credential.encryption_version = "fernet-v1"
    credential.is_connected = True
    credential.connected_at = datetime.utcnow()

    db.commit()
    db.refresh(credential)
    return _to_status(credential, vault)


@router.post("/oauth/start", response_model=OAuthStartResponse)
def start_oauth(payload: OAuthStartRequest, db: Session = Depends(get_db)):
    platform = payload.platform.strip().lower()
    if platform not in SUPPORTED_OAUTH_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"OAuth start not supported for platform: {platform}")

    _ensure_scope_exists(db, payload.workspace_id, payload.channel_id)

    scopes = payload.scopes or DEFAULT_SCOPES[platform]
    scope_string = _scopes_to_string(scopes)
    state = secrets.token_urlsafe(24)

    try:
        vault = CredentialVaultService()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    credential = _get_or_create_credential(db, payload.workspace_id, payload.channel_id, platform)
    credential.oauth_state = state
    credential.is_connected = False
    credential.scopes = scope_string
    credential.provider_account_hint = payload.login_hint
    credential.encryption_version = "fernet-v1"
    credential.encrypted_payload = vault.encrypt_dict(
        {
            "kind": "oauth-config",
            "oauth_client_id": payload.client_id,
            "oauth_client_secret": payload.client_secret,
            "redirect_uri": payload.redirect_uri,
            "login_hint": payload.login_hint,
            "scopes": scopes,
            "updated_at": datetime.utcnow().isoformat(),
        }
    )

    query = {
        "client_id": payload.client_id,
        "redirect_uri": payload.redirect_uri,
        "response_type": "code",
        "scope": scope_string,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    if payload.login_hint:
        query["login_hint"] = payload.login_hint

    db.commit()
    db.refresh(credential)

    return OAuthStartResponse(
        authorization_url=f"{YOUTUBE_AUTH_URL}?{urlencode(query)}",
        state=state,
        platform=platform,
    )


@router.post("/oauth/callback", response_model=SocialCredentialStatusResponse)
def complete_oauth(payload: OAuthCallbackRequest, db: Session = Depends(get_db)):
    platform = payload.platform.strip().lower()
    if platform not in SUPPORTED_OAUTH_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"OAuth callback not supported for platform: {platform}")

    _ensure_scope_exists(db, payload.workspace_id, payload.channel_id)

    credential = (
        db.query(SocialCredential)
        .filter(
            SocialCredential.workspace_id == payload.workspace_id,
            SocialCredential.channel_id == payload.channel_id,
            SocialCredential.platform == platform,
        )
        .first()
    )
    if credential is None:
        raise HTTPException(status_code=404, detail="OAuth configuration not found for this scope")

    try:
        vault = CredentialVaultService()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if payload.state and credential.oauth_state and payload.state != credential.oauth_state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    try:
        decrypted_payload = vault.decrypt_dict(credential.encrypted_payload)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Stored OAuth configuration cannot be decrypted") from exc

    client_id = decrypted_payload.get("oauth_client_id")
    client_secret = decrypted_payload.get("oauth_client_secret")
    redirect_uri = decrypted_payload.get("redirect_uri")

    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(status_code=400, detail="OAuth configuration is incomplete")

    token_request_body = {
        "code": payload.code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    try:
        token_response = httpx.post(YOUTUBE_TOKEN_URL, data=token_request_body, timeout=20)
        token_response.raise_for_status()
        token_data = token_response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {exc}") from exc

    existing_payload = {}
    if credential.encrypted_payload:
        try:
            existing_payload = vault.decrypt_dict(credential.encrypted_payload)
        except ValueError:
            existing_payload = {}

    credential.encrypted_payload = vault.encrypt_dict(
        {
            "kind": "oauth-tokens",
            "oauth_client_id": client_id,
            "oauth_client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "tokens": {
                **token_data,
                "refresh_token": token_data.get("refresh_token")
                or existing_payload.get("tokens", {}).get("refresh_token"),
            },
            "updated_at": datetime.utcnow().isoformat(),
        }
    )
    credential.oauth_state = None
    credential.scopes = token_data.get("scope") or credential.scopes
    credential.provider_account_hint = payload.account_hint or credential.provider_account_hint
    credential.is_connected = True
    credential.connected_at = datetime.utcnow()

    db.commit()
    db.refresh(credential)

    return _to_status(credential, vault)


@router.delete("/{platform}", status_code=status.HTTP_204_NO_CONTENT)
def delete_social_credential(
    platform: str,
    workspace_id: int = Query(...),
    channel_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    normalized_platform = platform.strip().lower()
    credential = (
        db.query(SocialCredential)
        .filter(
            SocialCredential.workspace_id == workspace_id,
            SocialCredential.channel_id == channel_id,
            SocialCredential.platform == normalized_platform,
        )
        .first()
    )
    if credential is None:
        raise HTTPException(status_code=404, detail="Social credential not found")

    db.delete(credential)
    db.commit()
    return None
