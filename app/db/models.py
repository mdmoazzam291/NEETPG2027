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


lifecycle_enum = SqlEnum(LifecycleStatus, native_enum=False, create_constraint=True, name="lifecycle_status")
verification_enum = SqlEnum(VerificationStatus, native_enum=False, create_constraint=True, name="verification_status")
attempt_outcome_enum = SqlEnum(AttemptOutcome, native_enum=False, create_constraint=True, name="attempt_outcome")


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Subject(Timestamped, Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    code: Mapped[Optional[str]] = mapped_column(String(32), unique=True)
    topics: Mapped[list[Topic]] = relationship(secondary="topic_subjects", back_populates="subjects")


class System(Timestamped, Base):
    __tablename__ = "systems"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    topics: Mapped[list[Topic]] = relationship(secondary="topic_systems", back_populates="systems")


class TopicSubject(Base):
    __tablename__ = "topic_subjects"
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True)


class TopicSystem(Base):
    __tablename__ = "topic_systems"
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
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
    __table_args__ = (Index("ix_questions_content_hash", "content_hash"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64))
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.IMPORTED, nullable=False, index=True)
    duplicate_of_question_id: Mapped[Optional[int]] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"))
    duplicate_of: Mapped[Optional[Question]] = relationship(remote_side="Question.id")
    occurrences: Mapped[list[QuestionOccurrence]] = relationship(back_populates="question")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="question")


class QuestionOccurrence(Timestamped, Base):
    __tablename__ = "question_occurrences"
    __table_args__ = (
        Index("ix_occurrences_source_identifier", "source", "source_identifier", unique=True, sqlite_where=text("source_identifier IS NOT NULL")),
        Index("ix_occurrences_question_verification", "question_id", "verification_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    source_identifier: Mapped[Optional[str]] = mapped_column(String(160))
    source_reference: Mapped[Optional[str]] = mapped_column(Text)
    exam_year: Mapped[Optional[int]] = mapped_column(Integer)
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(lifecycle_enum, default=LifecycleStatus.IMPORTED, nullable=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(verification_enum, default=VerificationStatus.UNVERIFIED, nullable=False, index=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    question: Mapped[Question] = relationship(back_populates="occurrences")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="occurrence")


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
