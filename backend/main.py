from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from backend.api.main import api_router
from backend.database import engine
from backend.models.database import Base

app = FastAPI(title="Media Control Center API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    # Ensure local SQLite tables exist for first-run development.
    Base.metadata.create_all(bind=engine)


app.include_router(api_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Media Control Center API"}

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)