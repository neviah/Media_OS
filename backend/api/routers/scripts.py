# backend/api/routers/scripts.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Script
from backend.schemas.script import ScriptCreate, ScriptResponse, ScriptUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=ScriptResponse, status_code=status.HTTP_201_CREATED)
def create_script(script: ScriptCreate, db: Session = Depends(get_db)):
    db_script = Script(**script.dict())
    db.add(db_script)
    db.commit()
    db.refresh(db_script)
    return db_script

@router.get("/", response_model=List[ScriptResponse])
def read_scripts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    scripts = db.query(Script).offset(skip).limit(limit).all()
    return scripts

@router.get("/{script_id}", response_model=ScriptResponse)
def read_script(script_id: int, db: Session = Depends(get_db)):
    script = db.query(Script).filter(Script.id == script_id).first()
    if script is None:
        raise HTTPException(status_code=404, detail="Script not found")
    return script

@router.put("/{script_id}", response_model=ScriptResponse)
def update_script(script_id: int, script: ScriptUpdate, db: Session = Depends(get_db)):
    db_script = db.query(Script).filter(Script.id == script_id).first()
    if db_script is None:
        raise HTTPException(status_code=404, detail="Script not found")
    for key, value in script.dict(exclude_unset=True).items():
        setattr(db_script, key, value)
    db.commit()
    db.refresh(db_script)
    return db_script

@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_script(script_id: int, db: Session = Depends(get_db)):
    db_script = db.query(Script).filter(Script.id == script_id).first()
    if db_script is None:
        raise HTTPException(status_code=404, detail="Script not found")
    db.delete(db_script)
    db.commit()
    return None