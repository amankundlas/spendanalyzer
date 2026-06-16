from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_engine
from app.services import jobs
from app.services.llm_categorize import ai_categorize_uncategorized
from app.services.ollama import OllamaCategorizer, get_categorizer

router = APIRouter()


class CategorizeJobStart(BaseModel):
    job_id: str


class CategorizeJobOut(BaseModel):
    status: str  # pending | running | done | error
    updated: int | None = None
    detail: str | None = None


def _run_ai_categorize(job_id: str, categorizer: OllamaCategorizer) -> None:
    """Background worker: categorize every uncategorized txn (one slow LLM call each)."""
    jobs.update_job(job_id, status="running")
    try:
        # Fresh session: the request's session is closed by the time this runs.
        with Session(get_engine()) as session:
            updated = ai_categorize_uncategorized(session, categorizer)
    except Exception:
        jobs.update_job(
            job_id,
            status="error",
            detail="AI categorization couldn't finish (the model may have timed out). Please try again.",
        )
        return
    jobs.update_job(job_id, status="done", result={"updated": updated})


@router.post("/categorize/ai", response_model=CategorizeJobStart, status_code=status.HTTP_202_ACCEPTED)
def categorize_ai(
    categorizer: OllamaCategorizer = Depends(get_categorizer),
) -> CategorizeJobStart:
    """Start categorization in the background and return a job id to poll.

    Categorizing a whole statement is many sequential LLM calls (minutes); a
    synchronous request would be dropped by mobile browsers, so the client polls
    /categorize/ai/jobs/{job_id} instead.
    """
    job_id = jobs.create_job()
    jobs.submit(_run_ai_categorize, job_id, categorizer)
    return CategorizeJobStart(job_id=job_id)


@router.get("/categorize/ai/jobs/{job_id}", response_model=CategorizeJobOut)
def categorize_job(job_id: str) -> CategorizeJobOut:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    updated = (job["result"] or {}).get("updated") if job["result"] else None
    return CategorizeJobOut(status=job["status"], updated=updated, detail=job["detail"])
