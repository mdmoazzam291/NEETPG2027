"""Regression and stress tests for the original 100-item medical import bank."""
import json
import os
from pathlib import Path
import subprocess
import sys

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import Question, QuestionOccurrence
from app.imports.schemas import QuestionInput
from app.main import create_app


DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "high_yield_100"
EXPECTED_SUBJECTS = {
    "Anatomy", "Physiology", "Biochemistry", "Pathology", "Pharmacology",
    "Microbiology", "Forensic Medicine", "Community Medicine", "ENT",
    "Ophthalmology", "Medicine", "Surgery", "Obstetrics and Gynecology",
    "Pediatrics", "Orthopedics", "Dermatology", "Psychiatry", "Radiology",
    "Anesthesia",
}


def load_bank():
    paths = sorted(DATA_DIR.glob("part*.json"))
    assert [path.name for path in paths] == [f"part{i:02d}.json" for i in range(1, 5)]
    shards = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    assert all(len(shard) == 25 for shard in shards)
    return [row for shard in shards for row in shard]


def subject_from_reference(row):
    marker = "Subject: "
    return row["reference_text"].split(marker, 1)[1].split(";", 1)[0]


def test_high_yield_bank_contract_and_coverage():
    rows = load_bank()
    assert len(rows) == 100
    assert [row["external_id"] for row in rows] == [f"hy100-{i:03d}" for i in range(1, 101)]
    assert len({row["stem"] for row in rows}) == 100
    assert {subject_from_reference(row) for row in rows} == EXPECTED_SUBJECTS

    for row in rows:
        QuestionInput.model_validate(row)
        assert len(row["options"]) == 4
        assert sum(option["is_correct"] for option in row["options"]) == 1
        assert "Not a recalled PYQ; medically unverified." in row["reference_text"]


def test_high_yield_bank_imports_as_one_100_question_batch(tmp_path, monkeypatch):
    database_path = tmp_path / "high_yield_100.sqlite"
    monkeypatch.setenv("NEETPG2027_DATABASE_URL", f"sqlite:///{database_path}")
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
        capture_output=True,
        env=os.environ.copy(),
    )
    app = create_app()
    rows = load_bank()

    with TestClient(app) as client:
        source = client.post(
            "/api/sources",
            json={
                "name": "Original NEET-PG INI-CET high-yield 100 stress-test bank",
                "external_namespace": "stress.neetpg-inicet.high-yield-100.v1",
                "source_type": "dataset",
                "citation": "Repository-authored original test content; not recalled examination questions.",
            },
        )
        assert source.status_code == 201, source.text

        preview = client.post(
            "/api/imports/preview",
            json={
                "source_id": source.json()["id"],
                "input_format": "json",
                "input_name": "neetpg_inicet_high_yield_100.json",
                "content": json.dumps(rows),
            },
        )
        assert preview.status_code == 201, preview.text
        batch = preview.json()
        assert batch["accepted_count"] == 100
        assert batch["rejected_count"] == 0
        assert len(batch["rows"]) == 100

        commit = client.post(f"/api/imports/{batch['id']}/commit")
        assert commit.status_code == 200, commit.text
        result = commit.json()
        assert result["status"] == "imported"
        assert len(result["rows"]) == 100
        assert client.post(f"/api/imports/{batch['id']}/commit").json() == result

        with app.state.session_factory() as session:
            assert session.scalar(select(func.count()).select_from(Question)) == 100
            assert session.scalar(select(func.count()).select_from(QuestionOccurrence)) == 100

        first_id = result["rows"][0]["question_id"]
        detail = client.get(f"/api/questions/{first_id}")
        assert detail.status_code == 200
        assert set(detail.json()["verification"].values()) == {"unverified"}

        study = client.get("/api/study/queue?mode=unseen&limit=100")
        assert study.status_code == 200, study.text
        study_questions = study.json()["questions"]
        assert len(study_questions) == 100
        assert [item["id"] for item in study_questions] == [row["question_id"] for row in result["rows"]]
        for item in study_questions:
            assert item["answer_verification_status"] == "unverified"
            assert "answer_explanation" not in item
            assert "reference_text" not in item
            assert "correct_option_ids" not in item
            assert all("is_correct" not in option and "explanation" not in option for option in item["options"])
        summary = client.get("/api/study/summary").json()
        assert summary["eligible_questions"] == 100
        assert summary["unseen_questions"] == 100
        assert summary["total_attempts"] == 0

    app.state.engine.dispose()
