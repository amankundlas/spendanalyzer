from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.services.llm_categorize import ai_categorize_uncategorized
from app.services.ollama import OllamaCategorizer, get_categorizer

router = APIRouter()


class AiCategorizeResult(BaseModel):
    updated: int


@router.post("/categorize/ai", response_model=AiCategorizeResult)
def categorize_ai(
    session: Session = Depends(get_session),
    categorizer: OllamaCategorizer = Depends(get_categorizer),
) -> AiCategorizeResult:
    updated = ai_categorize_uncategorized(session, categorizer)
    return AiCategorizeResult(updated=updated)
