"""Local-only API. Every write uses one transaction, serialized on SQLite."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.db.models import ImportBatch, Question, Source, SourceType
from app.imports import service
from app.imports.schemas import PreviewInput, ReviewInput, SourceInput

router = APIRouter(prefix="/api", tags=["imports"])


def database(request: Request):
    with request.app.state.session_factory() as session:
        try:
            if request.method != "GET" and session.bind.dialect.name == "sqlite":
                session.execute(text("BEGIN IMMEDIATE"))
            yield session
            session.commit()
        except (IntegrityError, OperationalError) as exc:
            session.rollback()
            raise HTTPException(409, "database conflict; refresh and retry") from exc
        except Exception:
            session.rollback()
            raise


def get_batch(session, batch_id):
    batch = session.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(404, "batch not found")
    if batch.schema_version != "pyq-import-v1":
        raise HTTPException(409, "unsupported legacy preview; create a new preview")
    return batch


@router.post("/sources", status_code=201)
def create_source(payload: SourceInput, session=Depends(database)):
    source = Source(**(payload.model_dump() | {"source_type": SourceType(payload.source_type)}))
    session.add(source)
    session.flush()
    return {"id": source.id, "name": source.name, "external_namespace": source.external_namespace,
            "verification_status": source.verification_status.value}


@router.get("/sources")
def sources(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), session=Depends(database)):
    return [{"id": source.id, "name": source.name, "external_namespace": source.external_namespace,
             "verification_status": source.verification_status.value}
            for source in session.scalars(select(Source).order_by(Source.id).offset(offset).limit(limit))]


@router.post("/imports/preview", status_code=201)
def preview(payload: PreviewInput, session=Depends(database)):
    return service.batch_view(service.preview(session, payload))


@router.get("/imports")
def batches(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), session=Depends(database)):
    return [{"id": batch.id, "status": batch.status.value, "input_name": batch.input_name,
             "row_count": batch.row_count, "completed_at": service.utc_timestamp(batch.completed_at)}
            for batch in session.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).offset(offset).limit(limit))]


@router.get("/imports/{batch_id}")
def batch_detail(batch_id: int, session=Depends(database)):
    return service.batch_view(get_batch(session, batch_id))


@router.post("/imports/{batch_id}/rows/{row_id}/review")
def review(batch_id: int, row_id: int, payload: ReviewInput, session=Depends(database)):
    batch = get_batch(session, batch_id)
    service.review(session, batch, row_id, payload)
    return service.batch_view(batch)


@router.post("/imports/{batch_id}/commit")
def commit(batch_id: int, session=Depends(database)):
    try:
        return service.batch_view(service.commit(session, get_batch(session, batch_id)))
    except ValueError as exc:
        raise HTTPException(409, "referenced data changed; create a fresh preview") from exc


@router.get("/questions/{question_id}")
def question_detail(question_id: int, session=Depends(database)):
    question = session.get(Question, question_id)
    if question is None:
        raise HTTPException(404, "question not found")
    return {"id": question.id, "stem": question.stem, "question_type": question.question_type.value,
            "answer_explanation": question.answer_explanation, "reference_text": question.reference_text,
            "lifecycle_status": question.lifecycle_status.value,
            "options": [{"id": o.id, "position": o.position, "label": o.label, "text": o.text, "is_correct": o.is_correct}
                        for o in sorted(question.options, key=lambda o: o.position)],
            "media": [{"id": item.id, "question_option_id": item.question_option_id,
                       "media_type": item.media_type.value, "alt_text": item.alt_text,
                       "caption": item.caption, "content_hash": item.content_hash,
                       "position": item.position, "content_url": f"/api/media/{item.id}/content"}
                      for item in sorted(question.media, key=lambda item: (item.position, item.id))],
            "verification": {v.verification_aspect.value: v.status.value for v in question.verification_states},
            "occurrences": [{"id": o.id, "source_id": o.source_id, "external_id": o.source_identifier,
                             "exam_administration_id": o.exam_administration_id} for o in question.occurrences]}
