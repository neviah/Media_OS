# backend/api/main.py
from fastapi import APIRouter
from .routers import workspaces, avatars, channels, music, news_sources, scripts, audios, videos, publish_logs, metrics, pipelines

api_router = APIRouter()

# Include all routers
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(avatars.router, prefix="/avatars", tags=["avatars"])
api_router.include_router(channels.router, prefix="/channels", tags=["channels"])
api_router.include_router(music.router, prefix="/music", tags=["music"])
api_router.include_router(news_sources.router, prefix="/news-sources", tags=["news-sources"])
api_router.include_router(scripts.router, prefix="/scripts", tags=["scripts"])
api_router.include_router(audios.router, prefix="/audios", tags=["audios"])
api_router.include_router(videos.router, prefix="/videos", tags=["videos"])
api_router.include_router(publish_logs.router, prefix="/publish-logs", tags=["publish-logs"])
api_router.include_router(metrics.router, prefix="/metrics", tags=["metrics"])
api_router.include_router(pipelines.router, prefix="/pipelines", tags=["pipelines"])

# Health check endpoint
@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}