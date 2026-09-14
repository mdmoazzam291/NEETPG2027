"""Taxonomy administration is migration-backed and usable by the import pipeline."""
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import Question, QuestionTaxonomyTag
from app.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'taxonomy.sqlite'}")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, capture_output=True, env=os.environ.copy())
    app = create_app()
    with TestClient(app) as client:
        yield client
    app.state.engine.dispose()


def post(client, path, payload):
    response = client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_taxonomy_workflow_feeds_question_import(client):
    medicine = post(client, "/api/taxonomy/subjects", {"name": "Medicine", "code": "MED"})
    surgery = post(client, "/api/taxonomy/subjects", {"name": "Surgery", "code": "SURG"})
    cardiovascular = post(client, "/api/taxonomy/systems", {"name": "Cardiovascular"})

    first_link = post(client, "/api/taxonomy/subject-systems", {"subject_id": medicine["id"], "system_id": cardiovascular["id"]})
    assert first_link["created"] is True
    repeated_link = post(client, "/api/taxonomy/subject-systems", {"subject_id": medicine["id"], "system_id": cardiovascular["id"]})
    assert repeated_link["created"] is False

    topic = post(client, "/api/taxonomy/topics", {
        "name": "Acute coronary syndrome",
        "description": "Integrated ischemic heart disease topic",
        "subject_ids": [medicine["id"], surgery["id"]],
        "system_ids": [cardiovascular["id"]],
    })
    assert topic["subject_ids"] == [medicine["id"], surgery["id"]]
    subtopic = post(client, "/api/taxonomy/subtopics", {
        "topic_id": topic["id"], "name": "STEMI reperfusion", "description": "Immediate reperfusion decisions",
    })

    snapshot = client.get("/api/taxonomy")
    assert snapshot.status_code == 200
    data = snapshot.json()
    assert len(data["subjects"]) == 2
    assert len(data["systems"]) == 1
    assert data["topics"][0]["subtopics"][0]["id"] == subtopic["id"]

    source = client.post("/api/sources", json={"name": "Taxonomy integration test", "external_namespace": "taxonomy.test", "source_type": "dataset"}).json()
    row = {
        "external_id": "taxonomy-001",
        "stem": "Synthetic taxonomy integration question: select Alpha.",
        "options": [{"text": "Alpha", "is_correct": True}, {"text": "Beta", "is_correct": False}],
        "subject_ids": [medicine["id"]], "system_ids": [cardiovascular["id"]],
        "topic_ids": [topic["id"]], "subtopic_ids": [subtopic["id"]],
    }
    preview = client.post("/api/imports/preview", json={"source_id": source["id"], "input_format": "json", "input_name": "taxonomy.json", "content": json.dumps([row])})
    assert preview.status_code == 201, preview.text
    assert preview.json()["accepted_count"] == 1
    committed = client.post(f"/api/imports/{preview.json()['id']}/commit")
    assert committed.status_code == 200, committed.text

    with client.app.state.session_factory() as session:
        question = session.scalar(select(Question).where(Question.stem.like("Synthetic taxonomy%")))
        tags = session.scalars(select(QuestionTaxonomyTag).where(QuestionTaxonomyTag.question_id == question.id)).all()
        assert len(tags) == 4
        assert {tag.subject_id for tag in tags if tag.subject_id} == {medicine["id"]}
        assert {tag.system_id for tag in tags if tag.system_id} == {cardiovascular["id"]}
        assert {tag.topic_id for tag in tags if tag.topic_id} == {topic["id"]}
        assert {tag.subtopic_id for tag in tags if tag.subtopic_id} == {subtopic["id"]}


def test_taxonomy_edit_archive_and_relationship_replacement(client):
    subject = post(client, "/api/taxonomy/subjects", {"name": "Medicine", "code": "MED"})
    system = post(client, "/api/taxonomy/systems", {"name": "Renal"})
    topic = post(client, "/api/taxonomy/topics", {"name": "Acute kidney injury", "subject_ids": [subject["id"]], "system_ids": [system["id"]]})
    subtopic = post(client, "/api/taxonomy/subtopics", {"topic_id": topic["id"], "name": "Prerenal AKI"})

    renamed = client.patch(f"/api/taxonomy/subjects/{subject['id']}", json={"name": "Internal Medicine"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Internal Medicine"

    edited = client.patch(f"/api/taxonomy/topics/{topic['id']}", json={"subject_ids": [], "system_ids": [], "lifecycle_status": "archived"})
    assert edited.status_code == 200
    assert edited.json()["subject_ids"] == [] and edited.json()["system_ids"] == []
    assert edited.json()["lifecycle_status"] == "archived"

    archived_subtopic = client.patch(f"/api/taxonomy/subtopics/{subtopic['id']}", json={"lifecycle_status": "archived"})
    assert archived_subtopic.status_code == 200
    assert archived_subtopic.json()["lifecycle_status"] == "archived"

    snapshot = client.get("/api/taxonomy").json()
    assert snapshot["topics"][0]["lifecycle_status"] == "archived"
    assert snapshot["topics"][0]["subtopics"][0]["lifecycle_status"] == "archived"


def test_taxonomy_rejects_conflicts_and_unknown_links(client):
    post(client, "/api/taxonomy/subjects", {"name": "Medicine", "code": "MED"})
    duplicate = client.post("/api/taxonomy/subjects", json={"name": "Medicine", "code": "MED2"})
    assert duplicate.status_code == 409

    unknown_topic = client.post("/api/taxonomy/topics", json={"name": "Impossible topic", "subject_ids": [999], "system_ids": []})
    assert unknown_topic.status_code == 404
    assert unknown_topic.json()["detail"] == "subject not found"

    unknown_subtopic = client.post("/api/taxonomy/subtopics", json={"topic_id": 999, "name": "Missing parent"})
    assert unknown_subtopic.status_code == 404
    assert client.patch("/api/taxonomy/topics/999", json={"name": "Missing"}).status_code == 404

    invalid_repeated_ids = client.post("/api/taxonomy/topics", json={"name": "Repeated", "subject_ids": [1, 1], "system_ids": []})
    assert invalid_repeated_ids.status_code == 422
