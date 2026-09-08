import uuid
from pathlib import Path
from typing import Callable, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import UPLOAD_DIR
from app.schemas.scan_result import ScanResult
from app.services.graph import IdentityGraphEngine
from app.services.orchestrator import get_orchestrator

router = APIRouter(tags=["scan"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


async def _save_upload(upload: UploadFile, prefix: str) -> tuple[str, Path]:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        suffix = ".jpg"
    scan_id = str(uuid.uuid4())
    filename = f"{prefix}_{scan_id}{suffix}"
    path = UPLOAD_DIR / filename
    content = await upload.read()
    path.write_bytes(content)
    return scan_id, path


@router.post("/scan/ocr", response_model=ScanResult)
async def scan_ocr(document: UploadFile = File(...)):
    """Phase 1: OCR + structured field extraction only."""
    scan_id, doc_path = await _save_upload(document, "doc")
    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_ocr_scan(str(doc_path), scan_id=scan_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/scan/document", response_model=ScanResult)
async def scan_document(document: UploadFile = File(...)):
    """Phase 2: OCR + rule validation (PAN / Verhoeff / MRZ) → P_mrz."""
    scan_id, doc_path = await _save_upload(document, "doc")
    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_validation_scan(str(doc_path), scan_id=scan_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/scan/forensics", response_model=ScanResult)
async def scan_forensics(document: UploadFile = File(...)):
    """Phase 3: OCR + validation + ELA tampering analysis → P_ela."""
    scan_id, doc_path = await _save_upload(document, "doc")
    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_forensics_scan(str(doc_path), scan_id=scan_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/scan/face", response_model=ScanResult)
async def scan_face(
    document: UploadFile = File(...),
    selfie: UploadFile = File(...),
):
    """Phase 4: Document + selfie → ArcFace 1:1 match → P_face (no liveness)."""
    scan_id, doc_path = await _save_upload(document, "doc")
    _, selfie_path_obj = await _save_upload(selfie, "selfie")
    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_face_scan(
            str(doc_path),
            str(selfie_path_obj),
            scan_id=scan_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/scan/full")
async def scan_full(
    document: UploadFile = File(...),
    selfie: UploadFile | None = File(None),
):
    scan_id, doc_path = await _save_upload(document, "doc")
    selfie_path = None
    if selfie and selfie.filename:
        _, selfie_path_obj = await _save_upload(selfie, "selfie")
        selfie_path = str(selfie_path_obj)

    use_async = _celery_available()
    if use_async:
        from app.tasks.scan_task import run_scan_task

        task = run_scan_task.delay(str(doc_path), selfie_path, scan_id)
        return {"job_id": task.id, "scan_id": scan_id}

    orchestrator = get_orchestrator()
    try:
        result = orchestrator.run_full_scan(str(doc_path), selfie_path, scan_id=scan_id)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/scan/{job_id}/status")
def get_scan_status(job_id: str):
    if not _celery_available():
        return {
            "job_id": job_id,
            "status": "failed",
            "progress": 0,
            "step": "Celery unavailable",
            "result": None,
            "error": "Async queue not configured. Start Redis and Celery worker, or disable async mode.",
        }

    from celery.result import AsyncResult

    from app.tasks.scan_task import celery_app

    task = AsyncResult(job_id, app=celery_app)
    meta = task.info or {}

    if task.state == "PENDING":
        return {
            "job_id": job_id,
            "status": "pending",
            "progress": 0,
            "step": "Queued",
            "result": None,
            "error": None,
        }
    if task.state == "PROGRESS":
        return {
            "job_id": job_id,
            "status": "processing",
            "progress": meta.get("progress", 0),
            "step": meta.get("step", "Processing"),
            "result": None,
            "error": None,
        }
    if task.state == "SUCCESS":
        return {
            "job_id": job_id,
            "status": "completed",
            "progress": 100,
            "step": "Score",
            "result": task.result,
            "error": None,
        }
    return {
        "job_id": job_id,
        "status": "failed",
        "progress": meta.get("progress", 0) if isinstance(meta, dict) else 0,
        "step": "Failed",
        "result": None,
        "error": str(task.info) if task.info else "Task failed",
    }


@router.get("/graph/alerts")
def graph_alerts():
    engine = IdentityGraphEngine.get_instance()
    return {"alerts": engine.get_alerts()}


def _celery_available() -> bool:
    try:
        import os

        import redis

        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        client = redis.from_url(url, socket_connect_timeout=1)
        client.ping()
        return True
    except Exception:
        return False
