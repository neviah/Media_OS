# backend/api/routers/news_sources.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import NewsSource
from backend.schemas.news_source import NewsSourceCreate, NewsSourceResponse, NewsSourceUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=NewsSourceResponse, status_code=status.HTTP_201_CREATED)
def create_news_source(news_source: NewsSourceCreate, db: Session = Depends(get_db)):
    db_news_source = NewsSource(**news_source.dict())
    db.add(db_news_source)
    db.commit()
    db.refresh(db_news_source)
    return db_news_source

@router.get("/", response_model=List[NewsSourceResponse])
def read_news_sources(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    news_sources = db.query(NewsSource).offset(skip).limit(limit).all()
    return news_sources

@router.get("/{news_source_id}", response_model=NewsSourceResponse)
def read_news_source(news_source_id: int, db: Session = Depends(get_db)):
    news_source = db.query(NewsSource).filter(NewsSource.id == news_source_id).first()
    if news_source is None:
        raise HTTPException(status_code=404, detail="News source not found")
    return news_source

@router.put("/{news_source_id}", response_model=NewsSourceResponse)
def update_news_source(news_source_id: int, news_source: NewsSourceUpdate, db: Session = Depends(get_db)):
    db_news_source = db.query(NewsSource).filter(NewsSource.id == news_source_id).first()
    if db_news_source is None:
        raise HTTPException(status_code=404, detail="News source not found")
    for key, value in news_source.dict(exclude_unset=True).items():
        setattr(db_news_source, key, value)
    db.commit()
    db.refresh(db_news_source)
    return db_news_source

@router.delete("/{news_source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_news_source(news_source_id: int, db: Session = Depends(get_db)):
    db_news_source = db.query(NewsSource).filter(NewsSource.id == news_source_id).first()
    if db_news_source is None:
        raise HTTPException(status_code=404, detail="News source not found")
    db.delete(db_news_source)
    db.commit()
    return None