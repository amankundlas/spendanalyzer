"""Tiny in-process job registry for slow background work (PDF extraction).

Single-user app, single uvicorn process — so an in-memory dict guarded by a lock
plus a one-worker thread pool is plenty. Jobs do not survive a restart; the
client simply re-uploads if that happens. `submit` is overridable in tests to
run the work inline and deterministically.
"""

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

# One worker: only one extraction (one model) runs at a time, which also keeps
# the minipc's RAM footprint predictable.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="job")
_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def create_job() -> str:
    job_id = uuid.uuid4().hex
    with _lock:
        # `result` holds the job's payload when done (PDF rows, categorize count…).
        _jobs[job_id] = {"status": "pending", "result": None, "detail": None}
    return job_id


def update_job(job_id: str, **fields: Any) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job is not None else None


def submit(fn: Callable[..., None], *args: Any) -> None:
    """Run fn(*args) off the request thread. Overridden in tests to run inline."""
    _executor.submit(fn, *args)
