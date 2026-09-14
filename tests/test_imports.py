import csv
import io
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import ImportBatch, ImportRow, ImportRowStatus, Question, QuestionOccurrence, Source
from app.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "test.sqlite"
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{database_path}")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, capture_output=True, env=os.environ.copy())
    application = create_app()
    with TestClient(application) as test_client:
        yield test_client
    application.state.engine.dispose()


def source(client, suffix="one"):
    response = client.post("/api/sources", json={
        "name": f"Synthetic Source {suffix}",
        "source_type": "dataset",
        "external_namespace": f"synthetic.source.{suffix}",
        "citation": "Synthetic test fixture only.",
    })
    assert response.status_code == 201, response.text
    return response.json()["id"]


def question(external_id="q1", stem="Synthetic question: which option is correct?", correct="A", **overrides):
    row = {
        "external_id": external_id,
        "stem": stem,
        "question_type": "single_best_answer",
        "answer_explanation": "Synthetic explanation.",
        "reference_text": "Synthetic reference.",
        "difficulty": 2,
        "is_clinical": False,
        "is_integrated": False,
        "options": [
            {"label": "A", "text": "Alpha", "is_correct": correct == "A"},
            {"label": "B", "text": "Beta", "is_correct": correct == "B"},
        ],
    }
    row.update(overrides)
    return row


def preview(client, source_id, rows, input_format="json", input_name="fixture.json"):
    content = json.dumps(rows)
    if input_format == "csv":
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=["external_id", "stem", "option_a", "option_b", "correct_option"])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        content = buffer.getvalue()
    response = client.post("/api/imports/preview", json={
        "source_id": source_id,
        "input_format": input_format,
        "input_name": input_name,
        "content": content,
    })
    assert response.status_code == 201, response.text
    return response.json()


def review(client, batch, action, row_index=0, **extra):
    row_id = batch["rows"][row_index]["id"]
    return client.post(f"/api/imports/{batch['id']}/rows/{row_id}/review", json={"action": action, **extra})


def test_source_and_preview_validation_are_persisted(client):
    source_id = source(client)
    batch = preview(client, source_id, [question(), question("bad", "", correct="A")])
    assert batch["row_count"] == 2
    assert batch["accepted_count"] == 1
    assert batch["rejected_count"] == 1
    assert batch["status"] == "partially_rejected"
    assert batch["rows"][0]["status"] == "accepted"
    assert batch["rows"][1]["status"] == "rejected"
    saved = client.get(f"/api/imports/{batch['id']}")
    assert saved.status_code == 200
    assert saved.json() == batch


def test_preview_checksum_idempotency_and_source_scoping(client):
    first_source = source(client, "a")
    second_source = source(client, "b")
    rows = [question()]
    first = preview(client, first_source, rows)
    same = preview(client, first_source, rows)
    assert same["id"] == first["id"]
    assert len(client.get("/api/imports").json()) == 1
    separate = preview(client, second_source, rows)
    assert separate["id"] != first["id"]


def test_commit_creates_canonical_question_and_is_idempotent(client):
    source_id = source(client)
    batch = preview(client, source_id, [question()])
    response = client.post(f"/api/imports/{batch['id']}/commit")
    assert response.status_code == 200, response.text
    imported = response.json()
    assert imported["status"] == "imported"
    question_id = imported["rows"][0]["question_id"]
    assert question_id
    repeated = client.post(f"/api/imports/{batch['id']}/commit")
    assert repeated.status_code == 200
    assert repeated.json() == imported
    detail = client.get(f"/api/questions/{question_id}").json()
    assert detail["stem"] == question()["stem"]
    assert len(detail["options"]) == 2
    assert set(detail["verification"].values()) == {"unverified"}


def test_exact_duplicate_requires_review_then_can_link_occurrence(client):
    source_a = source(client, "a")
    first = preview(client, source_a, [question("a1")])
    assert client.post(f"/api/imports/{first['id']}/commit").status_code == 200
    source_b = source(client, "b")
    duplicate = preview(client, source_b, [question("b1")])
    assert duplicate["rows"][0]["status"] == "exact_duplicate"
    assert duplicate["rows"][0]["duplicate_question_id"]
    assert client.post(f"/api/imports/{duplicate['id']}/commit").status_code == 409
    reviewed = review(client, duplicate, "link")
    assert reviewed.status_code == 200, reviewed.text
    committed = client.post(f"/api/imports/{duplicate['id']}/commit")
    assert committed.status_code == 200
    linked_id = committed.json()["rows"][0]["question_id"]
    assert linked_id == duplicate["rows"][0]["duplicate_question_id"]


def test_probable_duplicate_requires_explicit_create_or_reject(client):
    source_id = source(client)
    first = preview(client, source_id, [question("p1", "A synthetic adult has a focal finding; choose the best next step.")])
    assert client.post(f"/api/imports/{first['id']}/commit").status_code == 200
    second_source = source(client, "two")
    probable = preview(client, second_source, [question("p2", "A synthetic adult has a focal finding and asks for the best next step.")])
    assert probable["rows"][0]["status"] == "probable_duplicate"
    assert client.post(f"/api/imports/{probable['id']}/commit").status_code == 409
    assert review(client, probable, "create").status_code == 200
    assert client.post(f"/api/imports/{probable['id']}/commit").status_code == 200


