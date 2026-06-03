"""
API-first publishing service using encrypted OAuth credentials.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, UTC
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

from backend.database import SessionLocal
from backend.models.database import SocialCredential
from backend.services.credential_vault_service import CredentialVaultService


def _utcnow() -> datetime:
    return datetime.now(UTC)


class PublishingService:
    TOKEN_REFRESH_ENDPOINTS = {
        "youtube": "https://oauth2.googleapis.com/token",
        "tiktok": "https://open.tiktokapis.com/v2/oauth/token/",
        "x": "https://api.twitter.com/2/oauth2/token",
    }

    def __init__(self) -> None:
        self.base_output_dir = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")
        self.provider_capabilities = {
            "youtube": {"adapter": "youtube_v3_resumable", "implemented": True},
            "tiktok": {"adapter": "tiktok_content_posting", "implemented": True},
            "instagram": {"adapter": "instagram_graph_content_publishing", "implemented": True},
            "x": {"adapter": "x_chunked_media_and_tweet", "implemented": True},
        }

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

    def _load_payload(self, credential: SocialCredential) -> Optional[Dict[str, Any]]:
        if not credential.encrypted_payload:
            return None
        vault = CredentialVaultService()
        return vault.decrypt_dict(credential.encrypted_payload)

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

    def _refresh_access_token(self, platform: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        refresh_token = payload.get("tokens", {}).get("refresh_token")
        client_id = payload.get("oauth_client_id")
        client_secret = payload.get("oauth_client_secret")

        if platform == "instagram":
            access_token = payload.get("tokens", {}).get("access_token")
            if not access_token:
                raise ValueError("Missing instagram access token")
            response = httpx.get(
                "https://graph.instagram.com/refresh_access_token",
                params={"grant_type": "ig_refresh_token", "access_token": access_token},
                timeout=20,
            )
            response.raise_for_status()
            refreshed = response.json()
        else:
            endpoint = self.TOKEN_REFRESH_ENDPOINTS.get(platform)
            if not endpoint:
                raise ValueError(f"No refresh endpoint configured for {platform}")
            if not refresh_token or not client_id or not client_secret:
                raise ValueError("Missing refresh_token/client credentials for token refresh")

            body = {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            }
            response = httpx.post(endpoint, data=body, timeout=20)
            response.raise_for_status()
            refreshed = response.json()

        tokens = payload.get("tokens", {})
        tokens.update(refreshed)
        if refresh_token and not tokens.get("refresh_token"):
            tokens["refresh_token"] = refresh_token
        payload["tokens"] = tokens
        payload["token_received_at"] = _utcnow().isoformat()
        payload["updated_at"] = _utcnow().isoformat()
        return payload

    def _ensure_access_token(self, platform: str, credential: SocialCredential, payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        access_token = payload.get("tokens", {}).get("access_token")
        if access_token:
            return access_token, payload

        refreshed = self._refresh_access_token(platform, payload)
        access_token = refreshed.get("tokens", {}).get("access_token")
        if not access_token:
            raise ValueError("Unable to resolve access token")

        self._persist_payload(credential.id, refreshed)
        return access_token, refreshed

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
            return self._standard_response(platform="youtube", success=False, error_code="video_not_found", error=f"Video file not found: {full_video_path}")

        try:
            payload = self._load_payload(credential)
            if not payload:
                return self._standard_response(platform="youtube", success=False, error_code="credential_payload_missing", error="Credential payload missing for YouTube")

            access_token, payload = self._ensure_access_token("youtube", credential, payload)

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
                payload = self._refresh_access_token("youtube", payload)
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
                return self._standard_response(platform="youtube", success=False, error_code="upload_url_missing", error="YouTube resumable upload URL was not returned")

            with full_video_path.open("rb") as video_stream:
                upload_response = httpx.put(
                    upload_url,
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "video/mp4"},
                    content=video_stream.read(),
                    timeout=240,
                )

            upload_response.raise_for_status()
            provider_payload = upload_response.json()
            video_id = provider_payload.get("id")
            video_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else None
            return self._standard_response(platform="youtube", success=True, video_url=video_url, provider_response=provider_payload)
        except httpx.HTTPStatusError as exc:
            return self._standard_response(platform="youtube", success=False, error_code="provider_http_error", error=f"YouTube API returned {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return self._standard_response(platform="youtube", success=False, error_code="provider_error", error=str(exc))

    def _tiktok_upload(self, credential: SocialCredential, workspace_id: int, video_path: str, title: str, privacy: str) -> Dict[str, Any]:
        full_video_path = self._resolve_video_path(workspace_id, video_path)
        if not full_video_path.exists():
            return self._standard_response(platform="tiktok", success=False, error_code="video_not_found", error=f"Video file not found: {full_video_path}")

        try:
            payload = self._load_payload(credential)
            if not payload:
                return self._standard_response(platform="tiktok", success=False, error_code="credential_payload_missing", error="Credential payload missing for TikTok")

            access_token, payload = self._ensure_access_token("tiktok", credential, payload)
            video_size = full_video_path.stat().st_size

            init_body = {
                "post_info": {
                    "title": title or "MediaOS Upload",
                    "privacy_level": "PUBLIC_TO_EVERYONE" if privacy.lower() == "public" else "SELF_ONLY",
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "FILE_UPLOAD",
                    "video_size": video_size,
                    "chunk_size": video_size,
                    "total_chunk_count": 1,
                },
            }

            init_response = httpx.post(
                "https://open.tiktokapis.com/v2/post/publish/video/init/",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=init_body,
                timeout=30,
            )
            init_response.raise_for_status()
            init_payload = init_response.json()

            data = init_payload.get("data", {}) if isinstance(init_payload, dict) else {}
            upload_url = data.get("upload_url") or data.get("upload_url_list", [None])[0]
            publish_id = data.get("publish_id")

            if not upload_url:
                return self._standard_response(
                    platform="tiktok",
                    success=False,
                    error_code="upload_url_missing",
                    error="TikTok did not return upload URL",
                    provider_response=init_payload,
                )

            with full_video_path.open("rb") as stream:
                upload_response = httpx.put(upload_url, content=stream.read(), timeout=240)
            upload_response.raise_for_status()

            post_url = f"https://www.tiktok.com/upload?publish_id={publish_id}" if publish_id else None
            return self._standard_response(
                platform="tiktok",
                success=True,
                video_url=post_url,
                provider_response={
                    "init": init_payload,
                    "upload_status": upload_response.status_code,
                },
            )
        except httpx.HTTPStatusError as exc:
            return self._standard_response(platform="tiktok", success=False, error_code="provider_http_error", error=f"TikTok API returned {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return self._standard_response(platform="tiktok", success=False, error_code="provider_error", error=str(exc))

    def _instagram_upload(self, credential: SocialCredential, workspace_id: int, video_path: str, description: str) -> Dict[str, Any]:
        full_video_path = self._resolve_video_path(workspace_id, video_path)
        if not full_video_path.exists() and not str(video_path).startswith("http"):
            return self._standard_response(platform="instagram", success=False, error_code="video_not_found", error=f"Video file not found: {full_video_path}")

        try:
            payload = self._load_payload(credential)
            if not payload:
                return self._standard_response(platform="instagram", success=False, error_code="credential_payload_missing", error="Credential payload missing for Instagram")

            access_token, payload = self._ensure_access_token("instagram", credential, payload)
            secret_payload = payload.get("secret_payload", {})
            ig_user_id = secret_payload.get("ig_user_id") or payload.get("ig_user_id")
            source_video_url = secret_payload.get("source_video_url") or (video_path if str(video_path).startswith("http") else None)

            if not ig_user_id:
                return self._standard_response(
                    platform="instagram",
                    success=False,
                    error_code="ig_user_id_missing",
                    error="Instagram adapter requires ig_user_id in secret payload",
                )

            if not source_video_url:
                return self._standard_response(
                    platform="instagram",
                    success=False,
                    error_code="public_video_url_required",
                    error="Instagram Graph API requires a public video URL (set secret_payload.source_video_url)",
                )

            create_response = httpx.post(
                f"https://graph.facebook.com/v20.0/{ig_user_id}/media",
                data={
                    "media_type": "REELS",
                    "video_url": source_video_url,
                    "caption": description or "",
                    "access_token": access_token,
                },
                timeout=30,
            )
            create_response.raise_for_status()
            creation_payload = create_response.json()
            creation_id = creation_payload.get("id")
            if not creation_id:
                return self._standard_response(platform="instagram", success=False, error_code="creation_id_missing", error="Instagram media creation did not return an ID", provider_response=creation_payload)

            publish_response = httpx.post(
                f"https://graph.facebook.com/v20.0/{ig_user_id}/media_publish",
                data={"creation_id": creation_id, "access_token": access_token},
                timeout=30,
            )
            publish_response.raise_for_status()
            publish_payload = publish_response.json()
            media_id = publish_payload.get("id")
            media_url = f"https://www.instagram.com/reel/{media_id}/" if media_id else None

            return self._standard_response(
                platform="instagram",
                success=True,
                video_url=media_url,
                provider_response={"create": creation_payload, "publish": publish_payload},
            )
        except httpx.HTTPStatusError as exc:
            return self._standard_response(platform="instagram", success=False, error_code="provider_http_error", error=f"Instagram API returned {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return self._standard_response(platform="instagram", success=False, error_code="provider_error", error=str(exc))

    def _x_upload(self, credential: SocialCredential, workspace_id: int, video_path: str, title: str) -> Dict[str, Any]:
        full_video_path = self._resolve_video_path(workspace_id, video_path)
        if not full_video_path.exists():
            return self._standard_response(platform="x", success=False, error_code="video_not_found", error=f"Video file not found: {full_video_path}")

        try:
            payload = self._load_payload(credential)
            if not payload:
                return self._standard_response(platform="x", success=False, error_code="credential_payload_missing", error="Credential payload missing for X")

            access_token, payload = self._ensure_access_token("x", credential, payload)
            file_bytes = full_video_path.read_bytes()
            total_bytes = len(file_bytes)

            init_response = httpx.post(
                "https://upload.twitter.com/1.1/media/upload.json",
                headers={"Authorization": f"Bearer {access_token}"},
                data={"command": "INIT", "media_type": "video/mp4", "total_bytes": total_bytes, "media_category": "tweet_video"},
                timeout=30,
            )
            init_response.raise_for_status()
            media_id = init_response.json().get("media_id_string")
            if not media_id:
                return self._standard_response(platform="x", success=False, error_code="media_id_missing", error="X upload INIT did not return media_id")

            append_response = httpx.post(
                "https://upload.twitter.com/1.1/media/upload.json",
                headers={"Authorization": f"Bearer {access_token}"},
                files={"media": file_bytes},
                data={"command": "APPEND", "media_id": media_id, "segment_index": 0},
                timeout=240,
            )
            append_response.raise_for_status()

            finalize_response = httpx.post(
                "https://upload.twitter.com/1.1/media/upload.json",
                headers={"Authorization": f"Bearer {access_token}"},
                data={"command": "FINALIZE", "media_id": media_id},
                timeout=30,
            )
            finalize_response.raise_for_status()
            finalize_payload = finalize_response.json()

            processing_info = finalize_payload.get("processing_info")
            while processing_info and processing_info.get("state") in {"pending", "in_progress"}:
                check_after = int(processing_info.get("check_after_secs", 2))
                time.sleep(min(8, max(1, check_after)))
                status_response = httpx.get(
                    "https://upload.twitter.com/1.1/media/upload.json",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"command": "STATUS", "media_id": media_id},
                    timeout=30,
                )
                status_response.raise_for_status()
                processing_info = status_response.json().get("processing_info")
                if processing_info and processing_info.get("state") == "failed":
                    return self._standard_response(platform="x", success=False, error_code="media_processing_failed", error=str(processing_info))

            tweet_response = httpx.post(
                "https://api.twitter.com/2/tweets",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json={
                    "text": (title or "MediaOS upload")[:280],
                    "media": {"media_ids": [media_id]},
                },
                timeout=30,
            )
            tweet_response.raise_for_status()
            tweet_payload = tweet_response.json()
            tweet_id = tweet_payload.get("data", {}).get("id")
            tweet_url = f"https://x.com/i/web/status/{tweet_id}" if tweet_id else None

            return self._standard_response(platform="x", success=True, video_url=tweet_url, provider_response={"tweet": tweet_payload, "media_id": media_id})
        except httpx.HTTPStatusError as exc:
            return self._standard_response(platform="x", success=False, error_code="provider_http_error", error=f"X API returned {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return self._standard_response(platform="x", success=False, error_code="provider_error", error=str(exc))

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
        if normalized_platform not in self.provider_capabilities:
            return self._standard_response(platform=normalized_platform or "unknown", success=False, error_code="unsupported_platform", error=f"Unsupported platform: {normalized_platform}")

        credential = self._load_platform_credential(workspace_id, channel_id, normalized_platform)
        if credential is None:
            return self._standard_response(platform=normalized_platform, success=False, error_code="credential_missing", error=f"No connected credential found for {normalized_platform}")

        if normalized_platform == "youtube":
            return self._youtube_upload(credential, workspace_id, video_path, title, description, tags, privacy)
        if normalized_platform == "tiktok":
            return self._tiktok_upload(credential, workspace_id, video_path, title, privacy)
        if normalized_platform == "instagram":
            return self._instagram_upload(credential, workspace_id, video_path, description)
        if normalized_platform == "x":
            return self._x_upload(credential, workspace_id, video_path, title)

        return self._standard_response(platform=normalized_platform, success=False, error_code="unsupported_platform", error=f"Unsupported platform: {normalized_platform}")

    def upload_youtube(self, workspace_id: int, video_path: str, title: str, description: str = "", tags: str = "", privacy: str = "private", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(workspace_id=workspace_id, channel_id=channel_id, platform="youtube", video_path=video_path, title=title, description=description, tags=tags, privacy=privacy)

    def upload_tiktok(self, workspace_id: int, video_path: str, title: str = "", privacy: str = "private", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(workspace_id=workspace_id, channel_id=channel_id, platform="tiktok", video_path=video_path, title=title, privacy=privacy)

    def upload_instagram(self, workspace_id: int, video_path: str, caption: str = "", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(workspace_id=workspace_id, channel_id=channel_id, platform="instagram", video_path=video_path, title=caption, description=caption)

    def upload_x(self, workspace_id: int, video_path: str, title: str = "", channel_id: int = 0) -> Dict[str, Any]:
        return self.publish(workspace_id=workspace_id, channel_id=channel_id, platform="x", video_path=video_path, title=title, description=title)


publishing_service = PublishingService()
