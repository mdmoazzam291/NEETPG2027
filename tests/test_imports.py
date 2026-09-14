"""Integration tests run against Alembic, not metadata.create_all."""
import csv
import io
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import ImportBatch, Question, QuestionOccurrence, Subject
from app.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'imports.sqlite'}")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, capture_output=True, env=os.environ.copy())
    app = create_app()
    with TestClient(app) as client:
        yield client
    app.state.engine.dispose()


def source(client, namespace="test.one", name="Test source"):
    response = client.post("/api/sources", json={"name": name, "external_namespace": namespace, "source_type": "dataset"})
    assert response.status_code == 201, response.text
    assert response.json()["verification_status"] == "unverified"
    return response.json()["id"]


def question(external_id="q1", stem="Synthetic test question: select alpha."):
    return {"external_id": external_id, "stem": stem,
            "options": [{"text": "Alpha", "is_correct": True}, {"text": "Beta", "is_correct": False}]}


def preview(client, source_id, rows, input_format="json"):
    if input_format == "json":
        content = json.dumps(rows)
    else:
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value) if isinstance(value, (list, bool, int)) else value for key, value in row.items()})
        content = stream.getvalue()
    response = client.post("/api/imports/preview", json={"source_id": source_id, "input_format": input_format,
                                                       "input_name": f"synthetic.{input_format}", "content": content})
    assert response.status_code == 201, response.text
    return response.json()


def commit(client, batch):
    return client.post(f"/api/imports/{batch['id']}/commit")


def review(client, batch, action, question_id=None, index=0):
    payload = {"action": action, "note": "Synthetic test review"}
    if question_id is not None:
        payload["question_id"] = question_id
    return client.post(f"/api/imports/{batch['id']}/rows/{batch['rows'][index]['id']}/review", json=payload)


def counts(client):
    with client.app.state.session_factory() as session:
        return tuple(session.scalar(select(func.count()).select_from(model)) for model in (Question, QuestionOccurrence))


@pytest.mark.parametrize("input_format", ["json", "csv"])
def test_preview_commit_and_retry_on_migrated_schema(client, input_format):
    sid = source(client)
    batch = preview(client, sid, [question()], input_format)
    assert batch["accepted_count"] == 1
    assert counts(client) == (0, 0)
    result = commit(client, batch)
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "imported"
    assert counts(client) == (1, 1)
    assert commit(client, batch).json() == result.json()
    detail = client.get(f"/api/questions/{result.json()['rows'][0]['question_id']}").json()
    assert detail["verification"] == dict.fromkeys(["content", "answer", "taxonomy", "reference"], "unverified")
    assert detail["lifecycle_status"] == "imported"
    assert review(client, batch, "reject").status_code == 409
    duplicate = preview(client, sid, [question()])
    assert duplicate["rejected_count"] == 1
    assert counts(client) == (1, 1)


@pytest.mark.parametrize("bad", [
    {"stem": " "}, {"options": []}, {"difficulty": 6}, {"difficulty": True},
    {"unexpected": "must not disappear"}, {"question_type": "short_answer"},
    {"subject_ids": [999]}, {"exam_administration_id": 999},
    {"options": [{"text": "A", "is_correct": "false"}, {"text": "B", "is_correct": True}]},
    {"options": [{"text": " A ", "is_correct": True}, {"text": "a"}]},
])
def test_invalid_rows_are_audited_without_question_writes(client, bad):
    batch = preview(client, source(client), [question() | bad])
    assert batch["rejected_count"] == 1
    assert batch["rows"][0]["errors"]
    assert review(client, batch, "create").status_code == 409
    result = commit(client, batch)
    assert result.status_code == 200
    assert result.json()["status"] == "rejected"
    assert counts(client) == (0, 0)


def test_partial_import_and_repeated_identifier(client):
    batch = preview(client, source(client), [question(), question(), {"stem": "missing answer"}])
    assert (batch["accepted_count"], batch["rejected_count"]) == (1, 2)
    assert commit(client, batch).json()["status"] == "partially_rejected"
    assert counts(client) == (1, 1)


