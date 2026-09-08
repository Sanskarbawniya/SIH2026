from typing import Literal, Optional

from pydantic import BaseModel, Field


class ExtractedFields(BaseModel):
    raw_text: str = ""
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    passport_number: Optional[str] = None
    name: Optional[str] = None
    dob: Optional[str] = None
    preprocessed_url: Optional[str] = None


class ValidationResults(BaseModel):
    pan_format: Optional[bool] = None
    verhoeff: Optional[bool] = None
    mrz_valid: Optional[bool] = None


class Penalties(BaseModel):
    P_mrz: float = 0.0
    P_ela: float = 0.0
    P_face: float = 0.0
    P_graph: float = 0.0


class ForensicsResult(BaseModel):
    ela_url: Optional[str] = None
    anomaly_score: Optional[float] = None


class BiometricsResult(BaseModel):
    verified: Optional[bool] = None
    distance: Optional[float] = None
    threshold: Optional[float] = None
    liveness_passed: Optional[bool] = None
    liveness_score: Optional[float] = None
    liveness_method: Optional[str] = None
    spoof_reason: Optional[str] = None
    id_face_url: Optional[str] = None
    face_inference_ms: Optional[float] = None
    liveness_inference_ms: Optional[float] = None


class GraphResult(BaseModel):
    fraud_loop_detected: bool = False
    graph_status: Optional[
        Literal["clear", "duplicate_rescan", "same_identity", "linked_profile", "fraud_loop"]
    ] = None
    matched_alias_docs: list[str] = Field(default_factory=list)
    matched_face_id: Optional[str] = None
    similarity: Optional[float] = None
    nodes_in_graph: Optional[int] = None


class RiskBreakdown(BaseModel):
    mrz_contribution: float = 0.0
    ela_contribution: float = 0.0
    face_contribution: float = 0.0
    graph_contribution: float = 0.0


class RiskResult(BaseModel):
    score: int = 0
    band: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    breakdown: RiskBreakdown = Field(default_factory=RiskBreakdown)


class ScanResult(BaseModel):
    scan_id: str
    status: Literal["pending", "processing", "completed", "failed"] = "completed"
    phase: Optional[str] = None
    inference_ms: Optional[float] = None
    extracted: ExtractedFields = Field(default_factory=ExtractedFields)
    validations: ValidationResults = Field(default_factory=ValidationResults)
    penalties: Penalties = Field(default_factory=Penalties)
    forensics: ForensicsResult = Field(default_factory=ForensicsResult)
    biometrics: BiometricsResult = Field(default_factory=BiometricsResult)
    graph: GraphResult = Field(default_factory=GraphResult)
    risk: RiskResult = Field(default_factory=RiskResult)


class UploadResponse(BaseModel):
    id: str
    filename: str
