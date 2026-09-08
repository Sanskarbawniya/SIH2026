import logging
import shutil
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

ARC_FACE_THRESHOLD = 0.4
# opencv backend needs haarcascade XML (missing in opencv-python-headless on Windows)
FACE_DETECTORS = ("ssd", "retinaface", "mtcnn", "skip")


class BiometricPipeline:
    @staticmethod
    def _ensure_readable_image(path: str, min_side: int = 80) -> str:
        """Validate image exists and upscale tiny crops so DeepFace can process them."""
        p = Path(path)
        if not p.is_file():
            raise ValueError(f"Image not found: {path}")

        img = cv2.imread(str(p))
        if img is None:
            raise ValueError(f"Could not read image: {path}")

        h, w = img.shape[:2]
        if min(h, w) < min_side:
            scale = min_side / min(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
            cv2.imwrite(str(p), img)
        return str(p)

    @staticmethod
    def extract_face_from_document(document_path: str, output_path: Path) -> str:
        """Detect and crop the ID photo region from a document image."""
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            from deepface import DeepFace

            for backend in FACE_DETECTORS:
                if backend == "skip":
                    continue
                try:
                    faces = DeepFace.extract_faces(
                        img_path=document_path,
                        detector_backend=backend,
                        enforce_detection=False,
                    )
                    if not faces:
                        continue
                    best = max(
                        faces,
                        key=lambda f: f["facial_area"]["w"] * f["facial_area"]["h"],
                    )
                    face_img = best["face"]
                    if face_img.max() <= 1.0:
                        face_img = (face_img * 255).astype(np.uint8)
                    bgr = cv2.cvtColor(face_img, cv2.COLOR_RGB2BGR)
                    cv2.imwrite(str(output_path), bgr)
                    logger.info("ID face extracted with %s detector", backend)
                    return str(output_path)
                except Exception as exc:
                    logger.debug("Face extract (%s) failed: %s", backend, exc)
        except Exception as exc:
            logger.warning("DeepFace face extraction unavailable: %s", exc)

        img = cv2.imread(document_path)
        if img is not None:
            h, w = img.shape[:2]
            # Indian PAN/Aadhaar: portrait typically on the left ~40% of card
            crop = img[int(h * 0.08) : int(h * 0.92), 0 : int(w * 0.42)]
            if crop.size:
                cv2.imwrite(str(output_path), crop)
                logger.info("ID face extracted via document heuristic crop")
                return str(output_path)

        shutil.copy(document_path, output_path)
        return str(output_path)

    @staticmethod
    def _deepface_verify(
        id_crop_path: str,
        selfie_path: str,
        *,
        need_embedding: bool = False,
    ) -> dict:
        from deepface import DeepFace

        BiometricPipeline._ensure_readable_image(id_crop_path)
        BiometricPipeline._ensure_readable_image(selfie_path)

        last_error: Optional[Exception] = None

        # ID crop is already a portrait region — skip face detection on img1
        verify_attempts = [
            {"detector_backend": "skip", "enforce_detection": False},
            {"detector_backend": "ssd", "enforce_detection": False},
            {"detector_backend": "retinaface", "enforce_detection": False},
        ]

        result = None
        for opts in verify_attempts:
            try:
                result = DeepFace.verify(
                    img1_path=id_crop_path,
                    img2_path=selfie_path,
                    model_name="ArcFace",
                    distance_metric="cosine",
                    **opts,
                )
                logger.info("Face verify succeeded with %s", opts["detector_backend"])
                break
            except Exception as exc:
                last_error = exc
                logger.warning("Face verify (%s) failed: %s", opts["detector_backend"], exc)

        if result is None:
            raise RuntimeError(
                f"Face verification failed — ensure the document photo and selfie show a clear face. "
                f"Detail: {last_error}"
            ) from last_error

        embedding = None
        if need_embedding:
            for backend in ("ssd", "retinaface", "skip"):
                try:
                    embedding_result = DeepFace.represent(
                        img_path=selfie_path,
                        model_name="ArcFace",
                        detector_backend=backend,
                        enforce_detection=backend != "skip",
                    )
                    embedding = embedding_result[0]["embedding"]
                    break
                except Exception as exc:
                    logger.warning("Embedding (%s) failed: %s", backend, exc)
            if embedding is None:
                raise RuntimeError("Could not compute face embedding for graph analysis")

        return {
            "verified": bool(result["verified"]),
            "distance": float(result["distance"]),
            "threshold": float(result.get("threshold", ARC_FACE_THRESHOLD)),
            "embedding": embedding,
        }

    @staticmethod
    def verify_and_embed(id_crop_path: str, webcam_frame_path: str) -> dict:
        start = time.perf_counter()
        result = BiometricPipeline._deepface_verify(
            id_crop_path, webcam_frame_path, need_embedding=True
        )
        result["inference_ms"] = round((time.perf_counter() - start) * 1000, 1)
        return result

    @staticmethod
    def verify_pair(id_crop_path: str, selfie_path: str) -> dict:
        """Phase 4: 1:1 verify without storing embedding for graph."""
        start = time.perf_counter()
        result = BiometricPipeline._deepface_verify(id_crop_path, selfie_path, need_embedding=False)
        result["inference_ms"] = round((time.perf_counter() - start) * 1000, 1)
        return result

    @staticmethod
    def compute_p_face(
        verified: bool,
        distance: float,
        liveness_passed: Optional[bool] = None,
        threshold: float = ARC_FACE_THRESHOLD,
    ) -> float:
        if liveness_passed is False:
            return 1.0
        if verified:
            return max(0.0, min(0.3, distance / threshold * 0.3))
        return min(1.0, 0.5 + (distance / max(threshold, 0.01)) * 0.5)

    @staticmethod
    def save_face_crop_url(output_path: Path, scan_id: str) -> str:
        faces_dir = output_path.parent
        public_name = f"{scan_id}_id_face.jpg"
        public_path = faces_dir / public_name
        if output_path.exists() and output_path != public_path:
            shutil.copy(output_path, public_path)
        elif output_path.exists():
            public_path = output_path
        return f"/uploads/faces/{public_path.name}"


def prepare_document_face_crop(document_path: str, output_path: Path) -> str:
    return BiometricPipeline.extract_face_from_document(document_path, output_path)
