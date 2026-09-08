# SIH 2026 — Master Project Architecture Document

> **This is the permanent first document for the SIH2026 repository.**  
> All design decisions, phase plans, tech stack choices, and system architecture live here.  


| Field | Value |
| --- | --- |
| **Project Title** | AI-Based Fake Identity & Document Screening System |
| **Problem Statement ID** | PS-26188 |
| **Document Version** | 1.0.1 |
| **Last Updated** | September 2026 |
| **Target Environment** | Border checkpoints, transit security hubs, automated eKYC portals |
| **Repository** | `SIH2026/` monorepo (FastAPI backend + React frontend) |

---

## 1. Executive Summary

This system screens identity documents and live faces at high-throughput checkpoints. It combines **OCR extraction**, **mathematical document validation**, **forensic tampering detection (ELA)**, **facial biometrics**, **liveness anti-spoofing**, and **identity graph fraud detection** into a single **0–100 composite risk score** displayed on a React dashboard.

The prototype is built **incrementally in 9 phases (0–8)**. Each phase adds one capability and a demo-able milestone. The core stack is **fully local and open-source** — no paid API keys are required for the SIH demo.

**Minimum viable SIH prototype:** Phase 5 (unified risk engine).  
**Strong differentiators:** Phase 6 (fraud loop graph) + Phase 7 (liveness) + Phase 8 (async queue).

---

## 2. Problem Statement & Goals

### Problem (PS-26188)

Border and transit authorities need automated screening that detects:

- **Forged or tampered documents** (edited text, spliced regions, invalid checksums)
- **Identity mismatches** (face on document ≠ live presenter)
- **Presentation attacks** (photo-of-photo, screen replay)
- **Serial fraud** (same person presenting multiple different identities)

### Solution Goals

| Goal | How We Address It |
| --- | --- |
| Document authenticity | ICAO MRZ / Verhoeff / PAN format validation |
| Tampering detection | Error Level Analysis (ELA) + patch variance scoring |
| Biometric verification | DeepFace ArcFace 1:1 cosine distance |
| Liveness | MiniFASNetV2 (or heuristic fallback) on selfie |
| Multi-identity fraud | NetworkX identity graph with embedding similarity |
| Operator UX | Dark dashboard, side-by-side ELA view, 0–100 risk gauge |
| Throughput | Celery + Redis async queue (Phase 8) |

---

## 3. System Architecture

### 3.1 High-Level Architecture Diagram

```
                              [ User / Operator ]
                   Document Upload (File) + Live Webcam Selfie
                                        │
                                        ▼
                  ┌─────────────────────────────────────────┐
                  │     FastAPI Ingestion Layer (Port 8000)    │
                  │  /api/upload  ·  /api/scan/*  ·  /api/graph │
                  └────────────────────┬────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │ Sync Path        │ Async Path (Ph.8) │
                    ▼                  ▼                   │
           ScanOrchestrator      Redis + Celery Worker      │
                    │                  │                   │
                    └──────────────────┼──────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           ▼                           ▼                           ▼
  ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
  │   Module 1      │        │   Module 2      │        │   Module 3      │
  │ OCR & Entities  │        │ Checksum Engine │        │ AI Forensics    │
  │ (docTR/EasyOCR) │        │ (ICAO/Verhoeff) │        │ (ELA/Patch Var) │
  └────────┬────────┘        └────────┬────────┘        └────────┬────────┘
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      ▼
                           ┌──────────────────────┐
                           │      Module 4        │
                           │ Biometrics & Liveness│
                           │ (ArcFace + AntiSpoof)│
                           └──────────┬───────────┘
                                      ▼
                           ┌──────────────────────┐
                           │      Module 5        │
                           │  Identity Graph DB   │
                           │ (NetworkX Fraud Loop)│
                           └──────────┬───────────┘
                                      ▼
                           ┌──────────────────────┐
                           │  Unified Risk Engine │
                           │  Composite Score 0–100│
                           └──────────┬───────────┘
                                      ▼
                           ┌──────────────────────┐
                           │ React X-Ray Dashboard│
                           │ (Vite + TailwindCSS) │
                           └──────────────────────┘
```

### 3.2 Component Responsibilities

