import logging
import re
import tempfile
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class DocumentOCRProcessor:
    _instance: Optional["DocumentOCRProcessor"] = None

    def __init__(self):
        try:
            from doctr.io import DocumentFile
            from doctr.models import ocr_predictor

            self._DocumentFile = DocumentFile
            logger.info("Loading docTR OCR model (db_resnet50 + crnn_vgg16_bn)...")
            load_start = time.perf_counter()
            self.model = ocr_predictor(
                det_arch="db_resnet50",
                reco_arch="crnn_vgg16_bn",
                pretrained=True,
            )
            logger.info("docTR model loaded in %.1fs", time.perf_counter() - load_start)
            self._available = True
        except (ImportError, ValueError) as exc:
            self._DocumentFile = None
            self.model = None
            self._available = False
            self._import_error = str(exc)
            logger.error("docTR unavailable: %s", exc)

    @classmethod
    def get_instance(cls) -> "DocumentOCRProcessor":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def warmup(cls) -> bool:
        """Load OCR model once at application startup."""
        processor = cls.get_instance()
        return processor._available

    @staticmethod
    def deskew(gray: np.ndarray) -> np.ndarray:
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)
        if lines is None:
            return gray

        angles: list[float] = []
        for line in lines[:25]:
            rho, theta = line[0]
            angle = (theta * 180 / np.pi) - 90
            if -45 < angle < 45:
                angles.append(float(angle))

        if not angles:
            return gray

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:
            return gray

        h, w = gray.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        return cv2.warpAffine(
            gray,
            matrix,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )

    @classmethod
    def preprocess(cls, image_path: str) -> tuple[np.ndarray, Path]:
        """Apply CLAHE illumination correction and optional deskew."""
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        deskewed = cls.deskew(enhanced)

        bgr = cv2.cvtColor(deskewed, cv2.COLOR_GRAY2BGR)
        out_dir = Path(image_path).parent / "preprocessed"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{Path(image_path).stem}_prep.jpg"
        cv2.imwrite(str(out_path), bgr)
        return deskewed, out_path

    @staticmethod
    def _parse_fields(full_text: str) -> dict:
        compact = re.sub(r"\s+", "", full_text.upper())
        normalized = re.sub(r"[ \t]+", " ", full_text)

        pan_match = re.search(r"[A-Z]{5}[0-9]{4}[A-Z]", compact)

        aadhaar_number = None
        spaced = re.search(r"\b(\d{4}\s\d{4}\s\d{4})\b", full_text)
        if spaced:
            aadhaar_number = re.sub(r"\s", "", spaced.group(1))
        else:
            labeled = re.search(
                r"(?:Aadhaar|UID|आधार)[:\s]*(\d{4}\s?\d{4}\s?\d{4})",
                full_text,
                re.IGNORECASE,
            )
            if labeled:
                aadhaar_number = re.sub(r"\s", "", labeled.group(1))

        passport_match = re.search(r"\b[A-Z]{1,2}[0-9]{7,8}\b", compact)
        dob_match = re.search(
            r"\b(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})\b",
            normalized,
        )

        name = None
        name_patterns = (
            r"(?:Name|NAME|नाम)[:\s/]+([A-Za-z][A-Za-z .]{1,40})",
            r"(?:^|\n)\s*To\s*\n\s*([A-Za-z][A-Za-z .]{1,40})",
            r"(?:Permanent Account Number|PAN)[^\n]*\n\s*([A-Za-z][A-Za-z .]{1,40})",
        )
        for pattern in name_patterns:
            name_match = re.search(pattern, normalized, re.IGNORECASE | re.MULTILINE)
            if name_match:
                name = name_match.group(1).strip()
                break

        return {
            "raw_text": full_text,
            "pan_number": pan_match.group(0) if pan_match else None,
            "aadhaar_number": aadhaar_number,
            "passport_number": passport_match.group(0) if passport_match else None,
            "name": name,
            "dob": dob_match.group(1) if dob_match else None,
        }

    def extract_fields(self, image_path: str) -> dict:
        if not self._available:
            raise RuntimeError(
                'docTR is not installed. Run: pip install "python-doctr[torch]"'
            )

        _, preprocessed_path = self.preprocess(image_path)
        doc = self._DocumentFile.from_images(str(preprocessed_path))
        result = self.model(doc)

        raw_lines: list[str] = []
        for page in result.pages:
            for block in page.blocks:
                for line in block.lines:
                    raw_lines.append(" ".join(word.value for word in line.words))

        full_text = "\n".join(raw_lines)
        fields = self._parse_fields(full_text)
        fields["preprocessed_url"] = f"/uploads/preprocessed/{preprocessed_path.name}"
        return fields

    def extract_fields_timed(self, image_path: str) -> tuple[dict, float]:
        start = time.perf_counter()
        fields = self.extract_fields(image_path)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info("OCR inference completed in %.0fms for %s", elapsed_ms, image_path)
        return fields, elapsed_ms
