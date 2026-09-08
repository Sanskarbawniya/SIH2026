import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, UPLOAD_DIR
from app.routes import api_router
from app.services.ocr import DocumentOCRProcessor

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    if DocumentOCRProcessor.warmup():
        logger.info("Phase 1 OCR model ready at startup")
    else:
        logger.warning("OCR model not loaded — install python-doctr[torch]")
    yield


app = FastAPI(
    title="AI Fake Identity & Document Screening System",
    description="SIH 2026 — Border checkpoint identity verification pipeline",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