| Layer | Component | Responsibility |
| --- | --- | --- |
| **Presentation** | React Dashboard (`frontend/`) | Upload, webcam capture, ELA viewer, risk gauge, fraud alerts |
| **API Gateway** | FastAPI (`backend/app/main.py`) | REST endpoints, CORS, static file serving for uploads/ELA |
| **Orchestration** | `ScanOrchestrator` | Chains modules in order; reports progress for async jobs |
| **ML / CV Services** | `services/ocr.py`, `forensics.py`, `biometrics.py`, `liveness.py` | Inference and scoring per module |
| **Rules** | `services/validation.py` | Deterministic PAN / Aadhaar / MRZ checks |
| **Fraud Graph** | `services/graph.py` | In-memory NetworkX graph; cosine similarity on face embeddings |
| **Scoring** | `services/risk_engine.py` | Weighted penalty aggregation → 0–100 score |
| **Async (Phase 8)** | Celery + Redis | Non-blocking scan jobs with polling |
| **Persistence** | `uploads/` directory | Document images, ELA heatmaps, face crops |

### 3.3 Deployment Topology

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Browser    │────▶│   Frontend   │────▶│  FastAPI Backend │
│ localhost:5173│     │  Vite (dev)  │     │  localhost:8000  │
└──────────────┘     └──────────────┘     └────────┬─────────┘
                                                     │
                              ┌───────────────────────┼───────────────────────┐
                              ▼                       ▼                       ▼
                       ┌────────────┐          ┌────────────┐          ┌────────────┐
                       │   Redis 7  │◀────────▶│   Celery   │          │  uploads/  │
                       │  (broker)  │          │   Worker   │          │  (volume)  │
                       └────────────┘          └────────────┘          └────────────┘
```

Docker Compose (`docker-compose.yml`) runs Redis, backend, and Celery worker together for Phase 8.

---

## 4. Data Flow & Pipeline Stages

### 4.1 Full Scan Pipeline (Phase 6–8 Complete Mode)

```
Document Image ──▶ [1. OCR] ──▶ extracted fields (PAN, Aadhaar, passport, name, DOB)
                        │
                        ▼
                   [2. Validate] ──▶ P_mrz (format + Verhoeff + MRZ)
                        │
                        ▼
                   [3. ELA Forensics] ──▶ ELA heatmap PNG + P_ela
                        │
Selfie Image ──▶ [4. Liveness] ──▶ pass/fail (spoof → P_face = 1.0, skip verify)
                        │
                        ▼
                   [5. Face Match] ──▶ ArcFace verify + embedding
                        │
                        ▼
                   [6. Identity Graph] ──▶ fraud loop check → P_graph
                        │
                        ▼
                   [7. Risk Engine] ──▶ R ∈ [0, 100], band LOW/MEDIUM/HIGH
                        │
                        ▼
                   ScanResult JSON ──▶ React Dashboard
