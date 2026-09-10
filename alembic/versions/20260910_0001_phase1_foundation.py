"""Create Phase 1 study-engine schema.

Revision ID: 20260910_0001
Revises:
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = "20260910_0001"
down_revision = None
branch_labels = None
depends_on = None

lifecycle = sa.Enum("imported", "validated", "duplicate_review", "verified", "active", "archived", name="lifecycle_status", native_enum=False, create_constraint=True)
verification = sa.Enum("unverified", "pending", "verified", "rejected", name="verification_status", native_enum=False, create_constraint=True)
outcome = sa.Enum("correct", "incorrect", "skipped", name="attempt_outcome", native_enum=False, create_constraint=True)

def timestamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]

def upgrade() -> None:
    op.create_table("subjects", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(120), nullable=False, unique=True), sa.Column("code", sa.String(32), unique=True), *timestamps())
    op.create_table("systems", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(120), nullable=False, unique=True), *timestamps())
    op.create_table("topics", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text()), sa.Column("lifecycle_status", lifecycle, nullable=False), *timestamps(), sa.UniqueConstraint("name", name="uq_topics_name"))
    op.create_table("topic_subjects", sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True), sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True))
    op.create_table("topic_systems", sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True), sa.Column("system_id", sa.Integer(), sa.ForeignKey("systems.id", ondelete="RESTRICT"), primary_key=True))
    op.create_table("subtopics", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id", ondelete="RESTRICT"), nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text()), sa.Column("lifecycle_status", lifecycle, nullable=False), *timestamps(), sa.UniqueConstraint("topic_id", "name", name="uq_subtopics_topic_name"))
    op.create_index("ix_subtopics_topic_id", "subtopics", ["topic_id"])
    op.create_table("questions", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("stem", sa.Text(), nullable=False), sa.Column("content_hash", sa.String(64)), sa.Column("lifecycle_status", lifecycle, nullable=False), sa.Column("duplicate_of_question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="SET NULL")), *timestamps())
    op.create_index("ix_questions_content_hash", "questions", ["content_hash"])
    op.create_index("ix_questions_lifecycle_status", "questions", ["lifecycle_status"])
    op.create_table("question_occurrences", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False), sa.Column("source", sa.String(160), nullable=False), sa.Column("source_identifier", sa.String(160)), sa.Column("source_reference", sa.Text()), sa.Column("exam_year", sa.Integer()), sa.Column("lifecycle_status", lifecycle, nullable=False), sa.Column("verification_status", verification, nullable=False), sa.Column("verified_at", sa.DateTime(timezone=True)), *timestamps())
    op.create_index("ix_question_occurrences_question_id", "question_occurrences", ["question_id"])
    op.create_index("ix_question_occurrences_verification_status", "question_occurrences", ["verification_status"])
    op.create_index("ix_occurrences_question_verification", "question_occurrences", ["question_id", "verification_status"])
    op.create_index("ix_occurrences_source_identifier", "question_occurrences", ["source", "source_identifier"], unique=True, sqlite_where=sa.text("source_identifier IS NOT NULL"))
    op.create_table("attempts", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False), sa.Column("occurrence_id", sa.Integer(), sa.ForeignKey("question_occurrences.id", ondelete="RESTRICT")), sa.Column("outcome", outcome, nullable=False), sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False), sa.Column("selected_option", sa.String(32)), sa.Column("confidence", sa.Integer()), sa.Column("time_spent_seconds", sa.Integer()), sa.Column("mistake_category", sa.String(80)), sa.Column("user_notes", sa.Text()), sa.CheckConstraint("time_spent_seconds IS NULL OR time_spent_seconds >= 0", name="ck_attempts_time_nonnegative"))
    op.create_index("ix_attempts_attempted_at", "attempts", ["attempted_at"])
    op.create_index("ix_attempts_question_attempted_at", "attempts", ["question_id", "attempted_at"])
    op.create_table("revision_events", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False), sa.Column("notes", sa.Text()))
    op.create_index("ix_revision_events_question_id", "revision_events", ["question_id"])
    op.create_index("ix_revision_events_completed_at", "revision_events", ["completed_at"])
    op.create_table("revision_schedules", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False), sa.Column("next_revision_at", sa.DateTime(timezone=True)), sa.Column("state", sa.String(40), nullable=False), *timestamps(), sa.UniqueConstraint("question_id", name="uq_revision_schedules_question"))
    op.create_index("ix_revision_schedules_next_revision_at", "revision_schedules", ["next_revision_at"])
    op.create_table("app_settings", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("key", sa.String(120), nullable=False, unique=True), sa.Column("value", sa.Text(), nullable=False), *timestamps())

def downgrade() -> None:
    for table in ["app_settings", "revision_schedules", "revision_events", "attempts", "question_occurrences", "questions", "subtopics", "topic_systems", "topic_subjects", "topics", "systems", "subjects"]:
        op.drop_table(table)
