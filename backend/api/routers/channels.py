# backend/api/routers/channels.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Channel
from backend.schemas.channel import ChannelCreate, ChannelResponse, ChannelUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
def create_channel(channel: ChannelCreate, db: Session = Depends(get_db)):
    db_channel = Channel(**channel.dict())
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)
    return db_channel

@router.get("/", response_model=List[ChannelResponse])
def read_channels(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    channels = db.query(Channel).offset(skip).limit(limit).all()
    return channels

@router.get("/{channel_id}", response_model=ChannelResponse)
def read_channel(channel_id: int, db: Session = Depends(get_db)):
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel

@router.put("/{channel_id}", response_model=ChannelResponse)
def update_channel(channel_id: int, channel: ChannelUpdate, db: Session = Depends(get_db)):
    db_channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    for key, value in channel.dict(exclude_unset=True).items():
        setattr(db_channel, key, value)
    db.commit()
    db.refresh(db_channel)
    return db_channel

@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    db_channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    db.delete(db_channel)
    db.commit()
    return None