```

### 4.2 Progress Steps (Async UI)

| Progress | Step | Module |
| --- | --- | --- |
| 10% | OCR | docTR extraction |
| 30% | Validate | PAN / Verhoeff / MRZ |
| 50% | ELA | Tampering analysis |
| 55–65% | Liveness | Anti-spoof check |
| 70% | Face | ArcFace 1:1 match |
| 85% | Graph | Fraud loop detection |
| 100% | Score | Risk aggregation |

---

## 5. Technology Stack — Master Matrix

### 5.1 Full Stack Overview

| Tier | Component | Version (Implemented) | Role |
| --- | --- | --- | --- |
| **Frontend** | React | `^19.2.8` | Dashboard UI, state management |
| | Vite | `^8.2.2` | Dev server & build tool |
| | TailwindCSS | `^4.3.3` | Dark-mode utility styling |
| | Lucide React | `^1.41.0` | Icons |
| | Recharts | `^3.10.1` | Risk gauge charts |
| | TypeScript | `~6.0.2` | Type-safe frontend |
| **Backend** | Python | 3.11+ | Runtime |
| | FastAPI | `>=0.109.0` | Async REST API |
| | Uvicorn | `>=0.27.0` | ASGI server |
| | Pydantic | (via FastAPI) | `ScanResult` schema validation |
| **OCR** | python-doctr[torch] | `>=0.7.0` | DBResNet50 + CRNN VGG16 OCR |
| | OpenCV | `opencv-python-headless >=4.9.0` | CLAHE preprocessing, deskew |
| | Pillow | `>=10.2.0` | Image manipulation, ELA |
| **Validation** | python-mrz | `>=0.5.2` | ICAO MRZ check digits |
| | Custom Verhoeff | — | 12-digit Aadhaar validation |
| **Forensics** | Custom ELA | PIL + OpenCV | JPEG compression variance analysis |
| **Biometrics** | DeepFace | `>=0.0.86` | ArcFace embeddings & 1:1 verify |
| | tf-keras | — | DeepFace TensorFlow backend |
| **Liveness** | MiniFASNetV2 | Silent-Face weights | Presentation attack detection |
| | OpenCV heuristic | — | Fallback when weights absent |
| **Graph** | NetworkX | `>=3.2.1` | In-memory identity fraud graph |
| **Async** | Celery | `>=5.3.6` | Distributed scan workers |
| | Redis | `7-alpine` (Docker) | Broker + result backend |
| **Optional** | PostgreSQL + pgvector | 16 | Persistent graph (not required for demo) |

### 5.2 Open-Source Base Repositories

| Module | Base Repository | Our Extension |
| --- | --- | --- |
| Pipeline scaffold | [AegisKYC](https://github.com/ishansurdi/AegisKYC) | Redis/Celery, ELA viewer, graph alerts |
| Forensics | [DocForensics](https://github.com/Suryakarthik-1/DocForensics) | Automated numeric P_ela scoring |
| OCR | [Mindee docTR](https://github.com/mindee/doctr) | Indian ID regex field mapping |
| Face verify | [DeepFace](https://github.com/serengil/deepface) | Embedding → graph integration |
| Liveness | [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing) | Pre-filter before face verify |

---

## 6. Phase-by-Phase Build Plan (0 → 8)

> **Build philosophy:** Sync first, async later. One document type first (PAN). In-memory graph before PostgreSQL. Demo after every phase.

### Phase Overview

| Phase | Name | Demo Output | Tech Added | Status |
| --- | --- | --- | --- | --- |
| **0** | Skeleton & Dev Environment | Upload → save → confirm | FastAPI, React, Vite, Tailwind | ✅ Done |
| **1** | OCR + Field Extraction | PAN text + structured fields | docTR, OpenCV, Pillow | ✅ Done |
| **2** | Rule Validation Engine | Invalid PAN → red flags | python-mrz, Verhoeff engine | ✅ Done |
| **3** | ELA Forensics | Side-by-side ELA heatmap | PIL ELA, patch variance | ✅ Done |
| **4** | Face Match | ID photo vs selfie match | DeepFace ArcFace | ✅ Done |
| **5** | Unified Risk Engine | Full pipeline → 0–100 score | RiskEngine, ScanOrchestrator | ✅ Done |
| **6** | Identity Graph Fraud | Same face, two docs → alert | NetworkX, cosine similarity | ✅ Done |
| **7** | Liveness / Anti-Spoofing | Photo-of-photo fails | MiniFASNetV2 + heuristic | ✅ Done |
| **8** | Async Queue + Polish | Non-blocking scan + progress UI | Celery, Redis, Docker | ✅ Done |

---

### Phase 0 — Skeleton & Dev Environment

**Goal:** Monorepo with backend + frontend, hello-world file upload.

| Category | Technology |
| --- | --- |
| Backend | FastAPI, Uvicorn, python-multipart |
| Frontend | React 19, Vite 8, TailwindCSS 4 |
| Storage | Local `uploads/` directory |

**Endpoints:** `GET /api/health`, `POST /api/upload`

**Deliverable:** Upload JPG/PNG → backend saves → frontend shows `{ id, filename }`.

---

### Phase 1 — OCR + Field Extraction

**Goal:** Upload ID image → structured extracted fields.

| Category | Technology |
| --- | --- |
| OCR engine | Mindee docTR (DBResNet50 + CRNN VGG16) |
| Preprocessing | OpenCV CLAHE illumination correction |
| Field parsing | Regex for PAN, Aadhaar, passport, name, DOB |

**Service:** `backend/app/services/ocr.py` → `DocumentOCRProcessor`  
**Endpoint:** `POST /api/scan/ocr`

**Deliverable:** Upload PAN → see `raw_text`, `pan_number`, and other fields in UI.

---

### Phase 2 — Rule Validation Engine

**Goal:** Convert extracted fields into pass/fail checks → penalty `P_mrz`.

| Category | Technology |
| --- | --- |
| PAN validation | Custom regex (5+4+1 pattern) |
| Aadhaar validation | Verhoeff checksum (12 digits) |
| Passport MRZ | python-mrz ICAO Doc 9303 |

**Service:** `backend/app/services/validation.py` → `ValidationEngine`  
**Endpoint:** `POST /api/scan/document`

**Deliverable:** Invalid PAN checksum → validation failures → elevated `P_mrz`.

---

### Phase 3 — ELA Forensics (Tampering Detection)

**Goal:** ELA heatmap + numeric tampering signal `P_ela`.

| Category | Technology |
| --- | --- |
| ELA generation | Pillow ImageChops difference |
| Patch scoring | OpenCV 32×32 block std variance |
| Output | PNG saved to `uploads/ela/` |

**Service:** `backend/app/services/forensics.py` → `ForensicAnalyzer`  
**Endpoint:** `POST /api/scan/forensics`  
**Frontend:** `ElaViewer.tsx` — side-by-side original vs heatmap

**Deliverable:** Tampered document → bright ELA patches → higher `P_ela`.

---

### Phase 4 — Face Match (No Liveness)

**Goal:** Compare ID photo crop vs webcam selfie → match score.

| Category | Technology |
| --- | --- |
| Face detection & verify | DeepFace ArcFace |
| Distance metric | Cosine similarity |
| Document face crop | OpenCV heuristic + DeepFace detect |
| Webcam capture | Browser `getUserMedia` (localhost/HTTPS) |

**Service:** `backend/app/services/biometrics.py` → `BiometricPipeline`  
**Endpoint:** `POST /api/scan/face`  
**Frontend:** `WebcamCapture` (in `UploadPanel.tsx`), `FaceMatchCard`

**Deliverable:** Same person → `verified: true`; different person → `verified: false`.

---

### Phase 5 — Unified Risk Engine ★ Core SIH Prototype

**Goal:** Single orchestrated scan → composite risk score `R ∈ [0, 100]`.

| Category | Technology |
| --- | --- |
| Orchestrator | `ScanOrchestrator.run_unified_scan()` |
| Risk formula | Weighted sum of P_mrz, P_ela, P_face, P_graph |
| Risk bands | LOW (0–30), MEDIUM (31–60), HIGH (61–100) |

**Services:** `orchestrator.py`, `risk_engine.py`  
**Endpoint:** `POST /api/scan/full`  
**Frontend:** `RiskGauge.tsx`, `UnifiedScanPanel.tsx`

**Deliverable:** Full scan flow with 0–100 score and per-module penalty breakdown.

---

### Phase 6 — Identity Graph (Fraud Loop Detection)

**Goal:** Detect same face linked to multiple different documents.

| Category | Technology |
| --- | --- |
| Graph engine | NetworkX in-memory graph |
| Similarity | Cosine on 512-D ArcFace embeddings |
| Detection | Face node linked to ≥2 document nodes |
| Status types | clear, duplicate_rescan, same_identity, linked_profile, fraud_loop |

**Service:** `backend/app/services/graph.py` → `IdentityGraphEngine`  
**Endpoints:** `POST /api/scan/graph`, `GET /api/graph/alerts`, `GET /api/graph/stats`, `DELETE /api/graph/reset`  
**Frontend:** `GraphFraudPanel.tsx`

**Deliverable:** Scan Person A with Doc 1, then Doc 2 → fraud loop alert.

---

### Phase 7 — Liveness / Anti-Spoofing

**Goal:** Reject screen/print photo attacks before face verification.

| Category | Technology |
| --- | --- |
| Primary | MiniFASNetV2 (Silent-Face `.pth` weights) |
| Fallback | Multi-signal OpenCV heuristic (sharpness, texture, screen glare) |
| Weights path | `backend/models/antispoof/MiniFASNetV2.pth` |
| On spoof fail | `P_face = 1.0`, skip DeepFace verify |

**Service:** `backend/app/services/liveness.py` → `LivenessDetector`  
**Endpoint:** `POST /api/scan/liveness`  
**Frontend:** `LivenessCard.tsx`

**Deliverable:** Photo on phone screen → liveness FAIL; live face → PASS → face verify proceeds.

---

### Phase 8 — Async Queue + Production Polish

**Goal:** Non-blocking uploads, job polling, polished dashboard.

| Category | Technology |
| --- | --- |
| Message broker | Redis 7 (Docker) |
| Task queue | Celery worker |
| Job polling | `GET /api/scan/{job_id}/status` |
| Containerization | `docker-compose.yml` (redis, backend, celery-worker) |

**Task:** `backend/app/tasks/scan_task.py`  
**Endpoint:** `POST /api/scan/full?async=true` → `{ job_id }`  
**Frontend:** Progress bar, async mode checkbox

**Deliverable:** Submit scan → job queued → poll progress → final dashboard.

---

### Phase Dependency Graph

```
Phase 0 (Skeleton)
    └── Phase 1 (OCR)
            └── Phase 2 (Validation)
                    └── Phase 3 (ELA)
                            └── Phase 4 (Face)
                                    └── Phase 5 (Risk Engine) ★ MVP
                                            ├── Phase 6 (Graph)
                                            ├── Phase 7 (Liveness)
                                            └── Phase 8 (Async)
