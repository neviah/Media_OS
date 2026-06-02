# backend/schemas/audio.py (already done, but let's check if we need to adjust)
# We already created audio.py above.

# backend/api/routers/audios.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Audio
from backend.schemas.audio import AudioCreate, AudioResponse, AudioUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=AudioResponse, status_code=status.HTTP_201_CREATED)
def create_audio(audio: AudioCreate, db: Session = Depends(get_db)):
    db_audio = Audio(**audio.dict())
    db.add(db_audio)
    db.commit()
    db.refresh(db_audio)
    return db_audio

@router.get("/", response_model=List[AudioResponse])
def read_audios(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    audios = db.query(Audio).offset(skip).limit(limit).all()
    return audios

@router.get("/{audio_id}", response_model=AudioResponse)
def read_audio(audio_id: int, db: Session = Depends(get_db)):
    audio = db.query(Audio).filter(Audio.id == audio_id).first()
    if audio is None:
        raise HTTPException(status_code=404, detail="Audio not found")
    return audio

@router.put("/{audio_id}", response_model=AudioResponse)
def update_audio(audio_id: int, audio: AudioUpdate, db: Session = Depends(get_db)):
    db_audio = db.query(Audio).filter(Audio.id == audio_id).first()
    if db_audio is None:
        raise HTTPException(status_code=404, detail="Audio not found")
    for key, value in audio.dict(exclude_unset=True).items():
        setattr(db_audio, key, value)
    db.commit()
    db.refresh(db_audio)
    return db_audio

@router.delete("/{audio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_audio(audio_id: int, db: Session = Depends(get_db)):
    db_audio = db.query(Audio).filter(Audio.id == audio_id).first()
    if db_audio is None:
        raise HTTPException(status_code=404, detail="Audio not found")
    db.delete(db_audio)
    db.commit()
    return None