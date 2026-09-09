import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import UPLOAD_DIR
from app.schemas.scan_result import ScanResult
from app.services.graph import IdentityGraphEngine
from app.services.scan_cache import ScanCache
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


@router.post("/scan/liveness", response_model=ScanResult)
async def scan_liveness(
    document: UploadFile = File(...),
    selfie: UploadFile = File(...),
):
    """Phase 7: Anti-spoof liveness on selfie, then face match if live."""
    scan_id, doc_path = await _save_upload(document, "doc")
    _, selfie_path_obj = await _save_upload(selfie, "selfie")
    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_liveness_scan(
            str(doc_path),
            str(selfie_path_obj),
            scan_id=scan_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/scan/graph", response_model=ScanResult)
async def scan_graph(
    document: UploadFile = File(...),
    selfie: UploadFile = File(...),
):
    """Phase 6: Full pipeline + identity graph fraud loop detection."""
    scan_id, doc_path = await _save_upload(document, "doc")
    _, selfie_path_obj = await _save_upload(selfie, "selfie")
    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_graph_scan(
            str(doc_path),
            str(selfie_path_obj),
            scan_id=scan_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/scan/full", response_model=ScanResult)
async def scan_full(
    document: UploadFile = File(...),
    selfie: UploadFile | None = File(None),
):
    """Phase 5: unified end-to-end scan → composite risk score 0–100."""
    scan_id, doc_path = await _save_upload(document, "doc")
    selfie_path = None
    if selfie and selfie.filename:
        _, selfie_path_obj = await _save_upload(selfie, "selfie")
        selfie_path = str(selfie_path_obj)

    orchestrator = get_orchestrator()
    try:
        return orchestrator.run_unified_scan(str(doc_path), selfie_path, scan_id=scan_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/graph/alerts")
def graph_alerts():
    engine = IdentityGraphEngine.get_instance()
    return {"alerts": engine.get_alerts()}


@router.get("/graph/stats")
def graph_stats():
    engine = IdentityGraphEngine.get_instance()
    return engine.get_stats()


@router.delete("/graph/reset")
def graph_reset():
    """Clear in-memory graph — useful between SIH demo runs."""
    engine = IdentityGraphEngine.get_instance()
    engine.clear()
    ScanCache.clear()
    return {"status": "cleared"}