```

---

## 7. Core Processing Modules

| # | Module | File | Input | Output |
| --- | --- | --- | --- | --- |
| 1 | OCR & Entities | `services/ocr.py` | Document image | `ExtractedFields`, inference time |
| 2 | Validation | `services/validation.py` | Extracted fields | `ValidationResults`, `P_mrz` |
| 3 | Forensics | `services/forensics.py` | Document image | ELA URL, anomaly score, `P_ela` |
| 4 | Biometrics | `services/biometrics.py` | ID crop + selfie | verified, distance, embedding |
| 4b | Liveness | `services/liveness.py` | Selfie image | liveness_passed, score, method |
| 5 | Identity Graph | `services/graph.py` | embedding + doc ID | fraud_loop_detected, `P_graph` |
| — | Orchestrator | `services/orchestrator.py` | Files + phase mode | Complete `ScanResult` |
| — | Risk Engine | `services/risk_engine.py` | All penalties | score, band, breakdown |

---

## 8. Unified Risk Engine

### Formula

The composite risk score \( R \in [0, 100] \) aggregates weighted failure penalties:

\[
R = \min\left(100,\; w_{\text{mrz}} \cdot P_{\text{mrz}} + w_{\text{ela}} \cdot P_{\text{ela}} + w_{\text{face}} \cdot P_{\text{face}} + w_{\text{graph}} \cdot P_{\text{graph}}\right)
\]

### Weights

| Penalty | Weight | Range | Source |
| --- | --- | --- | --- |
| \( P_{\text{mrz}} \) | **35** | [0, 1] | PAN format, Verhoeff, MRZ failures |
| \( P_{\text{ela}} \) | **25** | [0, 1] | ELA patch variance anomaly |
| \( P_{\text{face}} \) | **25** | [0, 1] | Face mismatch, liveness spoof |
| \( P_{\text{graph}} \) | **15** | [0, 1] | Multi-identity fraud loop |

### Risk Bands

| Band | Score Range | Operator Action |
| --- | --- | --- |
| **LOW** | 0 – 30 | Proceed |
| **MEDIUM** | 31 – 60 | Secondary review |
| **HIGH** | 61 – 100 | Block / manual inspection |

**Implementation:** `backend/app/services/risk_engine.py`

---

## 9. API Reference

All routes prefixed with `/api`.

| Endpoint | Method | Phase | Description |
| --- | --- | --- | --- |
| `/health` | GET | 0 | Health check |
| `/upload` | POST | 0 | Raw file upload → `{ id, filename }` |
| `/scan/ocr` | POST | 1 | OCR + field extraction only |
| `/scan/document` | POST | 2 | OCR + validation → `P_mrz` |
| `/scan/forensics` | POST | 3 | OCR + validation + ELA → `P_ela` |
| `/scan/face` | POST | 4 | Full doc pipeline + face match |
| `/scan/full` | POST | 5 | Unified end-to-end risk score |
| `/scan/graph` | POST | 6 | Full pipeline + fraud graph |
| `/scan/liveness` | POST | 7 | Liveness + face match |
| `/scan/full?async=true` | POST | 8 | Queue async job → `{ job_id }` |
| `/scan/{job_id}/status` | GET | 8 | Poll job progress + result |
| `/graph/alerts` | GET | 6 | Active fraud loop alerts |
| `/graph/stats` | GET | 6 | Graph node/edge statistics |
| `/graph/reset` | DELETE | 6 | Clear in-memory graph |

**Static files:** `/uploads/` serves document images, ELA heatmaps, and face crops.

---

## 10. Shared `ScanResult` Contract

Every module writes to this schema (`backend/app/schemas/scan_result.py`). The frontend depends on it — extend fields per phase, never break existing keys.

```json
{
  "scan_id": "uuid",
  "status": "completed",
  "phase": "5",
  "inference_ms": 4200.5,
  "extracted": {
    "raw_text": "...",
    "pan_number": "ABCDE1234F",
    "aadhaar_number": null,
    "passport_number": null,
    "name": "JOHN DOE",
    "dob": "01/01/1990"
  },
  "validations": {
    "pan_format": true,
    "verhoeff": true,
    "mrz_valid": null
  },
  "penalties": {
    "P_mrz": 0.0,
    "P_ela": 0.2,
    "P_face": 0.1,
    "P_graph": 0.0
  },
  "forensics": {
    "ela_url": "/uploads/ela/scan_id_ela.png",
    "anomaly_score": 12.4
  },
  "biometrics": {
    "verified": true,
    "distance": 0.32,
    "threshold": 0.4,
    "liveness_passed": true,
    "liveness_score": 0.87,
    "liveness_method": "heuristic",
    "id_face_url": "/uploads/faces/scan_id_doc.jpg"
  },
  "graph": {
    "fraud_loop_detected": false,
    "graph_status": "clear",
    "matched_alias_docs": [],
    "similarity": null,
    "nodes_in_graph": 4
  },
  "risk": {
    "score": 23,
    "band": "LOW",
    "breakdown": {
      "mrz_contribution": 0,
      "ela_contribution": 5.0,
      "face_contribution": 2.5,
      "graph_contribution": 0
    }
  }
}
```

---

## 11. Directory Structure & Repository Layout

### 11.1 Complete Directory Tree

```
SIH2026/                                    # Monorepo root
│
├── SIH_PROJECT.md                          # ★ Master architecture (THIS DOCUMENT)
├── SIH_PS26188.md                          # Original problem statement & extended build guide
├── README.md                               # Quick-start entry point → links here
├── .env.example                            # Environment variable template
├── .gitignore                              # Excludes uploads/, venv/, node_modules/, .env
├── docker-compose.yml                      # Redis + backend + Celery worker (Phase 8)
│
├── backend/                                # Python FastAPI service
│   ├── Dockerfile                          # Container image for backend & Celery
│   ├── requirements.txt                    # Python deps (incremental by phase)
│   │
│   ├── app/                                # Application package
│   │   ├── __init__.py
│   │   ├── main.py                         # FastAPI entry, CORS, OCR warmup, static /uploads
│   │   ├── config.py                       # UPLOAD_DIR, CORS_ORIGINS, Redis URLs
│   │   │
│   │   ├── routes/                         # HTTP route handlers
│   │   │   ├── __init__.py                 # api_router assembly (/api prefix)
│   │   │   ├── health.py                   # GET  /api/health
│   │   │   ├── upload.py                   # POST /api/upload
│   │   │   └── scan.py                     # POST /api/scan/*, GET status, graph endpoints
│   │   │
│   │   ├── services/                       # Core ML / CV / rules pipeline
│   │   │   ├── __init__.py
│   │   │   ├── ocr.py                      # Module 1 — docTR OCR + field extraction
│   │   │   ├── validation.py               # Module 2 — PAN / Verhoeff / MRZ rules
│   │   │   ├── forensics.py                # Module 3 — ELA tampering analysis
│   │   │   ├── biometrics.py               # Module 4 — DeepFace ArcFace verify + embed
│   │   │   ├── liveness.py                 # Module 4b — MiniFASNet + heuristic anti-spoof
│   │   │   ├── graph.py                    # Module 5 — NetworkX identity fraud graph
│   │   │   ├── risk_engine.py              # Weighted 0–100 composite risk score
│   │   │   └── orchestrator.py             # ScanOrchestrator — chains all modules by phase
│   │   │
│   │   ├── schemas/                        # Pydantic request/response models
│   │   │   ├── __init__.py
│   │   │   └── scan_result.py              # ScanResult, Penalties, RiskResult, etc.
│   │   │
│   │   └── tasks/                          # Async job workers (Phase 8)
│   │       ├── __init__.py
│   │       └── scan_task.py                # Celery app + run_scan_task
│   │
│   ├── models/                             # ML model weights (not in git if large)
│   │   └── antispoof/
│   │       ├── README.md                   # Instructions to download MiniFASNetV2.pth
│   │       └── MiniFASNetV2.pth            # (optional) Silent-Face anti-spoof weights
│   │
│   └── uploads/                            # ⚠ Runtime storage — gitignored
│       ├── doc_*.jpg                       # Uploaded identity documents
│       ├── selfie_*.jpg                    # Webcam selfie captures
│       ├── ela/                            # Generated ELA heatmap PNGs
│       │   └── {scan_id}_ela.png
│       └── faces/                          # Cropped ID photo regions
│           └── {scan_id}_doc.jpg
│
└── frontend/                               # React + Vite operator dashboard
    ├── index.html                          # Vite HTML shell
    ├── package.json                        # npm dependencies & scripts
    ├── package-lock.json
    ├── vite.config.ts                      # Vite dev server + Tailwind plugin
    ├── tsconfig.json                       # TypeScript root config
    ├── tsconfig.app.json                   # App-specific TS config
    ├── tsconfig.node.json                  # Node/build TS config
    ├── .oxlintrc.json                      # Oxlint rules
    ├── .gitignore
    ├── README.md
    │
    ├── public/
    │   ├── favicon.svg
    │   └── icons.svg                       # Static assets
    │
    ├── dist/                               # ⚠ Build output — gitignored (npm run build)
    │
    └── src/                                # React application source
        ├── main.tsx                        # React DOM entry
        ├── App.tsx                         # Root app component
        ├── App.css
        ├── index.css                       # TailwindCSS imports + global styles
        ├── api.ts                          # Backend API client (all /api/scan calls)
        │
        ├── assets/                         # Static images bundled by Vite
        │   ├── hero.png
        │   ├── react.svg
        │   └── vite.svg
        │
        ├── pages/
        │   └── Dashboard.tsx               # Main operator UI — all phase panels
        │
        └── components/                     # UI building blocks
            ├── UploadPanel.tsx             # Document upload + WebcamCapture export
            ├── ExtractedFieldsCard.tsx     # Phase 1 — OCR output display
            ├── ValidationChecklist.tsx     # Phase 2 — pass/fail rule badges
            ├── ElaViewer.tsx               # Phase 3 — side-by-side ELA heatmap
            ├── FaceMatchCard.tsx           # Phase 4 — match score & distance
            ├── RiskGauge.tsx               # Phase 5 — Recharts 0–100 gauge
            ├── GraphFraudPanel.tsx         # Phase 6 — fraud loop alerts
            ├── LivenessCard.tsx            # Phase 7 — spoof detection result
            └── UnifiedScanPanel.tsx        # Phase 5+ — full scan trigger + progress
