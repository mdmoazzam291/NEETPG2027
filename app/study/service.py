"""Deterministic study workflow built on canonical questions and persisted attempts."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import distinct, exists, func, select, text

from app.db.models import (
    Attempt,
    AttemptOutcome,
    LifecycleStatus,
    Question,
    QuestionOccurrence,
    QuestionOption,
    QuestionType,
    VerificationAspect,
)
from app.media.service import media_view

ELIGIBLE_STATUSES = (
    LifecycleStatus.IMPORTED,
    LifecycleStatus.VALIDATED,
    LifecycleStatus.VERIFIED,
    LifecycleStatus.ACTIVE,
)


def _answer_verification(question: Question) -> str:
    for state in question.verification_states:
        if state.verification_aspect == VerificationAspect.ANSWER:
            return state.status.value
    return "unverified"


def _is_bookmarked(session, question_id: int) -> bool:
    return session.execute(
        text("SELECT 1 FROM question_bookmarks WHERE question_id = :question_id"),
        {"question_id": question_id},
    ).first() is not None


def _eligible_statement():
    return select(Question).where(
        Question.question_type == QuestionType.SINGLE_BEST_ANSWER,
        Question.lifecycle_status.in_(ELIGIBLE_STATUSES),
        Question.duplicate_of_question_id.is_(None),
    )


def _option_view(question: Question, option: QuestionOption) -> dict:
    option_media = [
        media_view(item)
        for item in sorted(question.media, key=lambda media: (media.position, media.id))
        if item.question_option_id == option.id
    ]
    return {
        "id": option.id,
        "position": option.position,
        "label": option.label,
        "text": option.text,
        "media": option_media,
    }


def question_view(session, question: Question) -> dict:
    """Return a pre-answer-safe question representation with no correctness fields."""
    stem_media = [
        media_view(item)
        for item in sorted(question.media, key=lambda media: (media.position, media.id))
        if item.question_option_id is None
    ]
    return {
        "id": question.id,
        "stem": question.stem,
        "question_type": question.question_type.value,
        "difficulty": question.difficulty,
        "is_clinical": question.is_clinical,
        "is_integrated": question.is_integrated,
        "answer_verification_status": _answer_verification(question),
        "bookmarked": _is_bookmarked(session, question.id),
        "media": stem_media,
        "options": [_option_view(question, option) for option in sorted(question.options, key=lambda option: option.position)],
    }


def queue(session, mode: str, limit: int, offset: int = 0) -> list[dict]:
    stmt = _eligible_statement()
    if mode == "unseen":
        stmt = stmt.where(~Question.attempts.any())
    elif mode == "incorrect":
        latest_attempt_id = (
            select(func.max(Attempt.id))
            .where(Attempt.question_id == Question.id)
            .correlate(Question)
            .scalar_subquery()
        )
        stmt = stmt.where(
            exists().where(
                Attempt.id == latest_attempt_id,
                Attempt.outcome == AttemptOutcome.INCORRECT,
            )
        )
    elif mode == "bookmarked":
        ids = [row[0] for row in session.execute(text("SELECT question_id FROM question_bookmarks ORDER BY created_at, id"))]
        if not ids:
            return []
        stmt = stmt.where(Question.id.in_(ids))
    elif mode != "all":
        raise HTTPException(422, "unsupported study mode")
    questions = session.scalars(stmt.order_by(Question.id).offset(offset).limit(limit)).unique().all()
    return [question_view(session, question) for question in questions]


def _get_study_question(session, question_id: int) -> Question:
    question = session.get(Question, question_id)
    if question is None:
        raise HTTPException(404, "question not found")
    if (
        question.question_type != QuestionType.SINGLE_BEST_ANSWER
        or question.lifecycle_status not in ELIGIBLE_STATUSES
        or question.duplicate_of_question_id is not None
    ):
        raise HTTPException(409, "question is not eligible for this study workflow")
    return question


def _validate_occurrence(session, question: Question, occurrence_id: int | None) -> int | None:
    if occurrence_id is None:
        return None
    occurrence = session.get(QuestionOccurrence, occurrence_id)
    if occurrence is None or occurrence.question_id != question.id:
        raise HTTPException(422, "occurrence_id does not belong to this question")
    return occurrence.id


def submit_attempt(session, question_id: int, payload) -> dict:
    question = _get_study_question(session, question_id)
    correct_options = sorted((option for option in question.options if option.is_correct), key=lambda option: option.position)
    if len(correct_options) != 1:
        raise HTTPException(409, "single-best-answer question does not have exactly one stored correct option")

    selected_option = None
    if not payload.skipped:
        selected_option = session.get(QuestionOption, payload.selected_option_id)
        if selected_option is None or selected_option.question_id != question.id:
            raise HTTPException(422, "selected option does not belong to this question")

    if payload.skipped:
        outcome = AttemptOutcome.SKIPPED
    elif selected_option.id == correct_options[0].id:
        outcome = AttemptOutcome.CORRECT
    else:
        outcome = AttemptOutcome.INCORRECT

    attempt = Attempt(
        question_id=question.id,
        occurrence_id=_validate_occurrence(session, question, payload.occurrence_id),
        outcome=outcome,
        selected_option=None if selected_option is None else str(selected_option.id),
        confidence=payload.confidence,
        time_spent_seconds=payload.time_spent_seconds,
    )
    session.add(attempt)
    session.flush()

    return {
        "attempt_id": attempt.id,
        "question_id": question.id,
        "outcome": attempt.outcome.value,
        "selected_option_id": None if selected_option is None else selected_option.id,
        "confidence": attempt.confidence,
        "time_spent_seconds": attempt.time_spent_seconds,
        "attempted_at": attempt.attempted_at.isoformat(),
        "answer_verification_status": _answer_verification(question),
        "correct_option_ids": [correct_options[0].id],
        "answer_explanation": question.answer_explanation,
        "reference_text": question.reference_text,
        "options": [
            {
                "id": option.id,
                "position": option.position,
                "label": option.label,
                "text": option.text,
                "is_correct": option.is_correct,
                "explanation": option.explanation,
            }
            for option in sorted(question.options, key=lambda option: option.position)
        ],
    }


def review_attempt(session, attempt_id: int, payload) -> dict:
    attempt = session.get(Attempt, attempt_id)
    if attempt is None:
        raise HTTPException(404, "attempt not found")
    fields = payload.model_fields_set
    if "mistake_category" in fields:
        attempt.mistake_category = payload.mistake_category
    if "user_notes" in fields:
        attempt.user_notes = payload.user_notes
    session.flush()
    return attempt_view(attempt)


def attempt_view(attempt: Attempt) -> dict:
    selected_option_id = None
    if attempt.selected_option:
        try:
            selected_option_id = int(attempt.selected_option)
        except ValueError:
            selected_option_id = None
    return {
        "id": attempt.id,
        "question_id": attempt.question_id,
        "stem": attempt.question.stem,
        "outcome": attempt.outcome.value,
        "selected_option_id": selected_option_id,
        "confidence": attempt.confidence,
        "time_spent_seconds": attempt.time_spent_seconds,
        "mistake_category": attempt.mistake_category,
        "user_notes": attempt.user_notes,
        "attempted_at": attempt.attempted_at.isoformat(),
    }


def history(session, limit: int, offset: int = 0) -> list[dict]:
    attempts = session.scalars(
        select(Attempt).order_by(Attempt.attempted_at.desc(), Attempt.id.desc()).offset(offset).limit(limit)
    ).all()
    return [attempt_view(attempt) for attempt in attempts]


def bookmark(session, question_id: int) -> dict:
    _get_study_question(session, question_id)
    existing = session.execute(
        text("SELECT id FROM question_bookmarks WHERE question_id = :question_id"),
        {"question_id": question_id},
    ).first()
    if existing is None:
        session.execute(
            text("INSERT INTO question_bookmarks (question_id, created_at) VALUES (:question_id, CURRENT_TIMESTAMP)"),
            {"question_id": question_id},
        )
    return {"question_id": question_id, "bookmarked": True}


def unbookmark(session, question_id: int) -> dict:
    _get_study_question(session, question_id)
    session.execute(
        text("DELETE FROM question_bookmarks WHERE question_id = :question_id"),
        {"question_id": question_id},
    )
    return {"question_id": question_id, "bookmarked": False}


def summary(session) -> dict:
    total_attempts = session.scalar(select(func.count(Attempt.id))) or 0
    correct = session.scalar(select(func.count(Attempt.id)).where(Attempt.outcome == AttemptOutcome.CORRECT)) or 0
    incorrect = session.scalar(select(func.count(Attempt.id)).where(Attempt.outcome == AttemptOutcome.INCORRECT)) or 0
    skipped = session.scalar(select(func.count(Attempt.id)).where(Attempt.outcome == AttemptOutcome.SKIPPED)) or 0
    questions_attempted = session.scalar(select(func.count(distinct(Attempt.question_id)))) or 0
    average_time = session.scalar(select(func.avg(Attempt.time_spent_seconds)))
    bookmarks = session.execute(text("SELECT COUNT(*) FROM question_bookmarks")).scalar_one()
    eligible_subquery = _eligible_statement().subquery()
    eligible = session.scalar(select(func.count()).select_from(eligible_subquery)) or 0
    scored = correct + incorrect
    accuracy = round((correct / scored) * 100, 1) if scored else None
    return {
        "eligible_questions": eligible,
        "questions_attempted": questions_attempted,
        "unseen_questions": max(eligible - questions_attempted, 0),
        "total_attempts": total_attempts,
        "correct": correct,
        "incorrect": incorrect,
        "skipped": skipped,
        "accuracy_percent": accuracy,
        "average_time_seconds": None if average_time is None else round(float(average_time), 1),
        "bookmarks": bookmarks,
    }
