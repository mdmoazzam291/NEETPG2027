"""Study API: safe question delivery, server-side scoring, history, and bookmarks."""
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.imports.api import database
from app.study import service
from app.study.schemas import AttemptInput, AttemptReviewInput

router = APIRouter(prefix="/api/study", tags=["study"])
StudyMode = Literal["unseen", "incorrect", "bookmarked", "all"]


@router.get("/queue")
def study_queue(
    mode: StudyMode = "unseen",
    limit: int = Query(15, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session=Depends(database),
):
    return {"mode": mode, "questions": service.queue(session, mode, limit, offset)}


@router.get("/questions/{question_id}")
def study_question(question_id: int, session=Depends(database)):
    return service.question_view(session, service._get_study_question(session, question_id))


@router.post("/questions/{question_id}/attempts", status_code=201)
def submit_attempt(question_id: int, payload: AttemptInput, session=Depends(database)):
    return service.submit_attempt(session, question_id, payload)


@router.patch("/attempts/{attempt_id}")
def review_attempt(attempt_id: int, payload: AttemptReviewInput, session=Depends(database)):
    return service.review_attempt(session, attempt_id, payload)


@router.get("/history")
def attempt_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session=Depends(database),
):
    return service.history(session, limit, offset)


@router.get("/summary")
def study_summary(session=Depends(database)):
    return service.summary(session)


@router.put("/questions/{question_id}/bookmark")
def add_bookmark(question_id: int, session=Depends(database)):
    return service.bookmark(session, question_id)


@router.delete("/questions/{question_id}/bookmark")
def remove_bookmark(question_id: int, session=Depends(database)):
    return service.unbookmark(session, question_id)