```

### 11.2 Directory Legend

| Symbol / Path | Meaning |
| --- | --- |
| `★` | Primary reference document — read this first |
| `uploads/` | Created at runtime; excluded from git via `.gitignore` |
| `MiniFASNetV2.pth` | Optional weights file; heuristic fallback if absent |
| `venv/` | Python virtual environment (local only, gitignored) |
| `node_modules/` | npm packages (local only, gitignored) |
| `__pycache__/` | Python bytecode cache (gitignored) |
| `dist/` | Frontend production build output (gitignored) |
| `.cursor/` | Cursor IDE config (local only) |

### 11.3 Key Files by Concern

| Concern | Primary Location |
| --- | --- |
| API entry & middleware | `backend/app/main.py` |
| All scan endpoints | `backend/app/routes/scan.py` |
| Pipeline orchestration | `backend/app/services/orchestrator.py` |
| Shared response schema | `backend/app/schemas/scan_result.py` |
| Async job queue | `backend/app/tasks/scan_task.py` |
| Frontend API calls | `frontend/src/api.ts` |
| Operator dashboard | `frontend/src/pages/Dashboard.tsx` |
| Environment config | `.env.example` → copy to `.env` |
| Container orchestration | `docker-compose.yml` |
| Python dependencies | `backend/requirements.txt` |
| Frontend dependencies | `frontend/package.json` |

### 11.4 Phase → Directory Mapping

| Phase | Backend Files Added / Modified | Frontend Files Added / Modified |
| --- | --- | --- |
| **0** | `main.py`, `routes/health.py`, `routes/upload.py`, `config.py` | `App.tsx`, `UploadPanel.tsx`, `vite.config.ts` |
| **1** | `services/ocr.py`, `schemas/scan_result.py` | `ExtractedFieldsCard.tsx`, `api.ts` |
| **2** | `services/validation.py` | `ValidationChecklist.tsx` |
| **3** | `services/forensics.py`, `uploads/ela/` | `ElaViewer.tsx` |
| **4** | `services/biometrics.py`, `uploads/faces/` | `FaceMatchCard.tsx`, `WebcamCapture` in `UploadPanel.tsx` |
| **5** | `services/risk_engine.py`, `services/orchestrator.py` | `RiskGauge.tsx`, `UnifiedScanPanel.tsx` |
| **6** | `services/graph.py` | `GraphFraudPanel.tsx` |
| **7** | `services/liveness.py`, `models/antispoof/` | `LivenessCard.tsx` |
| **8** | `tasks/scan_task.py`, `Dockerfile`, `docker-compose.yml` | Async progress UI in `Dashboard.tsx` |

---

## 12. Environment & Quick Start

### Prerequisites

| Tool | Minimum Version |
| --- | --- |
| Python | 3.11+ |
| Node.js | 18+ LTS |
| Git | Latest |
| Docker Desktop | Latest (Phase 8 only) |
| Webcam | 720p+ (Phase 4+) |

**Hardware:** 8 GB RAM minimum, 16 GB+ recommended. GPU optional but speeds OCR/face 3–10×.

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

### Phase 8 — Async Queue

```bash
docker compose up redis -d
cd backend
celery -A app.tasks.scan_task.celery_app worker --loglevel=info
```

Enable **Async queue** in the dashboard UI.

### Environment Variables (`.env`)

```env
UPLOAD_DIR=./uploads
CORS_ORIGINS=http://localhost:5173
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
# DATABASE_URL=postgresql://...   # optional Phase 6 persistence
```

### API Keys

**None required** for Phases 0–8. The core prototype is fully local. Optional cloud fallbacks (Mindee Cloud, AWS Rekognition, Azure Face) are documented in [`SIH_PS26188.md`](./SIH_PS26188.md) Section 7.2.

---

## 13. Demo Script for Judges

Run these 5 scenarios live:

| # | Scenario | Input | Expected Result |
| --- | --- | --- | --- |
| 1 | **Clean case** | Valid PAN + matching face | Risk **LOW** (~10–25) |
| 2 | **Bad document** | Wrong PAN checksum | `P_mrz` spikes → **MEDIUM/HIGH** |
| 3 | **Tampered doc** | Edited sample document | ELA heatmap shows bright patches, `P_ela` elevated |
| 4 | **Face mismatch** | Wrong person's selfie | `P_face` high, `verified: false` |
| 5 | **Fraud loop** | Same person, second document | Graph alert, `P_graph` penalty |

**Liveness demo (Phase 7):** Show photo on phone → FAIL; live face → PASS.

**Test data rule:** Use **synthetic/mock documents only**. Never use real PAN/Aadhaar images.

---

## 14. Implementation Status

| Phase | Feature | Backend | Frontend | Notes |
| --- | --- | --- | --- | --- |
| 0 | Upload & health | ✅ | ✅ | |
| 1 | OCR extraction | ✅ | ✅ | docTR singleton at startup |
| 2 | Validation rules | ✅ | ✅ | PAN, Verhoeff, MRZ |
| 3 | ELA forensics | ✅ | ✅ | Side-by-side viewer |
| 4 | Face match | ✅ | ✅ | Webcam capture |
| 5 | Risk engine | ✅ | ✅ | Recharts gauge |
| 6 | Identity graph | ✅ | ✅ | In-memory NetworkX |
| 7 | Liveness | ✅ | ✅ | Heuristic + MiniFASNet slot |
| 8 | Async queue | ✅ | ✅ | Celery + Redis + Docker |

---

## 15. Design Principles & Anti-Patterns

### Principles

| Principle | Rationale |
| --- | --- |
| Sync first, async later | Debug ML pipeline before adding Celery complexity |
| One document type first | PAN before passport MRZ |
| In-memory graph first | NetworkX before PostgreSQL/pgvector |
| Demo after every phase | Never go 2+ days without visible progress |
| Fix interfaces early | All modules write to shared `ScanResult` schema |
| Incremental dependencies | Install ML libs phase-by-phase, not all on Day 1 |

### Anti-Patterns to Avoid

| Anti-pattern | Why it hurts |
| --- | --- |
| Installing all ML libs on Day 1 | Dependency conflicts, 5+ GB downloads |
| PostgreSQL before NetworkX works | Over-engineering persistence |
| Celery before sync pipeline works | Debugging async + ML simultaneously |
| Building all modules in parallel | Integration bugs, no demo until last day |
| Real Aadhaar/PAN in test data | Privacy and legal risk |

---

## 16. Optional Upgrades & Future Work

| Upgrade | Technology | When to Add |
| --- | --- | --- |
| Persistent identity graph | PostgreSQL 16 + pgvector | Production / multi-server deployment |
| GPU inference | CUDA PyTorch | When CPU latency > 15 s per scan |
| Cloud OCR fallback | Mindee API / Google Vision | When docTR fails on low-quality scans |
| Cloud face fallback | AWS Rekognition / Azure Face | Enterprise integration |
| Multi-worker production | Gunicorn + multiple Celery workers | High-throughput checkpoints |
| EasyOCR fallback | EasyOCR | Regional Indian script edge cases |
| HTTPS deployment | Reverse proxy (nginx) | Non-localhost webcam access |

---

## Document History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | Sep 2026 | Initial master architecture document synthesized from PS-26188 spec and implemented codebase |
| 1.0.1 | Sep 2026 | Added complete directory structure tree, legend, and phase-to-file mapping |

---

*For detailed step-by-step build instructions, troubleshooting, and test data checklists, see the extended reference in [`SIH_PS26188.md`](./SIH_PS26188.md).*
