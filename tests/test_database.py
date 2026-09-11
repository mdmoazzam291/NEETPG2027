from datetime import datetime, timezone
import os
import subprocess
import sys

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import (AppSetting, Attempt, AttemptOutcome, Exam, ExamAdministration,
                           ImportBatch, ImportFormat, ImportRow, ImportRowStatus, MediaType,
                           Question, QuestionMedia, QuestionOccurrence, QuestionOption,
                           QuestionTaxonomyTag, QuestionType, QuestionVerificationState,
                           RevisionEvent, RevisionSchedule, Source, SourceType, Subject,
                           System, TagRole, Topic, VerificationAspect, VerificationStatus)


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
    assert isinstance(question, Question)
    assert isinstance(occurrence, QuestionOccurrence)
    assert question.__table__ is not occurrence.__table__
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


def test_question_content_options_and_difficulty_constraints(session):
    question = Question(stem="Which option is correct?", question_type=QuestionType.SINGLE_BEST_ANSWER, difficulty=3)
    question.options = [QuestionOption(position=1, text="Wrong"), QuestionOption(position=2, text="Correct", is_correct=True)]
    session.add(question); session.commit()
    stored = session.get(Question, question.id)
    assert [option.position for option in stored.options] == [1, 2]
    assert [option.text for option in stored.options if option.is_correct] == ["Correct"]
    session.add(Question(stem="Invalid difficulty", difficulty=6))
    with pytest.raises(IntegrityError): session.commit()


def test_question_option_position_is_unique_and_positive(session):
    question = Question(stem="Question")
    session.add(question); session.commit()
    session.add_all([QuestionOption(question_id=question.id, position=1, text="A"), QuestionOption(question_id=question.id, position=1, text="B")])
    with pytest.raises(IntegrityError): session.commit()
    session.rollback()
    session.add(QuestionOption(question_id=question.id, position=0, text="Invalid"))
    with pytest.raises(IntegrityError): session.commit()


def test_exam_source_and_occurrences_preserve_canonical_question(session):
    question = Question(stem="Canonical PYQ")
    neet = Exam(name="NEET PG", code="NEET_PG")
    session.add(neet); session.flush()
    administration_2022 = ExamAdministration(exam_id=neet.id, exam_year=2022)
    administration_2025 = ExamAdministration(exam_id=neet.id, exam_year=2025)
    source_2022 = Source(name="NEET PG 2022 paper", source_type=SourceType.OFFICIAL_PAPER, external_namespace="official.neetpg.2022")
    source_2025 = Source(name="NEET PG 2025 paper", source_type=SourceType.OFFICIAL_PAPER, external_namespace="official.neetpg.2025")
    session.add_all([question, administration_2022, administration_2025, source_2022, source_2025]); session.flush()
    occurrences = [
        QuestionOccurrence(question_id=question.id, source=source_2022.name, source_id=source_2022.id, exam_administration_id=administration_2022.id, source_identifier="q-88", question_number="88"),
        QuestionOccurrence(question_id=question.id, source=source_2025.name, source_id=source_2025.id, exam_administration_id=administration_2025.id, source_identifier="q-127", question_number="127"),
    ]
    session.add_all(occurrences); session.commit()
    assert session.scalars(select(QuestionOccurrence).where(QuestionOccurrence.question_id == question.id)).all()[1].exam_administration.exam_year == 2025
    duplicate = QuestionOccurrence(question_id=question.id, source=source_2025.name, source_id=source_2025.id, source_identifier="q-127")
    session.add(duplicate)
    with pytest.raises(IntegrityError): session.commit()


def test_taxonomy_tags_require_one_target_and_support_cross_tags(session):
    subject = Subject(name="Medicine")
    system = System(name="Cardiovascular")
    topic = Topic(name="Myocardial infarction", subjects=[subject], systems=[system])
    question = Question(stem="Taxonomy question")
    session.add_all([topic, question]); session.flush()
    subject.systems.append(system)
    session.add_all([
        QuestionTaxonomyTag(question_id=question.id, subject_id=subject.id, tag_role=TagRole.PRIMARY),
        QuestionTaxonomyTag(question_id=question.id, topic_id=topic.id, tag_role=TagRole.CROSS_DISCIPLINARY),
    ])
    session.commit()
    assert {tag.tag_role for tag in question.taxonomy_tags} == {TagRole.PRIMARY, TagRole.CROSS_DISCIPLINARY}
    session.add(QuestionTaxonomyTag(question_id=question.id, subject_id=subject.id, system_id=system.id))
    with pytest.raises(IntegrityError): session.commit()


def test_media_verification_and_import_audit_records(session):
    source = Source(name="Manual", source_type=SourceType.MANUAL_ENTRY, external_namespace="manual.personal")
    question = Question(stem="Audited question")
    session.add_all([source, question]); session.flush()
    media = QuestionMedia(question_id=question.id, media_type=MediaType.IMAGE, storage_reference="media/figure-1.png")
    verification = QuestionVerificationState(question_id=question.id, verification_aspect=VerificationAspect.ANSWER, status=VerificationStatus.PENDING, review_source_id=source.id)
    batch = ImportBatch(source_id=source.id, input_format=ImportFormat.CSV, input_name="questions.csv", input_checksum="a" * 64, schema_version="v1")
    session.add_all([media, verification, batch]); session.flush()
    row = ImportRow(import_batch_id=batch.id, row_number=1, raw_payload='{"stem": "Audited question"}', status=ImportRowStatus.PROBABLE_DUPLICATE, matched_question_id=question.id)
    session.add(row); session.commit()
    assert session.get(ImportRow, row.id).matched_question_id == question.id
    assert session.get(QuestionVerificationState, verification.id).status is VerificationStatus.PENDING
    session.add(ImportRow(import_batch_id=batch.id, row_number=1, raw_payload="duplicate row"))
    with pytest.raises(IntegrityError): session.commit()


def test_migration_upgrade_from_empty_database(tmp_path):
    database = tmp_path / "migrated.sqlite"
    environment = os.environ | {"NEETPG2027_DATABASE_URL": f"sqlite:///{database}"}
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=os.getcwd(), env=environment, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    engine = create_engine(f"sqlite:///{database}")
    with engine.connect() as connection:
        names = {row[0] for row in connection.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        assert {"subjects", "questions", "question_occurrences", "attempts", "revision_events", "revision_schedules", "app_settings", "exams", "exam_administrations", "sources", "question_options", "question_taxonomy_tags", "question_media", "question_verification_states", "import_batches", "import_rows"} <= names
