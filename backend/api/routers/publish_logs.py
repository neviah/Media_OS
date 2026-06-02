# backend/api/routers/publish_logs.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import PublishLog
from backend.schemas.publish_log import PublishLogCreate, PublishLogResponse, PublishLogUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=PublishLogResponse, status_code=status.HTTP_201_CREATED)
def create_publish_log(publish_log: PublishLogCreate, db: Session = Depends(get_db)):
    db_publish_log = PublishLog(**publish_log.dict())
    db.add(db_publish_log)
    db.commit()
    db.refresh(db_publish_log)
    return db_publish_log

@router.get("/", response_model=List[PublishLogResponse])
def read_publish_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    publish_logs = db.query(PublishLog).offset(skip).limit(limit).all()
    return publish_logs

@router.get("/{publish_log_id}", response_model=PublishLogResponse)
def read_publish_log(publish_log_id: int, db: Session = Depends(get_db)):
    publish_log = db.query(PublishLog).filter(PublishLog.id == publish_log_id).first()
    if publish_log is None:
        raise HTTPException(status_code=404, detail="Publish log not found")
    return publish_log

@router.put("/{publish_log_id}", response_model=PublishLogResponse)
def update_publish_log(publish_log_id: int, publish_log: PublishLogUpdate, db: Session = Depends(get_db)):
    db_publish_log = db.query(PublishLog).filter(PublishLog.id == publish_log_id).first()
    if db_publish_log is None:
        raise HTTPException(status_code=404, detail="Publish log not found")
    for key, value in publish_log.dict(exclude_unset=True).items():
        setattr(db_publish_log, key, value)
    db.commit()
    db.refresh(db_publish_log)
    return db_publish_log

@router.delete("/{publish_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_publish_log(publish_log_id: int, db: Session = Depends(get_db)):
    db_publish_log = db.query(PublishLog).filter(PublishLog.id == publish_log_id).first()
    if db_publish_log is None:
        raise HTTPException(status_code=404, detail="Publish log not found")
    db.delete(db_publish_log)
    db.commit()
    return None