# backend/api/routers/workspaces.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.models.database import Workspace
from backend.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate
from backend.database import get_db

router = APIRouter()

@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(workspace: WorkspaceCreate, db: Session = Depends(get_db)):
    db_workspace = Workspace(**workspace.dict())
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)
    return db_workspace

@router.get("/", response_model=List[WorkspaceResponse])
def read_workspaces(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    workspaces = db.query(Workspace).offset(skip).limit(limit).all()
    return workspaces

@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def read_workspace(workspace_id: int, db: Session = Depends(get_db)):
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace

@router.put("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(workspace_id: int, workspace: WorkspaceUpdate, db: Session = Depends(get_db)):
    db_workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if db_workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    for key, value in workspace.dict(exclude_unset=True).items():
        setattr(db_workspace, key, value)
    db.commit()
    db.refresh(db_workspace)
    return db_workspace

@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(workspace_id: int, db: Session = Depends(get_db)):
    db_workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if db_workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    db.delete(db_workspace)
    db.commit()
    return None