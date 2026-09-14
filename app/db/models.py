"""Persistent Phase 1 study-engine entities.

No seeded medical taxonomy or PYQ content is included: this module only defines storage.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Enum as SqlEnum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class LifecycleStatus(str, Enum):
    IMPORTED = "imported"
    VALIDATED = "validated"
    DUPLICATE_REVIEW = "duplicate_review"
    VERIFIED = "verified"
    ACTIVE = "active"
    ARCHIVED = "archived"


class VerificationStatus(str, Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class AttemptOutcome(str, Enum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    SKIPPED = "skipped"


class QuestionType(str, Enum):
    SINGLE_BEST_ANSWER = "single_best_answer"
    MULTIPLE_CORRECT = "multiple_correct"
    TRUE_FALSE = "true_false"
    ASSERTION_REASON = "assertion_reason"
    MATCHING = "matching"
    SHORT_ANSWER = "short_answer"
    OTHER = "other"


class TagRole(str, Enum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    CROSS_DISCIPLINARY = "cross_disciplinary"
    IMPORTED_UNVERIFIED = "imported_unverified"


class SourceType(str, Enum):
    OFFICIAL_PAPER = "official_paper"
    OFFICIAL_KEY = "official_key"
    PUBLISHER = "publisher"
    DATASET = "dataset"
    MANUAL_ENTRY = "manual_entry"
    OTHER = "other"


class MediaType(str, Enum):
    IMAGE = "image"
    DIAGRAM = "diagram"
    TABLE = "table"
    AUDIO = "audio"
    OTHER = "other"


class VerificationAspect(str, Enum):
    CONTENT = "content"
    ANSWER = "answer"
    TAXONOMY = "taxonomy"
    REFERENCE = "reference"


class ImportFormat(str, Enum):
    CSV = "csv"
    JSON = "json"
    MANUAL = "manual"


class ImportBatchStatus(str, Enum):
    PREVIEWED = "previewed"
    VALIDATED = "validated"
    IMPORTED = "imported"
    PARTIALLY_REJECTED = "partially_rejected"
    REJECTED = "rejected"


class ImportRowStatus(str, Enum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXACT_DUPLICATE = "exact_duplicate"
    PROBABLE_DUPLICATE = "probable_duplicate"
    REQUIRES_REVIEW = "requires_review"


lifecycle_enum = SqlEnum(LifecycleStatus, native_enum=False, create_constraint=True, name="lifecycle_status")
verification_enum = SqlEnum(VerificationStatus, native_enum=False, create_constraint=True, name="verification_status")
attempt_outcome_enum = SqlEnum(AttemptOutcome, native_enum=False, create_constraint=True, name="attempt_outcome")
question_type_enum = SqlEnum(QuestionType, native_enum=False, create_constraint=True, name="question_type")
tag_role_enum = SqlEnum(TagRole, native_enum=False, create_constraint=True, name="tag_role")
source_type_enum = SqlEnum(SourceType, native_enum=False, create_constraint=True, name="source_type")
media_type_enum = SqlEnum(MediaType, native_enum=False, create_constraint=True, name="media_type")
verification_aspect_enum = SqlEnum(VerificationAspect, native_enum=False, create_constraint=True, name="verification_aspect")
import_format_enum = SqlEnum(ImportFormat, native_enum=False, create_constraint=True, name="import_format")
import_batch_status_enum = SqlEnum(ImportBatchStatus, native_enum=False, create_constraint=True, name="import_batch_status")
import_row_status_enum = SqlEnum(ImportRowStatus, native_enum=False, create_constraint=True, name="import_row_status")


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Subject(Timestamped, Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    code: Mapped[Optional[str]] = mapped_column(String(32), unique=True)
    topics: Mapped[list[Topic]] = relationship(secondary="topic_subjects", back_populates="subjects")
    systems: Mapped[list[System]] = relationship(secondary="subject_systems", back_populates="subjects")


class System(Timestamped, Base):
    __tablename__ = "systems"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    topics: Mapped[list[Topic]] = relationship(secondary="topic_systems", back_populates="systems")
    subjects: Mapped[list[Subject]] = relationship(secondary="subject_systems", back_populates="systems")


class TopicSubject(Base):
    __tablename__ = "topic_subjects"
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True)


class TopicSystem(Base):
    __tablename__ = "topic_systems"
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    system_id: Mapped[int] = mapped_column(ForeignKey("systems.id", ondelete="RESTRICT"), primary_key=True)


class SubjectSystem(Base):
    __tablename__ = "subject_systems"
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True)
    system_id: Mapped[int] = mapped_column(ForeignKey("systems.id", ondelete="RESTRICT"), primary_key=True)


class Topic(Timestamped, Base):
    __tablename__ = "topics"
    __table_args__ = (UniqueConstraint("name", name="uq_topics_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.ACTIVE, nullable=False)
    subjects: Mapped[list[Subject]] = relationship(secondary="topic_subjects", back_populates="topics")
    systems: Mapped[list[System]] = relationship(secondary="topic_systems", back_populates="topics")
    subtopics: Mapped[list[Subtopic]] = relationship(back_populates="topic")


class Subtopic(Timestamped, Base):
    __tablename__ = "subtopics"
    __table_args__ = (UniqueConstraint("topic_id", "name", name="uq_subtopics_topic_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.ACTIVE, nullable=False)
    topic: Mapped[Topic] = relationship(back_populates="subtopics")


class Question(Timestamped, Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("difficulty IS NULL OR difficulty BETWEEN 1 AND 5", name="ck_questions_difficulty_range"),
        Index("ix_questions_content_hash", "content_hash"),
        Index("ix_questions_content_fingerprint", "content_hash", "content_fingerprint_version"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(question_type_enum, default=QuestionType.SINGLE_BEST_ANSWER, nullable=False)
    answer_explanation: Mapped[Optional[str]] = mapped_column(Text)
    reference_text: Mapped[Optional[str]] = mapped_column(Text)
    difficulty: Mapped[Optional[int]] = mapped_column(Integer)
    is_clinical: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_integrated: Mapped[bool] = mapped_column(default=False, nullable=False)
    clinical_metadata_notes: Mapped[Optional[str]] = mapped_column(Text)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64))
    content_fingerprint_version: Mapped[str] = mapped_column(String(16), default="v1", nullable=False)
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.IMPORTED, nullable=False, index=True)
    duplicate_of_question_id: Mapped[Optional[int]] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"))
    duplicate_of: Mapped[Optional[Question]] = relationship(remote_side="Question.id")
    occurrences: Mapped[list[QuestionOccurrence]] = relationship(back_populates="question")
    options: Mapped[list[QuestionOption]] = relationship(back_populates="question", cascade="all, delete-orphan")
    taxonomy_tags: Mapped[list[QuestionTaxonomyTag]] = relationship(back_populates="question", cascade="all, delete-orphan")
    media: Mapped[list[QuestionMedia]] = relationship(back_populates="question", cascade="all, delete-orphan")
    verification_states: Mapped[list[QuestionVerificationState]] = relationship(back_populates="question", cascade="all, delete-orphan")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="question")


class QuestionOccurrence(Timestamped, Base):
    __tablename__ = "question_occurrences"
    __table_args__ = (
        Index("ix_occurrences_source_identifier", "source", "source_identifier", unique=True, sqlite_where=text("source_identifier IS NOT NULL")),
        Index("ix_occurrences_source_id_identifier", "source_id", "source_identifier", unique=True, sqlite_where=text("source_id IS NOT NULL AND source_identifier IS NOT NULL")),
        Index("ix_occurrences_question_verification", "question_id", "verification_status"),
        Index("ix_occurrences_administration_question", "exam_administration_id", "question_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sources.id", ondelete="RESTRICT"), index=True)
    exam_administration_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exam_administrations.id", ondelete="RESTRICT"), index=True)
    source_identifier: Mapped[Optional[str]] = mapped_column(String(160))
    question_number: Mapped[Optional[str]] = mapped_column(String(64))
    source_reference: Mapped[Optional[str]] = mapped_column(Text)
    exam_year: Mapped[Optional[int]] = mapped_column(Integer)
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.IMPORTED, nullable=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(verification_enum, default=VerificationStatus.UNVERIFIED, nullable=False, index=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    question: Mapped[Question] = relationship(back_populates="occurrences")
    source_record: Mapped[Optional[Source]] = relationship(back_populates="occurrences")
    exam_administration: Mapped[Optional[ExamAdministration]] = relationship(back_populates="occurrences")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="occurrence")


class Exam(Timestamped, Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.ACTIVE, nullable=False)
    administrations: Mapped[list[ExamAdministration]] = relationship(back_populates="exam")


class ExamAdministration(Timestamped, Base):
    __tablename__ = "exam_administrations"
    __table_args__ = (UniqueConstraint("exam_id", "exam_year", "session_code", name="uq_exam_administrations_identity"), Index("ix_exam_administrations_exam_year", "exam_id", "exam_year"))
    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="RESTRICT"), nullable=False)
    exam_year: Mapped[int] = mapped_column(Integer, nullable=False)
    session_code: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    attempt_label: Mapped[Optional[str]] = mapped_column(String(120))
    exam_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    exam: Mapped[Exam] = relationship(back_populates="administrations")
    occurrences: Mapped[list[QuestionOccurrence]] = relationship(back_populates="exam_administration")


class Source(Timestamped, Base):
    __tablename__ = "sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(source_type_enum, nullable=False)
    external_namespace: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    citation: Mapped[Optional[str]] = mapped_column(Text)
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    source_version: Mapped[Optional[str]] = mapped_column(String(80))
    verification_status: Mapped[VerificationStatus] = mapped_column(verification_enum, default=VerificationStatus.UNVERIFIED, nullable=False, index=True)
    occurrences: Mapped[list[QuestionOccurrence]] = relationship(back_populates="source_record")


class QuestionOption(Timestamped, Base):
    __tablename__ = "question_options"
    __table_args__ = (UniqueConstraint("question_id", "position", name="uq_question_options_position"), CheckConstraint("position > 0", name="ck_question_options_positive_position"), Index("ix_question_options_question_correct", "question_id", "is_correct"))
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(default=False, nullable=False)
    explanation: Mapped[Optional[str]] = mapped_column(Text)
    question: Mapped[Question] = relationship(back_populates="options")
    media: Mapped[list[QuestionMedia]] = relationship(back_populates="question_option")


class QuestionTaxonomyTag(Timestamped, Base):
    __tablename__ = "question_taxonomy_tags"
    __table_args__ = (
        CheckConstraint("(CASE WHEN subject_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN system_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN topic_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN subtopic_id IS NOT NULL THEN 1 ELSE 0 END) = 1", name="ck_question_taxonomy_tags_one_target"),
        Index("ix_question_taxonomy_tags_topic_question", "topic_id", "question_id"),
        Index("ix_question_taxonomy_tags_subtopic_question", "subtopic_id", "question_id"),
        Index("uq_question_taxonomy_tags_subject", "question_id", "subject_id", unique=True, sqlite_where=text("subject_id IS NOT NULL")),
        Index("uq_question_taxonomy_tags_system", "question_id", "system_id", unique=True, sqlite_where=text("system_id IS NOT NULL")),
        Index("uq_question_taxonomy_tags_topic", "question_id", "topic_id", unique=True, sqlite_where=text("topic_id IS NOT NULL")),
        Index("uq_question_taxonomy_tags_subtopic", "question_id", "subtopic_id", unique=True, sqlite_where=text("subtopic_id IS NOT NULL")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"), index=True)
    system_id: Mapped[Optional[int]] = mapped_column(ForeignKey("systems.id", ondelete="RESTRICT"), index=True)
    topic_id: Mapped[Optional[int]] = mapped_column(ForeignKey("topics.id", ondelete="RESTRICT"), index=True)
    subtopic_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subtopics.id", ondelete="RESTRICT"), index=True)
    tag_role: Mapped[TagRole] = mapped_column(tag_role_enum, default=TagRole.IMPORTED_UNVERIFIED, nullable=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(verification_enum, default=VerificationStatus.UNVERIFIED, nullable=False)
    question: Mapped[Question] = relationship(back_populates="taxonomy_tags")


class QuestionMedia(Timestamped, Base):
    __tablename__ = "question_media"
    __table_args__ = (UniqueConstraint("question_id", "position", name="uq_question_media_position"), Index("ix_question_media_content_hash", "content_hash"))
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_option_id: Mapped[Optional[int]] = mapped_column(ForeignKey("question_options.id", ondelete="CASCADE"), index=True)
    media_type: Mapped[MediaType] = mapped_column(media_type_enum, nullable=False)
    storage_reference: Mapped[str] = mapped_column(Text, nullable=False)
    alt_text: Mapped[Optional[str]] = mapped_column(Text)
    caption: Mapped[Optional[str]] = mapped_column(Text)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64))
    position: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    question: Mapped[Question] = relationship(back_populates="media")
    question_option: Mapped[Optional[QuestionOption]] = relationship(back_populates="media")


class QuestionVerificationState(Timestamped, Base):
    __tablename__ = "question_verification_states"
    __table_args__ = (UniqueConstraint("question_id", "verification_aspect", name="uq_question_verification_aspect"), Index("ix_question_verification_states_status_aspect", "status", "verification_aspect"))
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    verification_aspect: Mapped[VerificationAspect] = mapped_column(verification_aspect_enum, nullable=False)
    status: Mapped[VerificationStatus] = mapped_column(verification_enum, default=VerificationStatus.UNVERIFIED, nullable=False)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    review_notes: Mapped[Optional[str]] = mapped_column(Text)
    review_source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sources.id", ondelete="RESTRICT"))
    question: Mapped[Question] = relationship(back_populates="verification_states")
    review_source: Mapped[Optional[Source]] = relationship(foreign_keys=[review_source_id])


class ImportBatch(Base):
    __tablename__ = "import_batches"
    __table_args__ = (Index("ix_import_batches_source_checksum", "source_id", "input_checksum"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sources.id", ondelete="RESTRICT"), index=True)
    input_format: Mapped[ImportFormat] = mapped_column(import_format_enum, nullable=False)
    input_name: Mapped[str] = mapped_column(String(255), nullable=False)
    input_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[ImportBatchStatus] = mapped_column(import_batch_status_enum, default=ImportBatchStatus.PREVIEWED, nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows: Mapped[list[ImportRow]] = relationship(back_populates="import_batch", cascade="all, delete-orphan")


class ImportRow(Timestamped, Base):
    __tablename__ = "import_rows"
    __table_args__ = (UniqueConstraint("import_batch_id", "row_number", name="uq_import_rows_batch_row"), Index("ix_import_rows_batch_status", "import_batch_id", "status"), Index("ix_import_rows_external_id", "external_id"))
    id: Mapped[int] = mapped_column(primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    external_id: Mapped[Optional[str]] = mapped_column(String(160))
    raw_payload: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_payload: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[ImportRowStatus] = mapped_column(import_row_status_enum, default=ImportRowStatus.REQUIRES_REVIEW, nullable=False)
    validation_errors: Mapped[Optional[str]] = mapped_column(Text)
    question_id: Mapped[Optional[int]] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    question_occurrence_id: Mapped[Optional[int]] = mapped_column(ForeignKey("question_occurrences.id", ondelete="RESTRICT"))
    matched_question_id: Mapped[Optional[int]] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    import_batch: Mapped[ImportBatch] = relationship(back_populates="rows")
    question: Mapped[Optional[Question]] = relationship(foreign_keys=[question_id])
    question_occurrence: Mapped[Optional[QuestionOccurrence]] = relationship(foreign_keys=[question_occurrence_id])
    matched_question: Mapped[Optional[Question]] = relationship(foreign_keys=[matched_question_id])


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (CheckConstraint("time_spent_seconds IS NULL OR time_spent_seconds >= 0", name="ck_attempts_time_nonnegative"), Index("ix_attempts_question_attempted_at", "question_id", "attempted_at"))
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False)
    occurrence_id: Mapped[Optional[int]] = mapped_column(ForeignKey("question_occurrences.id", ondelete="RESTRICT"))
    outcome: Mapped[AttemptOutcome] = mapped_column(attempt_outcome_enum, nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    selected_option: Mapped[Optional[str]] = mapped_column(String(32))
    confidence: Mapped[Optional[int]] = mapped_column(Integer)
    time_spent_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    mistake_category: Mapped[Optional[str]] = mapped_column(String(80))
    user_notes: Mapped[Optional[str]] = mapped_column(Text)
    question: Mapped[Question] = relationship(back_populates="attempts")
    occurrence: Mapped[Optional[QuestionOccurrence]] = relationship(back_populates="attempts")


class RevisionEvent(Base):
    __tablename__ = "revision_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False, index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    question: Mapped[Question] = relationship()


class RevisionSchedule(Timestamped, Base):
    __tablename__ = "revision_schedules"
    __table_args__ = (UniqueConstraint("question_id", name="uq_revision_schedules_question"), Index("ix_revision_schedules_next_revision_at", "next_revision_at"))
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False)
    next_revision_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(40), default="planned", nullable=False)
    question: Mapped[Question] = relationship()


class AppSetting(Timestamped, Base):
    __tablename__ = "app_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
