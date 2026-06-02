# backend/api/routers/videos.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Video
from backend.schemas.video import VideoCreate, VideoResponse, VideoUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
def create_video(video: VideoCreate, db: Session = Depends(get_db)):
    db_video = Video(**video.dict())
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video

@router.get("/", response_model=List[VideoResponse])
def read_videos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    videos = db.query(Video).offset(skip).limit(limit).all()
    return videos

@router.get("/{video_id}", response_model=VideoResponse)
def read_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@router.put("/{video_id}", response_model=VideoResponse)
def update_video(video_id: int, video: VideoUpdate, db: Session = Depends(get_db)):
    db_video = db.query(Video).filter(Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    for key, value in video.dict(exclude_unset=True).items():
        setattr(db_video, key, value)
    db.commit()
    db.refresh(db_video)
    return db_video

@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(Video).filter(Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    db.delete(db_video)
    db.commit()
    return None