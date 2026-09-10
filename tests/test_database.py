from datetime import datetime, timezone
import os
import subprocess
import sys

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import (AppSetting, Attempt, AttemptOutcome, Question, QuestionOccurrence,
                           RevisionEvent, RevisionSchedule, Subject, Topic, VerificationStatus)


@pytest.fixture()
def session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.sqlite'}")
    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine) as database_session:
        yield database_session


def question_with_occurrence(session):
    question = Question(stem="Stored question only for database testing.")
    session.add(question); session.flush()
    occurrence = QuestionOccurrence(question_id=question.id, source="test source", source_identifier="test-1", verification_status=VerificationStatus.UNVERIFIED)
    session.add(occurrence); session.commit()
    return question, occurrence


def test_database_connection(session):
    assert session.execute(text("SELECT 1")).scalar_one() == 1


def test_models_and_taxonomy_relationships(session):
    subject = Subject(name="Test subject")
    topic = Topic(name="Test topic", subjects=[subject])
    session.add(topic); session.commit()
    assert session.get(Topic, topic.id).subjects[0].name == "Test subject"


def test_required_and_unique_constraints(session):
    session.add(Subject(name="Unique")); session.commit()
    session.add(Subject(name="Unique"))
    with pytest.raises(IntegrityError): session.commit()
    session.rollback()
    session.add(Question(stem=None))
    with pytest.raises(IntegrityError): session.commit()


def test_foreign_key_integrity(session):
    session.add(QuestionOccurrence(question_id=999, source="source"))
    with pytest.raises(IntegrityError): session.commit()


def test_attempt_history_is_append_only_by_schema(session):
    question, occurrence = question_with_occurrence(session)
    session.add_all([Attempt(question_id=question.id, occurrence_id=occurrence.id, outcome=AttemptOutcome.INCORRECT), Attempt(question_id=question.id, occurrence_id=occurrence.id, outcome=AttemptOutcome.CORRECT)])
    session.commit()
    attempts = session.scalars(select(Attempt).where(Attempt.question_id == question.id)).all()
    assert len(attempts) == 2
    assert {attempt.outcome for attempt in attempts} == {AttemptOutcome.CORRECT, AttemptOutcome.INCORRECT}
    assert all(attempt.attempted_at for attempt in attempts)


def test_question_occurrence_are_separate_records(session):
    question, occurrence = question_with_occurrence(session)
    assert question.id != occurrence.id
    assert occurrence.question_id == question.id
    assert occurrence.verification_status is VerificationStatus.UNVERIFIED


def test_revision_event_and_schedule_are_separate(session):
    question, _ = question_with_occurrence(session)
    event = RevisionEvent(question_id=question.id)
    schedule = RevisionSchedule(question_id=question.id, next_revision_at=datetime.now(timezone.utc))
    session.add_all([event, schedule]); session.commit()
    assert session.get(RevisionEvent, event.id).id == event.id
    assert session.get(RevisionSchedule, schedule.id).question_id == question.id


def test_settings_storage(session):
    setting = AppSetting(key="weak_accuracy_threshold", value="0.6")
    session.add(setting); session.commit()
    assert session.scalar(select(AppSetting.value).where(AppSetting.key == "weak_accuracy_threshold")) == "0.6"


def test_migration_upgrade_from_empty_database(tmp_path):
    database = tmp_path / "migrated.sqlite"
    environment = os.environ | {"NEETPG2027_DATABASE_URL": f"sqlite:///{database}"}
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=os.getcwd(), env=environment, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    engine = create_engine(f"sqlite:///{database}")
    with engine.connect() as connection:
        names = {row[0] for row in connection.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
    assert {"subjects", "questions", "question_occurrences", "attempts", "revision_events", "revision_schedules", "app_settings"} <= names
