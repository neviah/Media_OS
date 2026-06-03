"""
API-first publishing service.

This service uses OAuth credentials from the encrypted credential vault and
publishes through provider APIs where implemented.
"""

from __future__ import annotations

import os
from datetime import datetime, UTC
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from backend.database import SessionLocal
from backend.models.database import SocialCredential
from backend.services.credential_vault_service import CredentialVaultService


def _utcnow() -> datetime:
    return datetime.now(UTC)


class PublishingService:
    def __init__(self) -> None:
        self.base_output_dir = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")

    def _resolve_video_path(self, workspace_id: int, video_path: str) -> Path:
        path = Path(video_path)
        if path.is_absolute():
            return path
        return Path(self.base_output_dir) / str(workspace_id) / video_path

    def _standard_response(
        self,
        *,
        platform: str,
        success: bool,
        error_code: Optional[str] = None,
        error: Optional[str] = None,
        video_url: Optional[str] = None,
        provider_response: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "platform": platform,
            "success": success,
            "error_code": error_code,
            "error": error,
            "video_url": video_url,
            "provider_response": provider_response or {},
            "timestamp": _utcnow().isoformat(),
        }

    def _load_platform_credential(self, workspace_id: int, channel_id: int, platform: str) -> Optional[SocialCredential]:
        db = SessionLocal()
        try:
            # Prefer channel scoped credentials, then workspace scoped fallback.
            scoped = (
                db.query(SocialCredential)
                .filter(
                    SocialCredential.workspace_id == workspace_id,
                    SocialCredential.channel_id == channel_id,
                    SocialCredential.platform == platform,
                    SocialCredential.is_connected.is_(True),
                )
                .first()
            )
            if scoped:
                return scoped

            return (
                db.query(SocialCredential)
                .filter(
                    SocialCredential.workspace_id == workspace_id,
                    SocialCredential.channel_id.is_(None),
                    SocialCredential.platform == platform,
                    SocialCredential.is_connected.is_(True),
                )
                .first()
            )
        finally:
            db.close()

    def _load_token_payload(self, credential: SocialCredential) -> Optional[Dict[str, Any]]:
        if not credential.encrypted_payload:
            return None
        vault = CredentialVaultService()
        payload = vault.decrypt_dict(credential.encrypted_payload)
        return payload

    def _refresh_google_access_token(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        refresh_token = payload.get("tokens", {}).get("refresh_token")
        client_id = payload.get("oauth_client_id")
        client_secret = payload.get("oauth_client_secret")

        if not refresh_token or not client_id or not client_secret:
            raise ValueError("Missing refresh_token/client credentials for YouTube token refresh")

        body = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        response = httpx.post("https://oauth2.googleapis.com/token", data=body, timeout=20)
        response.raise_for_status()
        refreshed = response.json()

        tokens = payload.get("tokens", {})
        tokens.update(refreshed)
        payload["tokens"] = tokens
        payload["token_received_at"] = _utcnow().isoformat()
        return payload

    def _persist_payload(self, credential_id: int, payload: Dict[str, Any]) -> None:
        db = SessionLocal()
        try:
            credential = db.query(SocialCredential).filter(SocialCredential.id == credential_id).first()
            if credential is None:
                return
            vault = CredentialVaultService()
            credential.encrypted_payload = vault.encrypt_dict(payload)
            credential.updated_at = _utcnow()
            db.commit()
        finally:
            db.close()

    def _youtube_upload(
        self,
        credential: SocialCredential,
        workspace_id: int,
        video_path: str,
        title: str,
        description: str,
        tags: str,
        privacy: str,
    ) -> Dict[str, Any]:
        full_video_path = self._resolve_video_path(workspace_id, video_path)
        if not full_video_path.exists():
            return self._standard_response(
                platform="youtube",
                success=False,
                error_code="video_not_found",
                error=f"Video file not found: {full_video_path}",
            )

        try:
            payload = self._load_token_payload(credential)
            if not payload:
                return self._standard_response(
                    platform="youtube",
                    success=False,
                    error_code="credential_payload_missing",
                    error="Credential payload missing for YouTube",
                )

            access_token = payload.get("tokens", {}).get("access_token")
            if not access_token:
                payload = self._refresh_google_access_token(payload)
                access_token = payload.get("tokens", {}).get("access_token")
                self._persist_payload(credential.id, payload)

            if not access_token:
                return self._standard_response(
                    platform="youtube",
                    success=False,
                    error_code="access_token_missing",
                    error="Unable to obtain access token for YouTube",
                )

            init_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "video/mp4",
            }
            metadata = {
                "snippet": {
                    "title": title,
                    "description": description,
                    "tags": [tag.strip().lstrip("#") for tag in tags.split(",") if tag.strip()],
                },
                "status": {"privacyStatus": privacy.lower() if privacy else "private"},
            }

            init_response = httpx.post(
                "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
                headers=init_headers,
                json=metadata,
                timeout=30,
            )

            if init_response.status_code == 401:
                payload = self._refresh_google_access_token(payload)
                self._persist_payload(credential.id, payload)
                access_token = payload.get("tokens", {}).get("access_token")
                init_headers["Authorization"] = f"Bearer {access_token}"
                init_response = httpx.post(
                    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
                    headers=init_headers,
                    json=metadata,
                    timeout=30,
                )

            init_response.raise_for_status()
            upload_url = init_response.headers.get("Location")
            if not upload_url:
                return self._standard_response(
                    platform="youtube",
                    success=False,
                    error_code="upload_url_missing",
                    error="YouTube resumable upload URL was not returned",
                )

            with full_video_path.open("rb") as video_stream:
                upload_response = httpx.put(
                    upload_url,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "video/mp4",
                    },
                    content=video_stream.read(),
                    timeout=180,
                )

            upload_response.raise_for_status()
            provider_payload = upload_response.json()
            video_id = provider_payload.get("id")
            video_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else None

            return self._standard_response(
                platform="youtube",
                success=True,
                video_url=video_url,
                provider_response=provider_payload,
            )
        except httpx.HTTPStatusError as exc:
            return self._standard_response(
                platform="youtube",
                success=False,
                error_code="provider_http_error",
                error=f"YouTube API returned {exc.response.status_code}: {exc.response.text[:300]}",
            )
        except Exception as exc:
            return self._standard_response(
                platform="youtube",
                success=False,
                error_code="provider_error",
                error=str(exc),
            )

    def _not_implemented_platform(self, platform: str) -> Dict[str, Any]:
        return self._standard_response(
            platform=platform,
            success=False,
            error_code="provider_api_not_implemented",
            error=f"{platform} API publishing adapter is not implemented yet",
        )

    def publish(
        self,
        *,
        workspace_id: int,
        channel_id: int,
        platform: str,
        video_path: str,
        title: str,
        description: str = "",
        tags: str = "",
        privacy: str = "private",
    ) -> Dict[str, Any]:
        normalized_platform = (platform or "").strip().lower()
        if not normalized_platform:
            return self._standard_response(
                platform="unknown",
                success=False,
                error_code="invalid_platform",
                error="Platform is required",
            )

        credential = self._load_platform_credential(workspace_id, channel_id, normalized_platform)
        if credential is None:
            return self._standard_response(
                platform=normalized_platform,
                success=False,
                error_code="credential_missing",
                error=f"No connected credential found for {normalized_platform}",
            )

        if normalized_platform == "youtube":
            return self._youtube_upload(
                credential=credential,
                workspace_id=workspace_id,
                video_path=video_path,
                title=title,
                description=description,
                tags=tags,
                privacy=privacy,
            )

        if normalized_platform in {"tiktok", "instagram", "x"}:
            return self._not_implemented_platform(normalized_platform)

        return self._standard_response(
            platform=normalized_platform,
            success=False,
            error_code="unsupported_platform",
            error=f"Unsupported platform: {normalized_platform}",
        )

    # Compatibility wrappers for existing pipeline calls.
    def upload_youtube(self, workspace_id: int, video_path: str, title: str, description: str = "", tags: str = "", privacy: str = "private", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(
            workspace_id=workspace_id,
            channel_id=channel_id,
            platform="youtube",
            video_path=video_path,
            title=title,
            description=description,
            tags=tags,
            privacy=privacy,
        )

    def upload_tiktok(self, workspace_id: int, video_path: str, title: str = "", privacy: str = "private", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(
            workspace_id=workspace_id,
            channel_id=channel_id,
            platform="tiktok",
            video_path=video_path,
            title=title,
            privacy=privacy,
        )

    def upload_instagram(self, workspace_id: int, video_path: str, caption: str = "", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(
            workspace_id=workspace_id,
            channel_id=channel_id,
            platform="instagram",
            video_path=video_path,
            title=caption,
            description=caption,
        )

    def upload_x(self, workspace_id: int, video_path: str, title: str = "", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(
            workspace_id=workspace_id,
            channel_id=channel_id,
            platform="x",
            video_path=video_path,
            title=title,
            description=title,
        )


publishing_service = PublishingService()
