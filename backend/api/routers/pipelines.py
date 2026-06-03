from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.database import Video
from backend.services.publish_job_service import publish_job_service

router = APIRouter()


def _get_news_to_script_pipeline_cls():
    from backend.pipelines.news_to_script import NewsToScriptPipeline

    return NewsToScriptPipeline


def _get_script_to_voice_pipeline_cls():
    from backend.pipelines.script_to_voice import ScriptToVoicePipeline

    return ScriptToVoicePipeline


def _get_voice_to_avatar_pipeline_cls():
    from backend.pipelines.voice_to_avatar_video import VoiceToAvatarVideoPipeline

    return VoiceToAvatarVideoPipeline


def _get_video_assembly_pipeline_cls():
    from backend.pipelines.video_assembly import VideoAssemblyPipeline

    return VideoAssemblyPipeline


def _get_publishing_pipeline_cls():
    from backend.pipelines.publishing import PublishingPipeline

    return PublishingPipeline


class NewsToScriptRequest(BaseModel):
    workspace_id: int
    channel_id: int
    news_source_id: Optional[int] = None


class ScriptToVoiceRequest(BaseModel):
    script_id: int


class VoiceToAvatarRequest(BaseModel):
    audio_id: int


class VideoAssemblyRequest(BaseModel):
    video_id: int
    music_id: Optional[int] = None
    b_roll_prompts: Optional[List[str]] = None


class PublishRequest(BaseModel):
    video_id: int
    platform: str
    schedule_time: Optional[float] = None


class PublishAsyncRequest(BaseModel):
    video_id: int
    platform: str
    schedule_time: Optional[float] = None
    idempotency_key: Optional[str] = None
    max_attempts: int = 3


@router.post('/news-to-script')
def trigger_news_to_script(payload: NewsToScriptRequest):
    pipeline = _get_news_to_script_pipeline_cls()()
    created = pipeline.process_news_to_script(
        workspace_id=payload.workspace_id,
        channel_id=payload.channel_id,
        news_source_id=payload.news_source_id,
    )
    if created is None:
        return {'success': False, 'detail': 'news_to_script failed'}
    return {'success': True, 'script_id': created.id, 'detail': 'news_to_script complete'}


@router.post('/script-to-voice')
def trigger_script_to_voice(payload: ScriptToVoiceRequest):
    pipeline = _get_script_to_voice_pipeline_cls()()
    created = pipeline.process_script_to_voice(script_id=payload.script_id)
    if created is None:
        return {'success': False, 'detail': 'script_to_voice failed'}
    return {'success': True, 'audio_id': created.id, 'detail': 'script_to_voice complete'}


@router.post('/voice-to-avatar-video')
def trigger_voice_to_avatar_video(payload: VoiceToAvatarRequest):
    pipeline = _get_voice_to_avatar_pipeline_cls()()
    created = pipeline.process_voice_to_avatar_video(audio_id=payload.audio_id)
    if created is None:
        return {'success': False, 'detail': 'voice_to_avatar_video failed'}
    return {'success': True, 'video_id': created.id, 'detail': 'voice_to_avatar_video complete'}


@router.post('/video-assembly')
def trigger_video_assembly(payload: VideoAssemblyRequest):
    pipeline = _get_video_assembly_pipeline_cls()()
    updated = pipeline.process_video_assembly(
        video_id=payload.video_id,
        music_id=payload.music_id,
        b_roll_prompts=payload.b_roll_prompts,
    )
    if updated is None:
        return {'success': False, 'detail': 'video_assembly failed'}
    return {'success': True, 'video_id': updated.id, 'detail': 'video_assembly complete'}


@router.post('/publish')
def trigger_publish(payload: PublishRequest):
    pipeline = _get_publishing_pipeline_cls()()
    created = pipeline.publish_video(
        video_id=payload.video_id,
        platform=payload.platform,
        schedule_time=payload.schedule_time,
    )
    if created is None:
        return {'success': False, 'detail': 'publish failed'}
    return {'success': True, 'publish_log_id': created.id, 'detail': 'publish flow complete'}


@router.post('/publish-async')
def trigger_publish_async(payload: PublishAsyncRequest, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == payload.video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail='Video not found')

    job = publish_job_service.enqueue(
        video_id=payload.video_id,
        platform=payload.platform,
        workspace_id=video.workspace_id,
        channel_id=video.channel_id,
        schedule_time=payload.schedule_time,
        idempotency_key=payload.idempotency_key,
        max_attempts=payload.max_attempts,
    )
    return {
        'success': True,
        'job_id': job.id,
        'status': job.status,
        'attempt': job.attempt,
        'max_attempts': job.max_attempts,
        'idempotency_key': job.idempotency_key,
    }


@router.get('/publish-jobs/{job_id}')
def get_publish_job_status(job_id: str):
    job = publish_job_service.get(job_id)
    if job is None:
        return {'success': False, 'detail': 'job not found'}

    return {
        'success': True,
        'job': {
            'id': job.id,
            'video_id': job.video_id,
            'platform': job.platform,
            'status': job.status,
            'attempt': job.attempt,
            'max_attempts': job.max_attempts,
            'progress': job.progress,
            'detail': job.detail,
            'publish_log_id': job.publish_log_id,
            'error': job.error,
            'created_at': job.created_at,
            'updated_at': job.updated_at,
        },
    }
