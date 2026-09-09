import logging
import uuid
from pathlib import Path
from typing import Callable, Optional

from app.config import UPLOAD_DIR
from app.schemas.scan_result import (
    BiometricsResult,
    ExtractedFields,
    ForensicsResult,
    GraphResult,
    Penalties,
    ScanResult,
    ValidationResults,
)
from app.services.biometrics import BiometricPipeline, prepare_document_face_crop
from app.services.forensics import ForensicAnalyzer
from app.services.graph import IdentityGraphEngine, build_identity_keys, file_content_fingerprint
from app.services.liveness import get_liveness_detector
from app.services.ocr import DocumentOCRProcessor
from app.services.risk_engine import RiskEngine
from app.services.scan_cache import DocumentPipelineEntry, ScanCache
from app.services.validation import ValidationEngine

logger = logging.getLogger(__name__)


class ScanOrchestrator:
    def __init__(self):
        self.ocr: Optional[DocumentOCRProcessor] = None

    def _get_ocr(self) -> DocumentOCRProcessor:
        if self.ocr is None:
            self.ocr = DocumentOCRProcessor.get_instance()
        return self.ocr

    def _run_document_pipeline(
        self,
        document_path: str,
        scan_id: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        doc_path = Path(document_path)

        def report(p: int, step: str):
            if progress_callback:
                progress_callback(p, step)

        report(10, "OCR")
        cached = ScanCache.get_document_pipeline(str(doc_path))
        if cached:
            logger.info("Document pipeline cache hit — skipping OCR + ELA")
            extracted = ExtractedFields(**cached.extracted)
            validations = ValidationResults(**cached.validations)
            ela_filename = f"{scan_id}_ela.png"
            ela_url = ForensicAnalyzer.save_ela_image(
                cached.ela_np, UPLOAD_DIR / "ela" / ela_filename
            )
            report(30, "Validate")
            report(50, "ELA")
            return ScanResult(
                scan_id=scan_id,
                status="completed",
                extracted=extracted,
                validations=validations,
                penalties=Penalties(P_mrz=cached.p_mrz, P_ela=cached.p_ela),
                forensics=ForensicsResult(ela_url=ela_url, anomaly_score=cached.anomaly_score),
                risk=RiskEngine.compute(Penalties(P_mrz=cached.p_mrz, P_ela=cached.p_ela)),
            )

        extracted_dict, _ = self._get_ocr().extract_fields_timed(str(doc_path))
        extracted = ExtractedFields(**extracted_dict)

        report(30, "Validate")
        validations_dict, p_mrz = ValidationEngine.compute_p_mrz(
            extracted.pan_number,
            extracted.aadhaar_number,
            extracted.raw_text,
        )
        validations = ValidationResults(**validations_dict)

        report(50, "ELA")
        ela_np, anomaly_score = ForensicAnalyzer.generate_ela(str(doc_path))
        ela_filename = f"{scan_id}_ela.png"
        ela_url = ForensicAnalyzer.save_ela_image(ela_np, UPLOAD_DIR / "ela" / ela_filename)
        p_ela = ForensicAnalyzer.normalize_p_ela(anomaly_score)

        ScanCache.set_document_pipeline(
            str(doc_path),
            DocumentPipelineEntry(
                extracted=extracted_dict,
                validations=validations_dict,
                p_mrz=p_mrz,
                p_ela=p_ela,
                anomaly_score=anomaly_score,
                ela_np=ela_np,
            ),
        )
        ScanCache.set_ocr_fields(str(doc_path), extracted_dict)

        return ScanResult(
            scan_id=scan_id,
            status="completed",
            extracted=extracted,
            validations=validations,
            penalties=Penalties(P_mrz=p_mrz, P_ela=p_ela),
            forensics=ForensicsResult(ela_url=ela_url, anomaly_score=anomaly_score),
            risk=RiskEngine.compute(Penalties(P_mrz=p_mrz, P_ela=p_ela)),
        )

    def run_forensics_scan(
        self,
        document_path: str,
        scan_id: Optional[str] = None,
    ) -> ScanResult:
        """Phase 3: OCR + validation + ELA forensics → P_ela."""
        scan_id = scan_id or str(uuid.uuid4())
        result = self._run_document_pipeline(document_path, scan_id)
        result.phase = "3"
        return result

    def run_ocr_scan(
        self,
        document_path: str,
        scan_id: Optional[str] = None,
    ) -> ScanResult:
        """Phase 1: OCR + field extraction only."""
        scan_id = scan_id or str(uuid.uuid4())
        extracted_dict, inference_ms = self._get_ocr().extract_fields_timed(document_path)
        return ScanResult(
            scan_id=scan_id,
            status="completed",
            phase="1",
            inference_ms=round(inference_ms, 1),
            extracted=ExtractedFields(**extracted_dict),
        )

    def run_validation_scan(
        self,
        document_path: str,
        scan_id: Optional[str] = None,
    ) -> ScanResult:
        """Phase 2: OCR + rule validation → P_mrz."""
        scan_id = scan_id or str(uuid.uuid4())
        extracted_dict, inference_ms = self._get_ocr().extract_fields_timed(document_path)
        extracted = ExtractedFields(**extracted_dict)

        validations_dict, p_mrz = ValidationEngine.compute_p_mrz(
            extracted.pan_number,
            extracted.aadhaar_number,
            extracted.raw_text,
        )
        validations = ValidationResults(**validations_dict)
        penalties = Penalties(P_mrz=p_mrz)

        return ScanResult(
            scan_id=scan_id,
            status="completed",
            phase="2",
            inference_ms=round(inference_ms, 1),
            extracted=extracted,
            validations=validations,
            penalties=penalties,
            risk=RiskEngine.compute(penalties),
        )

    def run_document_scan(
        self,
        document_path: str,
        scan_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        """Phase 4+: alias for full document pipeline with ELA."""
        return self.run_forensics_scan(document_path, scan_id)

    def _apply_face_verification(
        self,
        result: ScanResult,
        document_path: str,
        selfie_path: str,
        scan_id: str,
        *,
        include_liveness: bool = False,
        include_graph: bool = False,
    ) -> ScanResult:
        face_crop = UPLOAD_DIR / "faces" / f"{scan_id}_doc.jpg"
        id_crop = prepare_document_face_crop(document_path, face_crop)
        id_face_url = BiometricPipeline.save_face_crop_url(face_crop, scan_id)

        liveness_passed = None
        liveness_result: dict = {}
        if include_liveness:
            liveness_result = get_liveness_detector().check_liveness(selfie_path)
            liveness_passed = liveness_result["liveness_passed"]

        def _liveness_fields() -> dict:
            return {
                "liveness_passed": liveness_passed,
                "liveness_score": liveness_result.get("score"),
                "liveness_method": liveness_result.get("method"),
                "spoof_reason": None if liveness_passed else liveness_result.get("reason"),
                "liveness_inference_ms": liveness_result.get("inference_ms"),
            }

        if include_liveness and liveness_passed is False:
            result.biometrics = BiometricsResult(
                verified=False,
                id_face_url=id_face_url,
                **_liveness_fields(),
            )
            result.penalties.P_face = 1.0
            result.risk = RiskEngine.compute(result.penalties)
            return result

        try:
            if include_graph:
                bio = BiometricPipeline.verify_and_embed(id_crop, selfie_path)
            else:
                bio = BiometricPipeline.verify_pair(id_crop, selfie_path)
            p_face = BiometricPipeline.compute_p_face(
                bio["verified"],
                bio["distance"],
                liveness_passed=liveness_passed,
                threshold=bio.get("threshold", 0.4),
            )
            result.biometrics = BiometricsResult(
                verified=bio["verified"],
                distance=bio["distance"],
                threshold=bio.get("threshold"),
                id_face_url=id_face_url,
                face_inference_ms=bio.get("inference_ms"),
                **_liveness_fields(),
            )
            result.penalties.P_face = p_face

            if include_graph and bio.get("embedding"):
                graph_engine = IdentityGraphEngine.get_instance()
                face_id = f"face_{scan_id[:8]}"
                fingerprint = file_content_fingerprint(document_path, selfie_path)
                id_keys = build_identity_keys(
                    result.extracted.pan_number,
                    result.extracted.aadhaar_number,
                    result.extracted.passport_number,
                )
                graph_result = graph_engine.add_and_evaluate_scan(
                    face_id=face_id,
                    doc_id=scan_id,
                    embedding=bio["embedding"],
                    content_fingerprint=fingerprint,
                    identity_keys=id_keys,
                )
                p_graph = IdentityGraphEngine.normalize_p_graph(graph_result.get("risk_delta", 0))
                stats = graph_engine.get_stats()
                result.penalties.P_graph = p_graph
                result.graph = GraphResult(
                    fraud_loop_detected=graph_result["fraud_loop_detected"],
                    graph_status=graph_result.get("graph_status"),
                    matched_alias_docs=graph_result.get("matched_alias_docs", []),
                    matched_face_id=graph_result.get("matched_face"),
                    similarity=graph_result.get("similarity"),
                    nodes_in_graph=stats["documents"] + stats["faces"],
                )
        except Exception as exc:
            logger.exception("Face verification failed for scan %s", scan_id)
            result.biometrics = BiometricsResult(
                verified=False,
                id_face_url=id_face_url,
                **_liveness_fields(),
            )
            result.penalties.P_face = 1.0
            # Return structured result instead of 500 for common face-detection failures
            msg = str(exc).lower()
            if not any(
                token in msg
                for token in (
                    "face",
                    "detect",
                    "img1",
                    "img2",
                    "opencv",
                    "could not read",
                    "not found",
                )
            ):
                raise

        result.risk = RiskEngine.compute(result.penalties)
        return result

    def run_face_scan(
        self,
        document_path: str,
        selfie_path: str,
        scan_id: Optional[str] = None,
    ) -> ScanResult:
        """Phase 4: OCR + validation + ELA + face match (no liveness, no graph)."""
        scan_id = scan_id or str(uuid.uuid4())
        result = self._run_document_pipeline(document_path, scan_id)
        result.phase = "4"
        result = self._apply_face_verification(
            result,
            document_path,
            selfie_path,
            scan_id,
            include_liveness=False,
            include_graph=False,
        )
        return result

    def run_unified_scan(
        self,
        document_path: str,
        selfie_path: Optional[str] = None,
        scan_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        """Phase 5: OCR → validation → ELA → optional face → unified risk score (P_graph=0)."""
        scan_id = scan_id or str(uuid.uuid4())

        def report(p: int, step: str):
            if progress_callback:
                progress_callback(p, step)

        report(10, "OCR")
        result = self._run_document_pipeline(document_path, scan_id, progress_callback)
        result.phase = "5"
        result.penalties.P_graph = 0.0

        if selfie_path:
            report(70, "Face")
            result = self._apply_face_verification(
                result,
                document_path,
                selfie_path,
                scan_id,
                include_liveness=False,
                include_graph=False,
            )
        else:
            report(90, "Score")
            result.risk = RiskEngine.compute(result.penalties)

        report(100, "Score")
        return result

    def run_graph_scan(
        self,
        document_path: str,
        selfie_path: str,
        scan_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        """Phase 6: unified pipeline + identity graph fraud loop detection."""
        scan_id = scan_id or str(uuid.uuid4())

        def report(p: int, step: str):
            if progress_callback:
                progress_callback(p, step)

        report(10, "OCR")
        result = self._run_document_pipeline(document_path, scan_id, progress_callback)
        result.phase = "6"

        report(60, "Face")
        result = self._apply_face_verification(
            result,
            document_path,
            selfie_path,
            scan_id,
            include_liveness=False,
            include_graph=True,
        )

        report(85, "Graph")
        result.risk = RiskEngine.compute(result.penalties)
        report(100, "Score")
        return result

    def run_liveness_scan(
        self,
        document_path: str,
        selfie_path: str,
        scan_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        """Phase 7: liveness → face match → identity graph (if live)."""
        scan_id = scan_id or str(uuid.uuid4())

        def report(p: int, step: str):
            if progress_callback:
                progress_callback(p, step)

        report(10, "OCR")
        result = self._run_document_pipeline(document_path, scan_id, progress_callback)
        result.phase = "7"

        report(55, "Liveness")
        report(70, "Face")
        result = self._apply_face_verification(
            result,
            document_path,
            selfie_path,
            scan_id,
            include_liveness=True,
            include_graph=True,
        )

        report(85, "Graph")
        report(100, "Score")
        return result

    def run_complete_scan(
        self,
        document_path: str,
        selfie_path: Optional[str] = None,
        scan_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        """Phase 6–8: full pipeline with liveness + identity graph."""
        scan_id = scan_id or str(uuid.uuid4())

        def report(p: int, step: str):
            if progress_callback:
                progress_callback(p, step)

        report(5, "OCR")
        result = self._run_document_pipeline(document_path, scan_id, progress_callback)

        if selfie_path:
            report(65, "Face")
            result = self._apply_face_verification(
                result,
                document_path,
                selfie_path,
                scan_id,
                include_liveness=True,
                include_graph=True,
            )
            report(85, "Graph")
        else:
            result.risk = RiskEngine.compute(result.penalties)

        report(100, "Score")
        return result

    def run_full_scan(
        self,
        document_path: str,
        selfie_path: Optional[str] = None,
        scan_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> ScanResult:
        """Alias for Phase 5 unified scan (minimum viable SIH prototype)."""
        return self.run_unified_scan(
            document_path,
            selfie_path,
            scan_id=scan_id,
            progress_callback=progress_callback,
        )


_orchestrator: Optional[ScanOrchestrator] = None


def get_orchestrator() -> ScanOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = ScanOrchestrator()
    return _orchestrator
