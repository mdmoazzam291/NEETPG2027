"""Phase 5 study tests: no pre-answer leakage, server scoring, history, and bookmarks."""
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{tmp_path / 'study.sqlite'}")
    monkeypatch.setenv("NEETPG2027_MEDIA_ROOT", str(tmp_path / "media"))
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, capture_output=True, env=os.environ.copy())
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    app.state.engine.dispose()


def seed_questions(client):
    source = client.post("/api/sources", json={
        "name": "Phase 5 synthetic source", "external_namespace": "study.synthetic", "source_type": "dataset"
    })
    assert source.status_code == 201, source.text
    rows = [
        {
            "external_id": "study-1",
            "stem": "A synthetic enzyme assay turns purple after reagent X. Which fixture option is designated correct?",
            "answer_explanation": "Alpha is intentionally correct in this synthetic fixture.",
            "reference_text": "Synthetic Phase 5 fixture",
            "options": [
                {"label": "A", "text": "Alpha enzyme marker", "is_correct": True, "explanation": "Fixture key."},
                {"label": "B", "text": "Beta transport marker", "is_correct": False},
            ],
        },
        {
            "external_id": "study-2",
            "stem": "On a fictional orbital map, which marker is located directly north of the origin?",
            "answer_explanation": "North marker is intentionally correct in this separate fixture.",
            "reference_text": "Synthetic orbital fixture",
            "options": [
                {"label": "A", "text": "North marker", "is_correct": True},
                {"label": "B", "text": "South marker", "is_correct": False},
            ],
        },
    ]
    preview = client.post("/api/imports/preview", json={
        "source_id": source.json()["id"], "input_format": "json", "input_name": "study.json", "content": json.dumps(rows)
    })
    assert preview.status_code == 201, preview.text
    assert preview.json()["accepted_count"] == 2, preview.text
    committed = client.post(f"/api/imports/{preview.json()['id']}/commit")
    assert committed.status_code == 200, committed.text
    return [row["question_id"] for row in committed.json()["rows"]]


def test_safe_queue_hides_answer_key_until_attempt(client):
    ids = seed_questions(client)
    response = client.get("/api/study/queue?mode=unseen&limit=15")
    assert response.status_code == 200
    questions = response.json()["questions"]
    assert [question["id"] for question in questions] == ids
    for question in questions:
        assert "answer_explanation" not in question
        assert "reference_text" not in question
        assert "correct_option_ids" not in question
        for option in question["options"]:
            assert "is_correct" not in option
            assert "explanation" not in option
    summary = client.get("/api/study/summary").json()
    assert summary["eligible_questions"] == 2
    assert summary["unseen_questions"] == 2
    assert summary["total_attempts"] == 0


def test_server_scoring_latest_incorrect_queue_and_reflection(client):
    first_id, second_id = seed_questions(client)
    first = client.get(f"/api/study/questions/{first_id}").json()
    correct_first = first["options"][0]["id"]
    scored = client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": correct_first, "skipped": False, "confidence": 4, "time_spent_seconds": 17
    })
    assert scored.status_code == 201, scored.text
    result = scored.json()
    assert result["outcome"] == "correct"
    assert result["correct_option_ids"] == [correct_first]
    assert "Alpha is intentionally correct" in result["answer_explanation"]
    assert any(option["is_correct"] for option in result["options"])
    assert len(client.get("/api/study/queue?mode=unseen").json()["questions"]) == 1

    second = client.get(f"/api/study/questions/{second_id}").json()
    wrong_second = second["options"][1]["id"]
    wrong = client.post(f"/api/study/questions/{second_id}/attempts", json={
        "selected_option_id": wrong_second, "skipped": False, "confidence": 2, "time_spent_seconds": 25
    })
    assert wrong.status_code == 201
    assert wrong.json()["outcome"] == "incorrect"
    attempt_id = wrong.json()["attempt_id"]
    reflection = client.patch(f"/api/study/attempts/{attempt_id}", json={
        "mistake_category": "knowledge_gap", "user_notes": "Remember the synthetic north marker."
    })
    assert reflection.status_code == 200
    assert reflection.json()["mistake_category"] == "knowledge_gap"
    incorrect = client.get("/api/study/queue?mode=incorrect").json()["questions"]
    assert [item["id"] for item in incorrect] == [second_id]

    corrected = client.post(f"/api/study/questions/{second_id}/attempts", json={
        "selected_option_id": second["options"][0]["id"], "skipped": False, "confidence": 5, "time_spent_seconds": 8
    })
    assert corrected.json()["outcome"] == "correct"
    assert client.get("/api/study/queue?mode=incorrect").json()["questions"] == []

    history = client.get("/api/study/history?limit=5").json()
    assert history[0]["question_id"] == second_id
    assert history[0]["outcome"] == "correct"
    summary = client.get("/api/study/summary").json()
    assert summary["questions_attempted"] == 2
    assert summary["total_attempts"] == 3
    assert summary["correct"] == 2
    assert summary["incorrect"] == 1
    assert summary["accuracy_percent"] == pytest.approx(66.7)


def test_attempt_validation_skip_and_occurrence_ownership(client):
    first_id, second_id = seed_questions(client)
    first = client.get(f"/api/study/questions/{first_id}").json()
    second = client.get(f"/api/study/questions/{second_id}").json()
    assert client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": second["options"][0]["id"], "skipped": False, "confidence": 3, "time_spent_seconds": 1
    }).status_code == 422
    assert client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": None, "skipped": False, "confidence": 3, "time_spent_seconds": 1
    }).status_code == 422
    assert client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": first["options"][0]["id"], "skipped": True, "confidence": 3, "time_spent_seconds": 1
    }).status_code == 422
    assert client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": first["options"][0]["id"], "skipped": False, "confidence": 0, "time_spent_seconds": 1
    }).status_code == 422
    occurrence = client.get(f"/api/questions/{second_id}").json()["occurrences"][0]["id"]
    assert client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": first["options"][0]["id"], "skipped": False, "confidence": 3,
        "time_spent_seconds": 1, "occurrence_id": occurrence
    }).status_code == 422
    skipped = client.post(f"/api/study/questions/{first_id}/attempts", json={
        "selected_option_id": None, "skipped": True, "confidence": 1, "time_spent_seconds": 4
    })
    assert skipped.status_code == 201
    assert skipped.json()["outcome"] == "skipped"


def test_bookmarks_are_idempotent_and_drive_bookmark_queue(client):
    first_id, _ = seed_questions(client)
    assert client.put(f"/api/study/questions/{first_id}/bookmark").json()["bookmarked"] is True
    assert client.put(f"/api/study/questions/{first_id}/bookmark").status_code == 200
    assert client.get("/api/study/summary").json()["bookmarks"] == 1
    bookmarked = client.get("/api/study/queue?mode=bookmarked").json()["questions"]
    assert [item["id"] for item in bookmarked] == [first_id]
    assert bookmarked[0]["bookmarked"] is True
    assert client.delete(f"/api/study/questions/{first_id}/bookmark").json()["bookmarked"] is False
    assert client.delete(f"/api/study/questions/{first_id}/bookmark").status_code == 200
    assert client.get("/api/study/queue?mode=bookmarked").json()["questions"] == []
    assert client.get("/api/study/summary").json()["bookmarks"] == 0
