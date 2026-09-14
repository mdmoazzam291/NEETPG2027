"""Content-addressed local storage for safe raster question media."""
import base64
import binascii
import hashlib
import os
import tempfile
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select

from app.db.models import MediaType, Question, QuestionMedia, QuestionOption

MAX_MEDIA_BYTES = 5 * 1024 * 1024
MIME_SUFFIX = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
SUFFIX_MIME = {value: key for key, value in MIME_SUFFIX.items()}


def _valid_magic(data: bytes, mime_type: str) -> bool:
    if mime_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if mime_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if mime_type == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def decode_image(content_base64: str, mime_type: str) -> bytes:
    try:
        data = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "image content is not valid base64") from exc
    if not data:
        raise HTTPException(422, "image content is empty")
    if len(data) > MAX_MEDIA_BYTES:
        raise HTTPException(413, "image exceeds 5 MiB limit")
    if not _valid_magic(data, mime_type):
        raise HTTPException(422, "image bytes do not match declared MIME type")
    return data


def _option_for_question(session, question: Question, option_id: int | None):
    if option_id is None:
        return None
    option = session.get(QuestionOption, option_id)
    if option is None or option.question_id != question.id:
        raise HTTPException(422, "question_option_id does not belong to this question")
    return option


def _storage_reference(digest: str, mime_type: str) -> str:
    return f"{digest[:2]}/{digest}{MIME_SUFFIX[mime_type]}"


def _safe_path(root: Path, reference: str) -> Path:
    resolved_root = root.resolve()
    path = (resolved_root / reference).resolve()
    if not path.is_relative_to(resolved_root):
        raise HTTPException(404, "media file not found")
    return path


def _persist_bytes(root: Path, reference: str, data: bytes) -> Path:
    path = _safe_path(root, reference)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return path
    handle = tempfile.NamedTemporaryFile(dir=path.parent, prefix="upload-", suffix=".tmp", delete=False)
    try:
        with handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, path)
    finally:
        if os.path.exists(handle.name):
            os.unlink(handle.name)
    return path


def media_view(media: QuestionMedia) -> dict:
    return {"id": media.id, "question_id": media.question_id,
            "question_option_id": media.question_option_id,
            "media_type": media.media_type.value, "alt_text": media.alt_text,
            "caption": media.caption, "content_hash": media.content_hash,
            "position": media.position, "storage_reference": media.storage_reference,
            "content_url": f"/api/media/{media.id}/content"}


def list_media(session, question_id: int) -> list[dict]:
    question = session.get(Question, question_id)
    if question is None:
        raise HTTPException(404, "question not found")
    items = session.scalars(select(QuestionMedia).where(QuestionMedia.question_id == question_id).order_by(QuestionMedia.position, QuestionMedia.id)).all()
    return [media_view(item) for item in items]


def upload_media(session, root: Path, question_id: int, payload) -> QuestionMedia:
    question = session.get(Question, question_id)
    if question is None:
        raise HTTPException(404, "question not found")
    option = _option_for_question(session, question, payload.question_option_id)
    data = decode_image(payload.content_base64, payload.mime_type)
    digest = hashlib.sha256(data).hexdigest()
    duplicate = session.scalar(select(QuestionMedia).where(
        QuestionMedia.question_id == question.id, QuestionMedia.content_hash == digest))
    if duplicate is not None:
        raise HTTPException(409, "same image is already attached to this question")
    reference = _storage_reference(digest, payload.mime_type)
    _persist_bytes(root, reference, data)
    position = max((item.position for item in question.media), default=0) + 1
    media = QuestionMedia(question_id=question.id,
                          question_option_id=option.id if option else None,
                          media_type=MediaType(payload.media_type),
                          storage_reference=reference,
                          alt_text=payload.alt_text,
                          caption=payload.caption,
                          content_hash=digest,
                          position=position)
    session.add(media)
    session.flush()
    return media


def edit_media(session, question_id: int, media_id: int, payload) -> QuestionMedia:
    question = session.get(Question, question_id)
    if question is None:
        raise HTTPException(404, "question not found")
    media = session.get(QuestionMedia, media_id)
    if media is None or media.question_id != question.id:
        raise HTTPException(404, "media not found for question")
    fields = payload.model_fields_set
    if "media_type" in fields:
        media.media_type = MediaType(payload.media_type)
    if "alt_text" in fields:
        media.alt_text = payload.alt_text
    if "caption" in fields:
        media.caption = payload.caption
    if "question_option_id" in fields:
        option = _option_for_question(session, question, payload.question_option_id)
        media.question_option_id = option.id if option else None
    session.flush()
    return media


def media_content(session, root: Path, media_id: int) -> tuple[Path, str]:
    media = session.get(QuestionMedia, media_id)
    if media is None:
        raise HTTPException(404, "media not found")
    path = _safe_path(root, media.storage_reference)
    if not path.is_file():
        raise HTTPException(404, "media file not found")
    mime_type = SUFFIX_MIME.get(path.suffix.lower())
    if mime_type is None:
        raise HTTPException(404, "unsupported media file")
    return path, mime_type
