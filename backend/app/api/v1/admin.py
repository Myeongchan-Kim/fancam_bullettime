from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from ...crawler.recheck_worker import run_recheck_job, recheck_status
from .utils import verify_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.post("/recheck/start")
def start_recheck(background_tasks: BackgroundTasks, admin: bool = Depends(verify_admin)):
    if recheck_status["status"] == "Running": raise HTTPException(status_code=400, detail="Recheck job is already running")
    background_tasks.add_task(run_recheck_job)
    return {"message": "Recheck job started"}

@router.get("/recheck/status")
def get_recheck_status(admin: bool = Depends(verify_admin)):
    return recheck_status
