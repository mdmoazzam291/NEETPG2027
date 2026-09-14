"""Question-media API for local raster uploads and display."""
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse

from app.imports.api import database
from app.media import service
from app.media.schemas import MediaEditInput, MediaUploadInput

router = APIRouter(tags=["media"])


def media_root(request: Request) -> Path:
    return request.app.state.media_root


@router.get("/api/questions/{question_id}/media")
def question_media(question_id: int, session=Depends(database)):
    return service.list_media(session, question_id)


@router.post("/api/questions/{question_id}/media", status_code=201)
def upload_question_media(question_id: int, payload: MediaUploadInput, request: Request, session=Depends(database)):
    return service.media_view(service.upload_media(session, media_root(request), question_id, payload))


@router.patch("/api/questions/{question_id}/media/{media_id}")
def update_question_media(question_id: int, media_id: int, payload: MediaEditInput, session=Depends(database)):
    return service.media_view(service.edit_media(session, question_id, media_id, payload))


@router.get("/api/media/{media_id}/content", response_class=FileResponse)
def media_content(media_id: int, request: Request, session=Depends(database)):
    path, mime_type = service.media_content(session, media_root(request), media_id)
    return FileResponse(path, media_type=mime_type)