def test_exact_duplicate_requires_review_and_preserves_occurrence(client):
    a, b = source(client), source(client, "test.two", "Second source")
    first = commit(client, preview(client, a, [question()])).json()
    qid = first["rows"][0]["question_id"]
    batch = preview(client, b, [question("other-id")])
    assert batch["rows"][0]["status"] == "exact_duplicate"
    assert commit(client, batch).status_code == 409
    assert review(client, batch, "link", qid).status_code == 200
    assert commit(client, batch).status_code == 200
    assert counts(client) == (1, 2)
    saved = client.get(f"/api/imports/{batch['id']}").json()
    assert saved["rows"][0]["normalized_payload"]["review"]["note"] == "Synthetic test review"


def test_probable_duplicate_can_be_explicitly_created(client):
    sid = source(client)
    commit(client, preview(client, sid, [question()]))
    modified = question("q2")
    modified["options"][0]["is_correct"] = False
    modified["options"][1]["is_correct"] = True
    batch = preview(client, sid, [modified])
    assert batch["rows"][0]["status"] == "probable_duplicate"
    assert review(client, batch, "create").status_code == 200
    assert commit(client, batch).status_code == 200
    assert counts(client) == (2, 2)


def test_in_batch_content_requires_explicit_review(client):
    batch = preview(client, source(client), [question(), question("q2")])
    assert batch["rows"][1]["status"] == "requires_review"
    assert commit(client, batch).status_code == 409
    assert review(client, batch, "reject", index=1).status_code == 200
    assert commit(client, batch).status_code == 200
    assert counts(client) == (1, 1)


def test_stale_preview_rolls_back_earlier_rows(client):
    sid = source(client)
    pending = preview(client, sid, [question("first", "Completely separate synthetic prompt."), question("collision")])
    commit(client, preview(client, sid, [question("collision")]))
    response = commit(client, pending)
    assert response.status_code == 409
    assert counts(client) == (1, 1)
    saved = client.get(f"/api/imports/{pending['id']}").json()
    assert saved["completed_at"] is None
    assert all(row["question_id"] is None for row in saved["rows"])


def test_link_target_change_blocks_commit(client):
    sid = source(client)
    first = commit(client, preview(client, sid, [question()])).json()
    qid = first["rows"][0]["question_id"]
    batch = preview(client, sid, [question("q2")])
    review(client, batch, "link", qid)
    with client.app.state.session_factory() as session:
        session.get(Question, qid).stem = "Changed since review"
        session.commit()
    assert commit(client, batch).status_code == 409
    assert counts(client) == (1, 1)


def test_taxonomy_tags_roundtrip(client):
    with client.app.state.session_factory() as session:
        subject = Subject(name="Synthetic subject")
        session.add(subject)
        session.commit()
        identity = subject.id
    batch = preview(client, source(client), [question() | {"subject_ids": [identity]}])
    result = commit(client, batch).json()
    with client.app.state.session_factory() as session:
        q = session.get(Question, result["rows"][0]["question_id"])
        assert q.taxonomy_tags[0].subject_id == identity
        assert q.taxonomy_tags[0].verification_status.value == "unverified"


@pytest.mark.parametrize("content,input_format", [("{}", "json"), ("[]", "json"), ("[NaN]", "json"),
    ('[{', "json"), ("stem,stem\na,b", "csv"), ("stem,external_id\na", "csv")])
def test_malformed_document_creates_no_batch(client, content, input_format):
    sid = source(client)
    response = client.post("/api/imports/preview", json={"source_id": sid, "input_format": input_format,
                            "input_name": "bad", "content": content})
    assert response.status_code == 422
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ImportBatch)) == 0


def test_not_found_and_source_conflict(client):
    source(client)
    assert client.post("/api/sources", json={"name": "Name", "external_namespace": "test.one", "source_type": "dataset"}).status_code == 409
    assert client.get("/api/imports/999").status_code == 404
    assert client.get("/api/questions/999").status_code == 404
    assert client.get("/api/imports?limit=999").status_code == 422
    assert client.get("/health").status_code == 200
    assert client.get("/docs").status_code == 200
