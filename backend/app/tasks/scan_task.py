import os

from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "identity_screening",
    broker=os.getenv("CELERY_BROKER_URL", REDIS_URL),
    backend=os.getenv("CELERY_RESULT_BACKEND", REDIS_URL),
)
celery_app.conf.update(
    task_track_started=True,
    result_extended=True,
)


@celery_app.task(bind=True, name="scan.run_full")
def run_scan_task(self, document_path: str, selfie_path: str | None, scan_id: str):
    from app.services.orchestrator import get_orchestrator

    def progress_callback(progress: int, step: str):
        self.update_state(state="PROGRESS", meta={"progress": progress, "step": step})

    orchestrator = get_orchestrator()
    result = orchestrator.run_full_scan(
        document_path,
        selfie_path,
        scan_id=scan_id,
        progress_callback=progress_callback,
    )
    return result.model_dump()
