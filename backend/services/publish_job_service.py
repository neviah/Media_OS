from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, UTC, timedelta
from typing import Dict, Optional

from backend.database import SessionLocal
from backend.models.database import PublishJob as PublishJobRecord

try:
    import redis
    from rq import Queue
except ImportError:  # pragma: no cover - optional runtime backend
    redis = None
    Queue = None


def _utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class PublishJobSnapshot:
    id: str
    video_id: int
    platform: str
    status: str = "queued"
    attempt: int = 0
    max_attempts: int = 3
    progress: int = 0
    detail: str = "queued"
    publish_log_id: Optional[int] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    schedule_time: Optional[float] = None
    idempotency_key: Optional[str] = None
    workspace_id: Optional[int] = None
    channel_id: Optional[int] = None


class PublishJobService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._last_cycle_started_at: Optional[str] = None
        self._last_cycle_summary: Dict[str, int] = {"queued": 0, "running": 0, "retrying": 0, "succeeded": 0, "failed": 0}
        self._backend = __import__('os').getenv('MEDIAOS_PUBLISH_QUEUE_BACKEND', 'db').strip().lower()
        self._redis_conn = None
        self._rq_queue = None
        if self._backend == 'redis' and redis is not None and Queue is not None:
            redis_url = __import__('os').getenv('REDIS_URL', 'redis://localhost:6379')
            queue_name = __import__('os').getenv('MEDIAOS_PUBLISH_QUEUE_NAME', 'mediaos-publish')
            try:
                self._redis_conn = redis.from_url(redis_url)
                self._redis_conn.ping()
                self._rq_queue = Queue(queue_name, connection=self._redis_conn)
            except Exception:
                self._backend = 'db'

    def _snapshot_from_record(self, record: PublishJobRecord) -> PublishJobSnapshot:
        return PublishJobSnapshot(
            id=record.id,
            video_id=record.video_id,
            platform=record.platform,
            status=record.status,
            attempt=record.attempt or 0,
            max_attempts=record.max_attempts or 3,
            progress=record.progress or 0,
            detail=record.detail or 'queued',
            publish_log_id=record.publish_log_id,
            error=record.error_message,
            created_at=record.created_at.isoformat() if record.created_at else None,
            updated_at=record.updated_at.isoformat() if record.updated_at else None,
            schedule_time=record.schedule_time,
            idempotency_key=record.idempotency_key,
            workspace_id=record.workspace_id,
            channel_id=record.channel_id,
        )

    def _get_db(self):
        return SessionLocal()

    def enqueue(
        self,
        *,
        video_id: int,
        platform: str,
        workspace_id: int,
        channel_id: int,
        schedule_time: Optional[float] = None,
        idempotency_key: Optional[str] = None,
        max_attempts: int = 3,
    ) -> PublishJobSnapshot:
        if not workspace_id or not channel_id:
            raise ValueError('workspace_id and channel_id are required for persistent publish jobs')

        db = self._get_db()
        try:
            if idempotency_key:
                existing = db.query(PublishJobRecord).filter(PublishJobRecord.idempotency_key == idempotency_key).first()
                if existing:
                    return self._snapshot_from_record(existing)

            job_id = str(uuid.uuid4())
            record = PublishJobRecord(
                id=job_id,
                workspace_id=workspace_id,
                channel_id=channel_id,
                video_id=video_id,
                platform=platform,
                schedule_time=schedule_time,
                idempotency_key=idempotency_key,
                status='queued',
                attempt=0,
                max_attempts=max(1, max_attempts),
                progress=0,
                detail='queued',
                payload_json=json.dumps({
                    'video_id': video_id,
                    'platform': platform,
                    'schedule_time': schedule_time,
                    'idempotency_key': idempotency_key,
                }),
            )
            db.add(record)
            db.commit()
            db.refresh(record)

            if self._backend == 'redis' and self._rq_queue is not None:
                try:
                    self._rq_queue.enqueue(
                        'backend.services.publish_job_service.process_publish_job_record',
                        record.id,
                        job_timeout='20m',
                        result_ttl=86400,
                        failure_ttl=86400,
                    )
                except Exception:
                    # Keep DB record queued; local worker or external worker can still process it.
                    pass

            return self._snapshot_from_record(record)
        finally:
            db.close()

    def get(self, job_id: str) -> Optional[PublishJobSnapshot]:
        db = self._get_db()
        try:
            record = db.query(PublishJobRecord).filter(PublishJobRecord.id == job_id).first()
            if record is None:
                return None
            return self._snapshot_from_record(record)
        finally:
            db.close()

    def _set_state(self, db, record: PublishJobRecord, *, status: str, progress: int, detail: str, error: Optional[str] = None) -> None:
        record.status = status
        record.progress = progress
        record.detail = detail
        record.error_message = error
        record.updated_at = _utcnow()
        if status == 'running' and record.started_at is None:
            record.started_at = _utcnow()
        if status in {'succeeded', 'failed'}:
            record.completed_at = _utcnow()

    def _recover_stale_jobs(self, db) -> None:
        stale_seconds = int(__import__('os').getenv('MEDIAOS_PUBLISH_JOB_STALE_SECONDS', '600'))
        cutoff_ts = (_utcnow() - timedelta(seconds=stale_seconds)).timestamp()
        stale_jobs = db.query(PublishJobRecord).filter(
            PublishJobRecord.status.in_(['running', 'retrying'])
        ).all()
        for record in stale_jobs:
            if record.updated_at:
                updated_ts = (
                    record.updated_at.timestamp()
                    if record.updated_at.tzinfo is not None
                    else record.updated_at.replace(tzinfo=UTC).timestamp()
                )
                if updated_ts >= cutoff_ts:
                    continue
            record.status = 'queued'
            record.progress = min(record.progress or 0, 10)
            record.detail = 'recovered after restart'
            record.updated_at = _utcnow()
        db.commit()

    def _find_next_job(self, db) -> Optional[PublishJobRecord]:
        now_ts = time.time()
        return (
            db.query(PublishJobRecord)
            .filter(
                PublishJobRecord.status.in_(['queued', 'retrying']),
                ((PublishJobRecord.schedule_time.is_(None)) | (PublishJobRecord.schedule_time <= now_ts)),
            )
            .order_by(PublishJobRecord.created_at.asc())
            .first()
        )

    def _process_record(self, record_id: str) -> None:
        db = self._get_db()
        try:
            record = db.query(PublishJobRecord).filter(PublishJobRecord.id == record_id).first()
            if record is None:
                return

            from backend.pipelines.publishing import PublishingPipeline

            pipeline = PublishingPipeline()
            self._set_state(db, record, status='running', progress=10, detail='starting publish pipeline')
            db.commit()

            while record.attempt < (record.max_attempts or 3):
                record.attempt += 1
                db.commit()
                try:
                    self._set_state(
                        db,
                        record,
                        status='running' if record.attempt == 1 else 'retrying',
                        progress=min(80, 20 + record.attempt * 20),
                        detail=f'publish attempt {record.attempt}/{record.max_attempts}',
                    )
                    db.commit()

                    result = pipeline.publish_video(
                        video_id=record.video_id,
                        platform=record.platform,
                        schedule_time=record.schedule_time,
                    )

                    success = bool(result and getattr(result, 'status', '') not in {'failed'} and getattr(result, 'id', None) is not None)
                    if success:
                        record.publish_log_id = getattr(result, 'id', None)
                        self._set_state(db, record, status='succeeded', progress=100, detail='publish succeeded', error=None)
                        db.commit()
                        return

                    error_message = 'publish pipeline returned failed result'
                    if result is not None and getattr(result, 'error_message', None):
                        error_message = result.error_message

                    if record.attempt < record.max_attempts:
                        self._set_state(
                            db,
                            record,
                            status='retrying',
                            progress=min(90, 30 + record.attempt * 20),
                            detail=f'retrying after failure: {error_message}',
                            error=error_message,
                        )
                        db.commit()
                        time.sleep(min(6, record.attempt * 2))
                        continue

                    self._set_state(db, record, status='failed', progress=100, detail='publish failed', error=error_message)
                    db.commit()
                    return
                except Exception as exc:
                    if record.attempt < record.max_attempts:
                        self._set_state(
                            db,
                            record,
                            status='retrying',
                            progress=min(90, 30 + record.attempt * 20),
                            detail=f'retrying after exception: {exc}',
                            error=str(exc),
                        )
                        db.commit()
                        time.sleep(min(6, record.attempt * 2))
                        continue
                    self._set_state(db, record, status='failed', progress=100, detail='publish crashed', error=str(exc))
                    db.commit()
                    return
        finally:
            db.close()

    def _worker_loop(self) -> None:
        db = self._get_db()
        try:
            self._recover_stale_jobs(db)
        finally:
            db.close()

        while self._running:
            db = self._get_db()
            try:
                self._last_cycle_started_at = _utcnow().isoformat()
                queue_counts = {
                    'queued': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'queued').count(),
                    'running': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'running').count(),
                    'retrying': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'retrying').count(),
                    'succeeded': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'succeeded').count(),
                    'failed': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'failed').count(),
                }
                self._last_cycle_summary = queue_counts

                next_job = self._find_next_job(db)
                if next_job is not None:
                    job_id = next_job.id
                    db.close()
                    self._process_record(job_id)
                    time.sleep(0.2)
                    continue
            finally:
                try:
                    db.close()
                except Exception:
                    pass

            time.sleep(1)

    def start(self) -> None:
        if self._running:
            return
        enabled = __import__('os').getenv('MEDIAOS_PUBLISH_QUEUE_ENABLED', '1') == '1'
        if not enabled:
            return

        if self._backend == 'redis':
            # In redis backend mode, processing is delegated to external RQ workers.
            self._running = True
            return

        self._running = True
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()

    def stop(self) -> None:
        self._running = False

    def status(self) -> Dict[str, object]:
        db = self._get_db()
        try:
            redis_queue_count = None
            if self._rq_queue is not None:
                try:
                    redis_queue_count = self._rq_queue.count
                except Exception:
                    redis_queue_count = None

            return {
                'backend': self._backend,
                'running': self._running,
                'worker_thread_alive': bool(self._worker_thread and self._worker_thread.is_alive()),
                'redis_queue_available': bool(self._rq_queue is not None),
                'redis_queue_count': redis_queue_count,
                'last_cycle_started_at': self._last_cycle_started_at,
                'last_cycle_summary': self._last_cycle_summary,
                'counts': {
                    'queued': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'queued').count(),
                    'running': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'running').count(),
                    'retrying': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'retrying').count(),
                    'succeeded': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'succeeded').count(),
                    'failed': db.query(PublishJobRecord).filter(PublishJobRecord.status == 'failed').count(),
                },
            }
        finally:
            db.close()


publish_job_service = PublishJobService()


def process_publish_job_record(record_id: str) -> None:
    """Entry point for Redis/RQ workers to process a single DB-backed publish job."""
    publish_job_service._process_record(record_id)
