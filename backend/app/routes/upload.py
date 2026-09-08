import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.config import UPLOAD_DIR
from app.schemas.scan_result import UploadResponse

router = APIRouter(tags=["upload"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        suffix = ".jpg"

    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}{suffix}"
    destination = UPLOAD_DIR / safe_name

    content = await file.read()
    destination.write_bytes(content)

    return UploadResponse(id=file_id, filename=safe_name)
