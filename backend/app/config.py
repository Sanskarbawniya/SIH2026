import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "ela").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "preprocessed").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "faces").mkdir(parents=True, exist_ok=True)
