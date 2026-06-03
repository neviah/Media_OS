from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List

from backend.database import SessionLocal
from backend.models.database import Channel, SocialCredential, Video


@dataclass
class PreflightCheck:
    key: str
    ok: bool
    detail: str


class PublishPreflightService:
    def run(self, *, video_id: int, platform: str) -> Dict:
        normalized_platform = (platform or "").strip().lower()
        db = SessionLocal()
        checks: List[PreflightCheck] = []
        try:
            video = db.query(Video).filter(Video.id == video_id).first()
            if not video:
                checks.append(PreflightCheck(key="video_exists", ok=False, detail="Video not found"))
                return {"ok": False, "checks": [asdict(item) for item in checks]}

            checks.append(PreflightCheck(key="video_exists", ok=True, detail=f"Video #{video.id} found"))

            video_path = Path(video.final_video_path or "")
            if not video.final_video_path:
                checks.append(PreflightCheck(key="final_video_path", ok=False, detail="Video has no final output path"))
            elif video_path.is_absolute():
                exists = video_path.exists()
                checks.append(PreflightCheck(key="final_video_file", ok=exists, detail=str(video_path)))
            else:
                checks.append(
                    PreflightCheck(
                        key="final_video_path_relative",
                        ok=True,
                        detail=f"Relative path '{video.final_video_path}' will be resolved by publishing service",
                    )
                )

            channel = db.query(Channel).filter(Channel.id == video.channel_id).first()
            if not channel:
                checks.append(PreflightCheck(key="channel_exists", ok=False, detail="Channel not found for video"))
                return {"ok": False, "checks": [asdict(item) for item in checks]}

            checks.append(PreflightCheck(key="channel_exists", ok=True, detail=f"Channel #{channel.id} found"))

            credential = (
                db.query(SocialCredential)
                .filter(
                    SocialCredential.workspace_id == video.workspace_id,
                    SocialCredential.channel_id == channel.id,
                    SocialCredential.platform == normalized_platform,
                    SocialCredential.is_connected.is_(True),
                )
                .first()
            )
            if credential is None:
                credential = (
                    db.query(SocialCredential)
                    .filter(
                        SocialCredential.workspace_id == video.workspace_id,
                        SocialCredential.channel_id.is_(None),
                        SocialCredential.platform == normalized_platform,
                        SocialCredential.is_connected.is_(True),
                    )
                    .first()
                )

            if credential is None:
                checks.append(
                    PreflightCheck(
                        key="social_credential",
                        ok=False,
                        detail=f"No connected credential for platform '{normalized_platform}'",
                    )
                )
            else:
                checks.append(
                    PreflightCheck(
                        key="social_credential",
                        ok=True,
                        detail=(
                            f"Connected credential #{credential.id} "
                            f"({'workspace' if credential.channel_id is None else f'channel #{credential.channel_id}'})"
                        ),
                    )
                )

            platform_supported = normalized_platform in {"youtube", "tiktok", "instagram", "x"}
            checks.append(
                PreflightCheck(
                    key="platform_supported",
                    ok=platform_supported,
                    detail="Supported" if platform_supported else f"Unsupported platform '{normalized_platform}'",
                )
            )

            ok = all(item.ok for item in checks)
            return {
                "ok": ok,
                "video_id": video.id,
                "workspace_id": video.workspace_id,
                "channel_id": video.channel_id,
                "platform": normalized_platform,
                "checks": [asdict(item) for item in checks],
            }
        finally:
            db.close()


publish_preflight_service = PublishPreflightService()
