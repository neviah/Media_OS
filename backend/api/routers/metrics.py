# backend/api/routers/metrics.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Metrics
from backend.schemas.metrics import MetricsCreate, MetricsResponse, MetricsUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=MetricsResponse, status_code=status.HTTP_201_CREATED)
def create_metrics(metrics: MetricsCreate, db: Session = Depends(get_db)):
    db_metrics = Metrics(**metrics.dict())
    db.add(db_metrics)
    db.commit()
    db.refresh(db_metrics)
    return db_metrics

@router.get("/", response_model=List[MetricsResponse])
def read_metrics(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    metrics = db.query(Metrics).offset(skip).limit(limit).all()
    return metrics

@router.get("/{metrics_id}", response_model=MetricsResponse)
def read_metrics(metrics_id: int, db: Session = Depends(get_db)):
    metrics = db.query(Metrics).filter(Metrics.id == metrics_id).first()
    if metrics is None:
        raise HTTPException(status_code=404, detail="Metrics not found")
    return metrics

@router.put("/{metrics_id}", response_model=MetricsResponse)
def update_metrics(metrics_id: int, metrics: MetricsUpdate, db: Session = Depends(get_db)):
    db_metrics = db.query(Metrics).filter(Metrics.id == metrics_id).first()
    if db_metrics is None:
        raise HTTPException(status_code=404, detail="Metrics not found")
    for key, value in metrics.dict(exclude_unset=True).items():
        setattr(db_metrics, key, value)
    db.commit()
    db.refresh(db_metrics)
    return db_metrics

@router.delete("/{metrics_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_metrics(metrics_id: int, db: Session = Depends(get_db)):
    db_metrics = db.query(Metrics).filter(Metrics.id == metrics_id).first()
    if db_metrics is None:
        raise HTTPException(status_code=404, detail="Metrics not found")
    db.delete(db_metrics)
    db.commit()
    return None