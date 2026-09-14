"""Preview never inserts questions. Commit rechecks identities under a write lock."""
import csv
import hashlib
import io
import json
import unicodedata
from difflib import SequenceMatcher

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.db.base import utcnow
from app.db.models import (
    ExamAdministration, ImportBatch, ImportBatchStatus, ImportFormat, ImportRow,
    ImportRowStatus, Question, QuestionOccurrence, QuestionOption, QuestionTaxonomyTag,
    QuestionType, QuestionVerificationState, Source, Subject, Subtopic, System, Topic,
    VerificationAspect,
)
from app.imports.schemas import QuestionInput

MAX_ROWS = 500
TAXONOMY = {"subject_ids": (Subject, "subject_id"), "system_ids": (System, "system_id"),
            "topic_ids": (Topic, "topic_id"), "subtopic_ids": (Subtopic, "subtopic_id")}


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def normalize(text):
    return " ".join(unicodedata.normalize("NFKC", text).split()).casefold()


def fingerprint(data):
    # Ordered options and answer are significant; explanation/provenance are not.
    value = [normalize(data.stem), data.question_type,
             [[normalize(o.text), o.is_correct] for o in data.options]]
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def question_fingerprint(question):
    value = [normalize(question.stem), question.question_type.value,
             [[normalize(o.text), o.is_correct] for o in sorted(question.options, key=lambda o: o.position)]]
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def parse(content, input_format):
    try:
        if input_format == "json":
            rows = json.loads(content.lstrip('\ufeff'), parse_constant=lambda value: (_ for _ in ()).throw(ValueError("non-finite JSON number")))
            if not isinstance(rows, list):
                raise ValueError("JSON must be an array of question objects")
        else:
            reader = csv.DictReader(io.StringIO(content.lstrip('\ufeff')), strict=True)
            fields = reader.fieldnames
            if not fields or len(fields) != len(set(fields)):
                raise ValueError("CSV requires unique column headers")
            rows = []
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError("CSV row width does not match headers")
                rows.append(row)
                if len(rows) > MAX_ROWS:
                    raise ValueError(f"use 1–{MAX_ROWS} rows per batch")
        if not 1 <= len(rows) <= MAX_ROWS:
            raise ValueError(f"use 1–{MAX_ROWS} rows per batch")
        return rows
    except (ValueError, csv.Error, RecursionError) as exc:
        raise HTTPException(422, str(exc)) from exc


def validated(raw, input_format, session):
    if input_format == "csv":
        raw = {key: value for key, value in raw.items() if value != ""}
        for field in ("options", "difficulty", "is_clinical", "is_integrated",
                      "exam_administration_id", *TAXONOMY):
            if field in raw:
                raw[field] = json.loads(raw[field])
    data = QuestionInput.model_validate(raw)
    for field, (model, _) in TAXONOMY.items():
        for identity in getattr(data, field):
            if session.get(model, identity) is None:
                raise ValueError(f"unknown {field}: {identity}")
    if data.exam_administration_id and not session.get(ExamAdministration, data.exam_administration_id):
        raise ValueError("unknown exam_administration_id")
    return data


def existing_occurrence(session, source, external_id):
    # Retain compatibility with Phase 1's legacy source-name unique index.
    return session.scalar(select(QuestionOccurrence).where(
        ((QuestionOccurrence.source_id == source.id) | (QuestionOccurrence.source == source.name)),
        QuestionOccurrence.source_identifier == external_id))


def candidates(session, data):
    exact = session.scalar(select(Question).where(
        Question.content_hash == fingerprint(data), Question.content_fingerprint_version == "v2").order_by(Question.id))
    if exact:
        return ImportRowStatus.EXACT_DUPLICATE, exact.id
    # Personal local database: deterministic full scan, bounded batch size. No fuzzy auto-merge.
    best, best_score = None, 0.90
    for question in session.scalars(select(Question).order_by(Question.id)):
        if question_fingerprint(question) == fingerprint(data):
            return ImportRowStatus.EXACT_DUPLICATE, question.id
        score = SequenceMatcher(None, normalize(data.stem), normalize(question.stem), autojunk=False).ratio()
        if score >= best_score:
            best, best_score = question.id, score
    return (ImportRowStatus.PROBABLE_DUPLICATE, best) if best else (ImportRowStatus.ACCEPTED, None)


def recount(batch):
    batch.accepted_count = sum(r.status == ImportRowStatus.ACCEPTED for r in batch.rows)
    batch.rejected_count = sum(r.status == ImportRowStatus.REJECTED for r in batch.rows)
    batch.duplicate_count = sum(r.status in (ImportRowStatus.EXACT_DUPLICATE, ImportRowStatus.PROBABLE_DUPLICATE) for r in batch.rows)


