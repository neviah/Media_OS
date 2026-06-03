from fastapi import APIRouter

from backend.services.llm_service import llm_service
from backend.services.publish_job_service import publish_job_service
from backend.services.publish_preflight_service import publish_preflight_service
from backend.services.token_lifecycle_service import token_lifecycle_service

router = APIRouter()


@router.get('/llm-status')
def llm_status():
    return llm_service.get_runtime_status()


@router.get('/token-lifecycle-status')
def token_lifecycle_status():
    return token_lifecycle_service.status()


@router.post('/token-refresh-now')
def token_refresh_now():
    summary = token_lifecycle_service.run_refresh_cycle(force=True)
    return {'success': True, 'summary': summary}


@router.get('/publish-queue-status')
def publish_queue_status():
    return publish_job_service.status()


@router.get('/publish-preflight')
def publish_preflight(video_id: int, platform: str):
    return publish_preflight_service.run(video_id=video_id, platform=platform)
