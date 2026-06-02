from fastapi import APIRouter

from backend.services.llm_service import llm_service

router = APIRouter()


@router.get('/llm-status')
def llm_status():
    return llm_service.get_runtime_status()
