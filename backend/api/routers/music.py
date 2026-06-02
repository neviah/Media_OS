# backend/api/routers/music.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Music
from backend.schemas.music import MusicCreate, MusicResponse, MusicUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=MusicResponse, status_code=status.HTTP_201_CREATED)
def create_music(music: MusicCreate, db: Session = Depends(get_db)):
    db_music = Music(**music.dict())
    db.add(db_music)
    db.commit()
    db.refresh(db_music)
    return db_music

@router.get("/", response_model=List[MusicResponse])
def read_music(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    music = db.query(Music).offset(skip).limit(limit).all()
    return music

@router.get("/{music_id}", response_model=MusicResponse)
def read_music(music_id: int, db: Session = Depends(get_db)):
    music = db.query(Music).filter(Music.id == music_id).first()
    if music is None:
        raise HTTPException(status_code=404, detail="Music not found")
    return music

@router.put("/{music_id}", response_model=MusicResponse)
def update_music(music_id: int, music: MusicUpdate, db: Session = Depends(get_db)):
    db_music = db.query(Music).filter(Music.id == music_id).first()
    if db_music is None:
        raise HTTPException(status_code=404, detail="Music not found")
    for key, value in music.dict(exclude_unset=True).items():
        setattr(db_music, key, value)
    db.commit()
    db.refresh(db_music)
    return db_music

@router.delete("/{music_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_music(music_id: int, db: Session = Depends(get_db)):
    db_music = db.query(Music).filter(Music.id == music_id).first()
    if db_music is None:
        raise HTTPException(status_code=404, detail="Music not found")
    db.delete(db_music)
    db.commit()
    return None