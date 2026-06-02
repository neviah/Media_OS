# backend/api/routers/avatars.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Avatar
from backend.schemas.avatar import AvatarCreate, AvatarResponse, AvatarUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=AvatarResponse, status_code=status.HTTP_201_CREATED)
def create_avatar(avatar: AvatarCreate, db: Session = Depends(get_db)):
    db_avatar = Avatar(**avatar.dict())
    db.add(db_avatar)
    db.commit()
    db.refresh(db_avatar)
    return db_avatar

@router.get("/", response_model=List[AvatarResponse])
def read_avatars(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    avatars = db.query(Avatar).offset(skip).limit(limit).all()
    return avatars

@router.get("/{avatar_id}", response_model=AvatarResponse)
def read_avatar(avatar_id: int, db: Session = Depends(get_db)):
    avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return avatar

@router.put("/{avatar_id}", response_model=AvatarResponse)
def update_avatar(avatar_id: int, avatar: AvatarUpdate, db: Session = Depends(get_db)):
    db_avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if db_avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    for key, value in avatar.dict(exclude_unset=True).items():
        setattr(db_avatar, key, value)
    db.commit()
    db.refresh(db_avatar)
    return db_avatar

@router.delete("/{avatar_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(avatar_id: int, db: Session = Depends(get_db)):
    db_avatar = db.query(Avatar).filter(Avatar.id == avatar_id).first()
    if db_avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    db.delete(db_avatar)
    db.commit()
    return None