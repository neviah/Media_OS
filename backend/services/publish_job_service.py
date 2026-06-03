import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Dict, Optional

from backend.pipelines.publishing import PublishingPipeline


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class PublishJob:
    id: str
    video_id: int
    platform: str
    schedule_time: Optional[float] = None
    idempotency_key: Optional[str] = None
    status: str = "queued"  # queued, running, retrying, succeeded, failed
    attempt: int = 0
    max_attempts: int = 3
    progress: int = 0
    detail: str = "queued"
    publish_log_id: Optional[int] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=_utcnow_iso)
    updated_at: str = field(default_factory=_utcnow_iso)


class PublishJobService:
    def __init__(self) -> None:
        self._jobs: Dict[str, PublishJob] = {}
        self._idempotency_index: Dict[str, str] = {}
        self._lock = threading.Lock()

    def enqueue(
        self,
        *,
        video_id: int,
        platform: str,
        schedule_time: Optional[float] = None,
        idempotency_key: Optional[str] = None,
        max_attempts: int = 3,
    ) -> PublishJob:
        with self._lock:
            if idempotency_key and idempotency_key in self._idempotency_index:
                existing_job = self._jobs[self._idempotency_index[idempotency_key]]
                return existing_job

            job = PublishJob(
                id=str(uuid.uuid4()),
                video_id=video_id,
                platform=platform,
                schedule_time=schedule_time,
                idempotency_key=idempotency_key,
                max_attempts=max(1, max_attempts),
            )
            self._jobs[job.id] = job
            if idempotency_key:
                self._idempotency_index[idempotency_key] = job.id

        worker = threading.Thread(target=self._run_job, args=(job.id,), daemon=True)
        worker.start()
        return job

    def get(self, job_id: str) -> Optional[PublishJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def _set_state(self, job: PublishJob, *, status: str, progress: int, detail: str, error: Optional[str] = None) -> None:
        with self._lock:
            job.status = status
            job.progress = progress
            job.detail = detail
            job.error = error
            job.updated_at = _utcnow_iso()

    def _run_job(self, job_id: str) -> None:
        job = self.get(job_id)
        if not job:
            return

        self._set_state(job, status="running", progress=10, detail="starting publish pipeline")

        while job.attempt < job.max_attempts:
            job.attempt += 1
            try:
                self._set_state(
                    job,
                    status="running" if job.attempt == 1 else "retrying",
                    progress=min(80, 20 + job.attempt * 20),
                    detail=f"publish attempt {job.attempt}/{job.max_attempts}",
                )

                pipeline = PublishingPipeline()
                result = pipeline.publish_video(
                    video_id=job.video_id,
                    platform=job.platform,
                    schedule_time=job.schedule_time,
                )

                if result is not None and getattr(result, "id", None) is not None and getattr(result, "status", "") != "failed":
                    with self._lock:
                        job.publish_log_id = result.id
                    self._set_state(job, status="succeeded", progress=100, detail="publish succeeded")
                    return

                failure_message = "publish pipeline returned failed result"
                if result is not None and getattr(result, "error_message", None):
                    failure_message = result.error_message

                if job.attempt < job.max_attempts:
                    self._set_state(
                        job,
                        status="retrying",
                        progress=min(90, 30 + job.attempt * 20),
                        detail=f"retrying after failure: {failure_message}",
                        error=failure_message,
                    )
                    time.sleep(min(6, job.attempt * 2))
                    continue

                self._set_state(job, status="failed", progress=100, detail="publish failed", error=failure_message)
                return
            except Exception as exc:
                if job.attempt < job.max_attempts:
                    self._set_state(
                        job,
                        status="retrying",
                        progress=min(90, 30 + job.attempt * 20),
                        detail=f"retrying after exception: {exc}",
                        error=str(exc),
                    )
                    time.sleep(min(6, job.attempt * 2))
                    continue
                self._set_state(job, status="failed", progress=100, detail="publish crashed", error=str(exc))
                return


publish_job_service = PublishJobService()
