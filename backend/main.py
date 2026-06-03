import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from backend.api.main import api_router
from backend.database import engine
from backend.models.database import Base
from backend.services.publish_job_service import publish_job_service
from backend.services.token_lifecycle_service import token_lifecycle_service

app = FastAPI(title="Media Control Center API")

AUTH_ENABLED = os.getenv("MEDIAOS_AUTH_ENABLED", "0") == "1"
AUTH_API_KEY = os.getenv("MEDIAOS_API_KEY", "")
WRITE_ROLES = {"editor", "admin"}
ADMIN_ONLY_PREFIXES = ("/api/pipelines/publish",)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not AUTH_ENABLED:
        return await call_next(request)

    path = request.url.path
    method = request.method.upper()

    if method == "OPTIONS":
        return await call_next(request)

    if path in {"/", "/api/health", "/openapi.json", "/docs", "/redoc"}:
        return await call_next(request)

    provided_api_key = request.headers.get("x-api-key", "")
    if not AUTH_API_KEY or provided_api_key != AUTH_API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Invalid API key"})

    role = request.headers.get("x-user-role", "viewer").strip().lower()

    if method in {"POST", "PUT", "PATCH", "DELETE"} and role not in WRITE_ROLES:
        return JSONResponse(status_code=403, content={"detail": "Insufficient role for write access"})

    if any(path.startswith(prefix) for prefix in ADMIN_ONLY_PREFIXES) and role != "admin":
        return JSONResponse(status_code=403, content={"detail": "Admin role required"})

    return await call_next(request)


@app.on_event("startup")
async def startup_event():
    # Ensure local SQLite tables exist for first-run development.
    Base.metadata.create_all(bind=engine)
    publish_job_service.start()
    token_lifecycle_service.start()


@app.on_event("shutdown")
async def shutdown_event():
    publish_job_service.stop()
    token_lifecycle_service.stop()


app.include_router(api_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Media Control Center API"}

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)