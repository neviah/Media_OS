from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

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
