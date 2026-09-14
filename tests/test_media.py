"""Question media is validated, content-addressed, and linked to canonical questions."""
import base64
import hashlib
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from app.db.models import QuestionMedia
from app.main import create_app

PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n1cAAAAASUVORK5CYII="
PNG_BYTES = base64.b64decode(PNG_BASE64)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'media.sqlite'}")
    monkeypatch.setenv("NEETPG2027_MEDIA_ROOT", str(tmp_path / "media"))
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, capture_output=True, env=os.environ.copy())
    app = create_app()
    with TestClient(app) as client:
        yield client
    app.state.engine.dispose()


def create_question(client, namespace="media.one", external_id="m1"):
    source = client.post("/api/sources", json={"name": namespace, "external_namespace": namespace, "source_type": "dataset"})
    assert source.status_code == 201, source.text
    stems = {
        "m1": "Synthetic cardiology media prompt: select Alpha.",
        "m2": "A dermatology visual asks for the best labeled structure; choose Alpha.",
    }
    row = {"external_id": external_id, "stem": stems.get(external_id, f"Distinct synthetic visual prompt {external_id}: choose Alpha."),
           "options": [{"label": "A", "text": "Alpha", "is_correct": True},
                       {"label": "B", "text": "Beta", "is_correct": False}]}
    preview = client.post("/api/imports/preview", json={"source_id": source.json()["id"], "input_format": "json",
                                                        "input_name": "media.json", "content": json.dumps([row])})
    assert preview.status_code == 201, preview.text
    committed = client.post(f"/api/imports/{preview.json()['id']}/commit")
    assert committed.status_code == 200, committed.text
    return committed.json()["rows"][0]["question_id"]


def upload_payload(**overrides):
    payload = {"media_type": "image", "mime_type": "image/png", "content_base64": PNG_BASE64,
               "alt_text": "A synthetic one-pixel test image", "caption": "Synthetic browser-safe test asset",
               "question_option_id": None}
    payload.update(overrides)
    return payload


def test_upload_serve_edit_and_reuse_content_addressed_image(client, tmp_path):
    question_id = create_question(client)
    detail = client.get(f"/api/questions/{question_id}").json()
    option_id = detail["options"][0]["id"]

    response = client.post(f"/api/questions/{question_id}/media", json=upload_payload(question_option_id=option_id, media_type="diagram"))
    assert response.status_code == 201, response.text
    media = response.json()
    digest = hashlib.sha256(PNG_BYTES).hexdigest()
    assert media["content_hash"] == digest
    assert media["storage_reference"] == f"{digest[:2]}/{digest}.png"
    assert media["question_option_id"] == option_id
    assert (tmp_path / "media" / media["storage_reference"]).read_bytes() == PNG_BYTES

    listed = client.get(f"/api/questions/{question_id}/media")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == media["id"]
    served = client.get(media["content_url"])
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/png")
    assert served.content == PNG_BYTES

    updated = client.patch(f"/api/questions/{question_id}/media/{media['id']}", json={
        "alt_text": "Updated synthetic image description", "caption": None, "question_option_id": None, "media_type": "table"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["alt_text"] == "Updated synthetic image description"
    assert updated.json()["caption"] is None
    assert updated.json()["question_option_id"] is None
    assert updated.json()["media_type"] == "table"

    question = client.get(f"/api/questions/{question_id}").json()
    assert question["media"][0]["content_url"] == media["content_url"]
    assert question["options"][0]["id"] == option_id

    duplicate = client.post(f"/api/questions/{question_id}/media", json=upload_payload())
    assert duplicate.status_code == 409

    second_id = create_question(client, "media.two", "m2")
    second = client.post(f"/api/questions/{second_id}/media", json=upload_payload())
    assert second.status_code == 201
    assert second.json()["storage_reference"] == media["storage_reference"]


def test_media_rejects_spoofed_content_invalid_targets_and_unsafe_path(client):
    first_id = create_question(client)
    second_id = create_question(client, "media.two", "m2")
    second_option = client.get(f"/api/questions/{second_id}").json()["options"][0]["id"]

    assert client.post(f"/api/questions/{first_id}/media", json=upload_payload(mime_type="image/jpeg")).status_code == 422
    assert client.post(f"/api/questions/{first_id}/media", json=upload_payload(content_base64="not base64 !!!")).status_code == 422
    assert client.post(f"/api/questions/{first_id}/media", json=upload_payload(question_option_id=second_option)).status_code == 422
    assert client.post("/api/questions/999/media", json=upload_payload()).status_code == 404
    assert client.get("/api/media/999/content").status_code == 404

    created = client.post(f"/api/questions/{first_id}/media", json=upload_payload()).json()
    with client.app.state.session_factory() as session:
        record = session.get(QuestionMedia, created["id"])
        record.storage_reference = "../escape.png"
        session.commit()
    assert client.get(created["content_url"]).status_code == 404


def test_media_patch_requires_fields_and_valid_question_membership(client):
    question_id = create_question(client)
    media = client.post(f"/api/questions/{question_id}/media", json=upload_payload()).json()
    assert client.patch(f"/api/questions/{question_id}/media/{media['id']}", json={}).status_code == 422
    assert client.patch(f"/api/questions/{question_id}/media/{media['id']}", json={"alt_text": None}).status_code == 422
    assert client.patch(f"/api/questions/999/media/{media['id']}", json={"alt_text": "x"}).status_code == 404
    assert client.patch(f"/api/questions/{question_id}/media/999", json={"alt_text": "x"}).status_code == 404
