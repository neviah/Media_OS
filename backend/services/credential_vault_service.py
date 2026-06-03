import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:  # pragma: no cover - handled at runtime if dependency missing
    Fernet = None

    class InvalidToken(Exception):
        pass


class CredentialVaultService:
    """Encrypt and decrypt provider credentials with a deterministic Fernet key."""

    DEFAULT_KEY_WARNING = "mediaos-dev-local-key-change-me"

    def __init__(self) -> None:
        if Fernet is None:
            raise RuntimeError("cryptography is required for encrypted credential storage")
        self.key_id = os.getenv("MEDIAOS_CREDENTIAL_KEY_ID", "local-dev")
        key_material = self._load_key_material()
        fernet_key = self._derive_fernet_key(key_material)
        self._fernet = Fernet(fernet_key)

    def _load_key_material(self) -> str:
        require_external = os.getenv("MEDIAOS_REQUIRE_EXTERNAL_CREDENTIAL_KEY", "0") == "1"
        key_file = os.getenv("MEDIAOS_CREDENTIAL_KEY_FILE", "").strip()
        env_key = os.getenv("MEDIAOS_CREDENTIAL_KEY", "").strip()

        if key_file:
            key_path = Path(key_file)
            if not key_path.exists():
                raise RuntimeError("MEDIAOS_CREDENTIAL_KEY_FILE is set but file does not exist")
            key_value = key_path.read_text(encoding="utf-8").strip()
            if not key_value:
                raise RuntimeError("MEDIAOS_CREDENTIAL_KEY_FILE is empty")
            return key_value

        if env_key:
            return env_key

        if require_external:
            raise RuntimeError(
                "External credential key required. Set MEDIAOS_CREDENTIAL_KEY_FILE or MEDIAOS_CREDENTIAL_KEY"
            )

        # Development fallback only.
        return os.getenv("MEDIAOS_API_KEY") or self.DEFAULT_KEY_WARNING

    @staticmethod
    def _derive_fernet_key(key_material: str) -> bytes:
        digest = hashlib.sha256(key_material.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)

    def encrypt_dict(self, payload: Dict[str, Any]) -> str:
        serialized = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return self._fernet.encrypt(serialized).decode("utf-8")

    def decrypt_dict(self, encrypted_payload: str) -> Dict[str, Any]:
        try:
            raw = self._fernet.decrypt(encrypted_payload.encode("utf-8"))
        except InvalidToken as exc:
            raise ValueError("Credential payload could not be decrypted") from exc
        return json.loads(raw.decode("utf-8"))
