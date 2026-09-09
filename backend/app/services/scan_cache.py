"""In-memory caches to avoid re-running expensive OCR / ELA / face-crop on the same document."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.services.graph import file_content_fingerprint

logger = logging.getLogger(__name__)


@dataclass
class DocumentPipelineEntry:
    extracted: dict[str, Any]
    validations: dict[str, Any]
    p_mrz: float
    p_ela: float
    anomaly_score: float
    ela_np: np.ndarray


class ScanCache:
    _document_pipeline: dict[str, DocumentPipelineEntry] = {}
    _ocr_fields: dict[str, dict[str, Any]] = {}
    _face_crops: dict[str, str] = {}

    @classmethod
    def document_key(cls, document_path: str) -> str:
        return file_content_fingerprint(document_path)

    @classmethod
    def get_document_pipeline(cls, document_path: str) -> DocumentPipelineEntry | None:
        return cls._document_pipeline.get(cls.document_key(document_path))

    @classmethod
    def set_document_pipeline(cls, document_path: str, entry: DocumentPipelineEntry) -> None:
        cls._document_pipeline[cls.document_key(document_path)] = entry
        logger.info("Cached document pipeline for %s", document_path)

    @classmethod
    def get_ocr_fields(cls, document_path: str) -> dict[str, Any] | None:
        return cls._ocr_fields.get(cls.document_key(document_path))

    @classmethod
    def set_ocr_fields(cls, document_path: str, extracted: dict[str, Any]) -> None:
        cls._ocr_fields[cls.document_key(document_path)] = extracted

    @classmethod
    def get_face_crop(cls, document_path: str) -> str | None:
        path = cls._face_crops.get(cls.document_key(document_path))
        if path:
            from pathlib import Path

            if Path(path).is_file():
                return path
        return None

    @classmethod
    def set_face_crop(cls, document_path: str, crop_path: str) -> None:
        cls._face_crops[cls.document_key(document_path)] = crop_path

    @classmethod
    def clear_face_crop(cls, document_path: str) -> None:
        cls._face_crops.pop(cls.document_key(document_path), None)

    @classmethod
    def clear(cls) -> None:
        cls._document_pipeline.clear()
        cls._ocr_fields.clear()
        cls._face_crops.clear()