def preview(session, payload):
    source = session.get(Source, payload.source_id)
    if source is None:
        raise HTTPException(404, "source not found")
    raw_rows = parse(payload.content, payload.input_format)
    batch = ImportBatch(source_id=source.id, input_format=ImportFormat(payload.input_format),
                        input_name=payload.input_name, input_checksum=hashlib.sha256(payload.content.encode()).hexdigest(),
                        schema_version="v1", row_count=len(raw_rows))
    session.add(batch)
    seen_ids, seen_content = set(), set()
    for number, raw in enumerate(raw_rows, 1):
        row = ImportRow(row_number=number, raw_payload=dumps(raw), status=ImportRowStatus.REJECTED)
        batch.rows.append(row)
        try:
            data = validated(raw, payload.input_format, session)
            row.external_id = data.external_id
            row.normalized_payload = dumps({"question": data.model_dump(), "review": None})
            if data.external_id in seen_ids:
                raise ValueError("external_id repeats within this batch")
            seen_ids.add(data.external_id)
            occurrence = existing_occurrence(session, source, data.external_id)
            if occurrence:
                raise ValueError("source external_id already exists; reimport cannot overwrite it")
            row.status, row.matched_question_id = candidates(session, data)
            digest = fingerprint(data)
            if digest in seen_content and row.status == ImportRowStatus.ACCEPTED:
                row.status = ImportRowStatus.REQUIRES_REVIEW
                row.validation_errors = dumps(["same content appears earlier in this batch; explicitly create or reject"])
            seen_content.add(digest)
        except (ValueError, TypeError, ValidationError) as exc:
            row.status = ImportRowStatus.REJECTED
            row.normalized_payload = None
            row.validation_errors = dumps([str(exc)])
    recount(batch)
    session.flush()
    return batch


def review(session, batch, row_id, decision):
    if batch.completed_at:
        raise HTTPException(409, "batch is already committed")
    row = next((row for row in batch.rows if row.id == row_id), None)
    if row is None:
        raise HTTPException(404, "row not found in batch")
    if row.normalized_payload is None:
        raise HTTPException(409, "invalid rows must be corrected in a new preview")
    payload = json.loads(row.normalized_payload)
    if decision.action == "link":
        question = session.get(Question, decision.question_id)
        if question is None:
            raise HTTPException(404, "target question not found")
        payload["target_fingerprint"] = question_fingerprint(question)
    payload["review"] = decision.model_dump() | {"reviewed_at": utcnow().isoformat()}
    row.normalized_payload = dumps(payload)
    row.status = ImportRowStatus.REJECTED if decision.action == "reject" else ImportRowStatus.ACCEPTED
    recount(batch)


def commit(session, batch):
    if batch.completed_at:
        return batch
    if any(row.status in (ImportRowStatus.EXACT_DUPLICATE, ImportRowStatus.PROBABLE_DUPLICATE,
                           ImportRowStatus.REQUIRES_REVIEW) for row in batch.rows):
        raise HTTPException(409, "resolve flagged rows before committing")
    source = session.get(Source, batch.source_id)
    for row in sorted(batch.rows, key=lambda row: row.row_number):
        if row.status == ImportRowStatus.REJECTED:
            continue
        payload = json.loads(row.normalized_payload)
        data = validated(payload["question"], "json", session)
        if existing_occurrence(session, source, data.external_id):
            raise HTTPException(409, "source external_id changed since preview; create a fresh preview")
        decision = payload["review"]
        if decision and decision["action"] == "link":
            question = session.get(Question, decision["question_id"])
            if question is None or question_fingerprint(question) != payload["target_fingerprint"]:
                raise HTTPException(409, "link target changed since review")
        else:
            if not decision and candidates(session, data)[0] != ImportRowStatus.ACCEPTED:
                raise HTTPException(409, "new duplicate candidate since preview; review row or preview again")
            question = Question(stem=data.stem, question_type=QuestionType(data.question_type),
                                answer_explanation=data.answer_explanation, reference_text=data.reference_text,
                                difficulty=data.difficulty, is_clinical=data.is_clinical, is_integrated=data.is_integrated,
                                content_hash=fingerprint(data), content_fingerprint_version="v2")
            question.options = [QuestionOption(position=i, **option.model_dump()) for i, option in enumerate(data.options, 1)]
            question.verification_states = [QuestionVerificationState(verification_aspect=aspect) for aspect in VerificationAspect]
            for field, (_, column) in TAXONOMY.items():
                question.taxonomy_tags.extend(QuestionTaxonomyTag(**{column: identity}) for identity in getattr(data, field))
            session.add(question)
            session.flush()
        administration = session.get(ExamAdministration, data.exam_administration_id) if data.exam_administration_id else None
        occurrence = QuestionOccurrence(question_id=question.id, source=source.name, source_id=source.id,
                                        source_identifier=data.external_id, question_number=data.question_number,
                                        exam_administration_id=data.exam_administration_id,
                                        exam_year=administration.exam_year if administration else None,
                                        source_reference=data.reference_text)
        session.add(occurrence)
        session.flush()
        row.question_id, row.question_occurrence_id = question.id, occurrence.id
    recount(batch)
    batch.completed_at = utcnow()
    batch.status = (ImportBatchStatus.REJECTED if batch.rejected_count == batch.row_count else
                    ImportBatchStatus.PARTIALLY_REJECTED if batch.rejected_count else ImportBatchStatus.IMPORTED)
    session.flush()
    return batch


def batch_view(batch):
    return {"id": batch.id, "status": batch.status.value, "source_id": batch.source_id,
            "input_name": batch.input_name, "input_checksum": batch.input_checksum,
            "schema_version": batch.schema_version, "completed_at": batch.completed_at,
            "row_count": batch.row_count, "accepted_count": batch.accepted_count,
            "rejected_count": batch.rejected_count, "duplicate_count": batch.duplicate_count,
            "rows": [{"id": row.id, "row_number": row.row_number, "status": row.status.value,
                      "external_id": row.external_id, "raw_payload": json.loads(row.raw_payload),
                      "normalized_payload": json.loads(row.normalized_payload) if row.normalized_payload else None,
                      "errors": json.loads(row.validation_errors) if row.validation_errors else [],
                      "matched_question_id": row.matched_question_id, "question_id": row.question_id,
                      "question_occurrence_id": row.question_occurrence_id}
                     for row in sorted(batch.rows, key=lambda row: row.row_number)]}
