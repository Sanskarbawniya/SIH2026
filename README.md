# Identity Screening System — SIH 2026

AI-Based Fake Identity & Document Screening System for border checkpoints and eKYC portals.

> **Start here:** [`SIH_PROJECT.md`](./SIH_PROJECT.md) — master architecture, system design, tech stack, and phase-by-phase build plan.  
> Problem statement reference: [`SIH_PS26188.md`](./SIH_PS26188.md)

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+

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

Open http://localhost:5173

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload` | POST | Raw file upload |
| `/api/scan/ocr` | POST | OCR only (Phase 1) |
| `/api/scan/document` | POST | OCR + validation (Phase 2) |
| `/api/scan/forensics` | POST | OCR + validation + ELA (Phase 3) |
| `/api/scan/face` | POST | Face match (Phase 4) |
| `/api/scan/full` | POST | Full sync pipeline (Phase 5) |
| `/api/scan/graph` | POST | Full pipeline + identity graph (Phase 6) |
| `/api/scan/liveness` | POST | Liveness + face + graph (Phase 7) |
| `/api/graph/alerts` | GET | Fraud loop alerts |
| `/api/graph/stats` | GET | In-memory graph stats |
| `/api/graph/reset` | DELETE | Clear graph |

## Build Phases

See [SIH_PROJECT.md](./SIH_PROJECT.md) for the master architecture document and phase-by-phase guide.

| Phase | Status |
|-------|--------|
| 0 — Skeleton & upload | Done |
| 1 — OCR (docTR) | Done |
| 2 — Validation engine | Done |
| 3 — ELA forensics | Done |
| 4 — Face match (DeepFace) | Done |
| 5 — Unified risk engine | Done |
| 6 — Identity graph | Done |
| 7 — Liveness (heuristic + MiniFASNet slot) | Done |

## Liveness Weights (Phase 7)

Place `MiniFASNetV2.pth` in `backend/models/antispoof/` for full anti-spoofing. Without weights, a Laplacian variance heuristic is used.

## Test Data

Use **synthetic/mock documents only** — never commit real PAN/Aadhaar images.
