import threading
import time
from datetime import datetime, UTC
from typing import Dict, Optional

import httpx

from backend.database import SessionLocal
from backend.models.database import SocialCredential, SocialCredentialAudit
from backend.services.credential_vault_service import CredentialVaultService


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _parse_timestamp(raw_value: Optional[str]) -> Optional[datetime]:
    if not raw_value:
        return None
    try:
        value = datetime.fromisoformat(raw_value)
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    except Exception:
        return None


class TokenLifecycleService:
    REFRESH_ENDPOINTS = {
        "youtube": "https://oauth2.googleapis.com/token",
        "tiktok": "https://open.tiktokapis.com/v2/oauth/token/",
        "x": "https://api.twitter.com/2/oauth2/token",
    }

    def __init__(self) -> None:
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_cycle_started_at: Optional[str] = None
        self._last_cycle_summary: Dict[str, int] = {"checked": 0, "refreshed": 0, "failed": 0, "warnings": 0}

    def _write_audit(self, db, credential_id: int, action: str, details: str) -> None:
        db.add(
            SocialCredentialAudit(
                credential_id=credential_id,
                action=action,
                actor="system:token-lifecycle",
                details=details,
            )
        )

    def _token_expiry_warning(self, payload: Dict, warning_threshold_seconds: int) -> Optional[str]:
        tokens = payload.get("tokens", {})
        expires_in = tokens.get("expires_in")
        received_at = _parse_timestamp(payload.get("token_received_at")) or _parse_timestamp(payload.get("updated_at"))

        if not expires_in or not received_at:
            return None

        try:
            expires_in_int = int(expires_in)
        except Exception:
            return None

        age = (_utcnow() - received_at).total_seconds()
        remaining = expires_in_int - age
        if remaining <= warning_threshold_seconds:
            return f"Token expires soon ({int(remaining)}s remaining)"
        return None

    def _refresh_payload(self, platform: str, payload: Dict) -> Dict:
        endpoint = self.REFRESH_ENDPOINTS.get(platform)
        if not endpoint:
            raise ValueError(f"No refresh endpoint configured for {platform}")

        refresh_token = payload.get("tokens", {}).get("refresh_token")
        if not refresh_token:
            raise ValueError("No refresh_token available")

        client_id = payload.get("oauth_client_id")
        client_secret = payload.get("oauth_client_secret")
        if not client_id or not client_secret:
            raise ValueError("OAuth client credentials missing")

        request_body = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        }

        response = httpx.post(endpoint, data=request_body, timeout=20)
        response.raise_for_status()
        refreshed = response.json()

        tokens = payload.get("tokens", {})
        tokens.update(refreshed)
        if not tokens.get("refresh_token"):
            tokens["refresh_token"] = refresh_token

        payload["tokens"] = tokens
        payload["token_received_at"] = _utcnow().isoformat()
        payload["updated_at"] = _utcnow().isoformat()
        return payload

    def run_refresh_cycle(self, force: bool = False) -> Dict[str, int]:
        db = SessionLocal()
        summary = {"checked": 0, "refreshed": 0, "failed": 0, "warnings": 0}
        warning_threshold = int(float(__import__("os").getenv("MEDIAOS_TOKEN_WARNING_SECONDS", "900")))

        try:
            credentials = db.query(SocialCredential).filter(SocialCredential.is_connected.is_(True)).all()
            try:
                vault = CredentialVaultService()
            except RuntimeError:
                return summary

            for credential in credentials:
                summary["checked"] += 1
                if not credential.encrypted_payload:
                    continue

                try:
                    payload = vault.decrypt_dict(credential.encrypted_payload)
                except ValueError:
                    summary["failed"] += 1
                    self._write_audit(db, credential.id, "token_warning", "encrypted payload could not be decrypted")
                    continue

                warning = self._token_expiry_warning(payload, warning_threshold)
                if warning:
                    summary["warnings"] += 1
                    self._write_audit(db, credential.id, "token_warning", warning)

                if not force and not warning:
                    continue

                platform = (credential.platform or "").strip().lower()
                if platform not in self.REFRESH_ENDPOINTS:
                    continue

                try:
                    refreshed_payload = self._refresh_payload(platform, payload)
                    credential.encrypted_payload = vault.encrypt_dict(refreshed_payload)
                    credential.updated_at = _utcnow()
                    summary["refreshed"] += 1
                    self._write_audit(db, credential.id, "token_refresh", f"refreshed token for {platform}")
                except Exception as exc:
                    summary["failed"] += 1
                    self._write_audit(db, credential.id, "token_refresh_failed", f"{platform}: {exc}")

            db.commit()
            return summary
        finally:
            db.close()

    def _loop(self) -> None:
        while self._running:
            self._last_cycle_started_at = _utcnow().isoformat()
            self._last_cycle_summary = self.run_refresh_cycle(force=False)
            sleep_seconds = int(float(__import__("os").getenv("MEDIAOS_TOKEN_REFRESH_INTERVAL_SECONDS", "300")))
            for _ in range(max(1, sleep_seconds)):
                if not self._running:
                    break
                time.sleep(1)

    def start(self) -> None:
        if self._running:
            return
        enabled = __import__("os").getenv("MEDIAOS_TOKEN_REFRESH_ENABLED", "1") == "1"
        if not enabled:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    def status(self) -> Dict:
        return {
            "running": self._running,
            "last_cycle_started_at": self._last_cycle_started_at,
            "last_cycle_summary": self._last_cycle_summary,
        }



token_lifecycle_service = TokenLifecycleService()