def test_reject_review_excludes_row_from_commit(client):
    source_id = source(client)
    batch = preview(client, source_id, [question("keep"), question("drop", "A different synthetic question.")])
    response = review(client, batch, "reject", row_index=1, notes="Synthetic rejection")
    assert response.status_code == 200
    result = client.post(f"/api/imports/{batch['id']}/commit")
    assert result.status_code == 200
    assert result.json()["accepted_count"] == 1
    assert result.json()["rejected_count"] == 1


def test_repreview_invalidates_uncommitted_batch_when_reference_data_changes(client):
    source_id = source(client)
    batch = preview(client, source_id, [question()])
    app = client.app
    with app.state.session_factory() as session:
        saved_source = session.get(Source, source_id)
        saved_source.source_version = "changed"
        session.commit()
    assert client.post(f"/api/imports/{batch['id']}/commit").status_code == 409


def test_import_list_pagination(client):
    source_id = source(client)
    for index in range(3):
        preview(client, source_id, [question(str(index), f"Unique synthetic stem {index}.")], input_name=f"batch-{index}.json")
    first_page = client.get("/api/imports?limit=2&offset=0")
    second_page = client.get("/api/imports?limit=2&offset=2")
    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert len(first_page.json()) == 2
    assert len(second_page.json()) == 1


def test_csv_preview_and_commit(client):
    source_id = source(client)
    rows = [{"external_id": "csv-1", "stem": "Synthetic CSV question?", "option_a": "Alpha", "option_b": "Beta", "correct_option": "A"}]
    batch = preview(client, source_id, rows, input_format="csv", input_name="fixture.csv")
    assert batch["accepted_count"] == 1
    result = client.post(f"/api/imports/{batch['id']}/commit")
    assert result.status_code == 200


def test_bad_csv_is_rejected_as_request_error(client):
    source_id = source(client)
    response = client.post("/api/imports/preview", json={
        "source_id": source_id,
        "input_format": "csv",
        "input_name": "bad.csv",
        "content": "not,a,valid\nrow",
    })
    assert response.status_code == 422


def test_schema_guards_and_not_found_routes(client):
    assert client.post("/api/sources", json={"name": "x", "source_type": "dataset", "external_namespace": "x"}).status_code == 201
    assert client.post("/api/sources", json={"name": "x2", "source_type": "dataset", "external_namespace": "x"}).status_code == 409
    assert client.get("/api/imports/999").status_code == 404
    assert client.get("/api/questions/999").status_code == 404
    assert client.get("/api/imports?limit=999").status_code == 422
    assert client.get("/health").status_code == 200
    assert client.get("/docs").status_code == 200


def test_phase1_data_survives_upgrade_and_version_is_persisted(tmp_path):
    import sqlite3
    path = tmp_path / "legacy.sqlite"
    env = os.environ | {"NEETPG2027_DATABASE_URL": f"sqlite:///{path}"}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "20260910_0001"], env=env, check=True, capture_output=True)
    with sqlite3.connect(path) as connection:
        connection.execute("INSERT INTO questions (id, stem, lifecycle_status, created_at, updated_at) VALUES (1, 'Legacy synthetic', 'imported', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        connection.execute("INSERT INTO question_occurrences (question_id, source, source_identifier, lifecycle_status, verification_status, created_at, updated_at) VALUES (1, 'Legacy source', 'old-1', 'imported', 'unverified', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("20260915_0003",)
        assert connection.execute("SELECT stem, question_type FROM questions").fetchone() == ("Legacy synthetic", "single_best_answer")
        assert connection.execute("SELECT s.name FROM sources s JOIN question_occurrences o ON o.source_id=s.id").fetchone() == ("Legacy source",)
        assert connection.execute("SELECT COUNT(*) FROM question_bookmarks").fetchone() == (0,)
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    repeated = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], env=env, capture_output=True, text=True)
    assert repeated.returncode == 0, repeated.stderr


def test_review_history_is_retained(client):
    batch = preview(client, source(client), [question()])
    assert review(client, batch, "reject").status_code == 200
    result = review(client, batch, "create")
    assert result.status_code == 200
    loaded = client.get(f"/api/imports/{batch['id']}").json()
    assert len(loaded["rows"][0]["review_history"]) == 2


def test_database_rows_expose_import_audit_state(client):
    source_id = source(client)
    batch = preview(client, source_id, [question()])
    with client.app.state.session_factory() as session:
        stored_batch = session.get(ImportBatch, batch["id"])
        assert stored_batch.row_count == 1
        stored_row = session.get(ImportRow, batch["rows"][0]["id"])
        assert stored_row.status == ImportRowStatus.ACCEPTED
        assert stored_row.normalized_payload
