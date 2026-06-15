import json
from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, ValidationError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Account, ImportBatch
from app.schemas import ColumnMapping, DetectedColumns, ParsedRow
from app.services.csv_import import detect_columns
from app.services.imports import commit_import, delete_batch, persist_parsed_rows, preview_import
from app.services.ollama import OllamaExtractor, get_extractor
from app.services.pdf import extract_text, to_parsed_rows

router = APIRouter()


class ImportBatchOut(BaseModel):
    """Wire schema for an import batch (decoupled from the ORM table model)."""

    id: int
    account_id: int
    source: str
    filename: str
    imported_at: datetime
    added_count: int
    duplicate_count: int


async def _read_text(file: UploadFile) -> str:
    raw = await file.read()
    try:
        return raw.decode("utf-8-sig")  # tolerate BOM
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="file must be UTF-8 text") from exc


def _parse_mapping(mapping: str) -> ColumnMapping:
    try:
        return ColumnMapping.model_validate(json.loads(mapping))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"invalid mapping: {exc}") from exc


def _require_account(session: Session, account_id: int) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    return account


@router.post("/imports/analyze", response_model=DetectedColumns)
async def analyze(file: UploadFile = File(...)) -> DetectedColumns:
    text = await _read_text(file)
    return detect_columns(text)


@router.post("/imports/commit", response_model=None)
async def commit(
    response: Response,
    dry_run: bool = False,
    account_id: int = Form(...),
    mapping: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    """Preview (dry_run=true, 200) or persist (201) a CSV import.

    Returns ImportPreview on dry runs and ImportResult on commit. Both are
    Pydantic models returned directly so FastAPI handles JSON serialization.
    """
    _require_account(session, account_id)
    text = await _read_text(file)
    parsed_mapping = _parse_mapping(mapping)
    try:
        if dry_run:
            return preview_import(session, account_id, text, parsed_mapping)
        result = commit_import(
            session, account_id, file.filename or "upload.csv", text, parsed_mapping
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response.status_code = status.HTTP_201_CREATED
    return result


@router.get("/imports", response_model=list[ImportBatchOut])
def list_batches(
    account_id: int, session: Session = Depends(get_session)
) -> list[ImportBatch]:
    return list(
        session.exec(
            select(ImportBatch)
            .where(ImportBatch.account_id == account_id)
            .order_by(ImportBatch.imported_at.desc())
        )
    )


@router.delete("/imports/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_batch(batch_id: int, session: Session = Depends(get_session)) -> None:
    if session.get(ImportBatch, batch_id) is None:
        raise HTTPException(status_code=404, detail="batch not found")
    delete_batch(session, batch_id)


class PdfExtractResult(BaseModel):
    rows: list[ParsedRow]


@router.post("/imports/pdf/extract", response_model=PdfExtractResult)
async def pdf_extract(
    file: UploadFile = File(...),
    extractor: OllamaExtractor = Depends(get_extractor),
) -> PdfExtractResult:
    raw = await file.read()
    try:
        text = extract_text(raw)
    except Exception as exc:  # malformed PDF
        raise HTTPException(status_code=400, detail="could not read PDF") from exc
    rows = to_parsed_rows(extractor.extract(text))
    return PdfExtractResult(rows=rows)


class PdfCommitBody(BaseModel):
    account_id: int
    filename: str = "statement.pdf"
    rows: list[ParsedRow]


@router.post("/imports/pdf/commit", status_code=status.HTTP_201_CREATED)
def pdf_commit(body: PdfCommitBody, session: Session = Depends(get_session)):
    _require_account(session, body.account_id)
    return persist_parsed_rows(session, body.account_id, body.filename, "pdf", body.rows)
