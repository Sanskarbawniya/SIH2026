# Identity Screening System — SIH 2026

AI-Based Fake Identity & Document Screening System for border checkpoints and eKYC portals.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- (Optional Phase 8) Docker Desktop + Redis

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

### Phase 8 — Async Queue (optional)

```bash
docker compose up redis -d
cd backend
celery -A app.tasks.scan_task.celery_app worker --loglevel=info
```

Enable **Async queue** checkbox in the dashboard UI.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload` | POST | Raw file upload |
| `/api/scan/document` | POST | OCR + validation + ELA |
| `/api/scan/full` | POST | Full pipeline (sync or async job) |
| `/api/scan/{job_id}/status` | GET | Async job polling |
| `/api/graph/alerts` | GET | Fraud loop alerts |

## Build Phases

See [SIH_PS26188.md](./SIH_PS26188.md) for the full architecture spec and phase-by-phase guide.

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
| 8 — Celery async queue | Done |

## Liveness Weights (Phase 7)

Place `MiniFASNetV2.pth` in `backend/models/antispoof/` for full anti-spoofing. Without weights, a Laplacian variance heuristic is used.

## Test Data

Use **synthetic/mock documents only** — never commit real PAN/Aadhaar images.
