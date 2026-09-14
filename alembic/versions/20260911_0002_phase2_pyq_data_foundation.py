"""Create Phase 2 PYQ data foundation.

Revision ID: 20260911_0002
Revises: 20260910_0001
Create Date: 2026-09-11
"""
from alembic import op
from datetime import datetime, timezone
import hashlib
import sqlalchemy as sa


revision = "20260911_0002"
down_revision = "20260910_0001"
branch_labels = None
depends_on = None


def enum(*values: str, name: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


lifecycle = enum("imported", "validated", "duplicate_review", "verified", "active", "archived", name="lifecycle_status")
verification = enum("unverified", "pending", "verified", "rejected", name="verification_status")
question_type = enum("single_best_answer", "multiple_correct", "true_false", "assertion_reason", "matching", "short_answer", "other", name="question_type")
tag_role = enum("primary", "secondary", "cross_disciplinary", "imported_unverified", name="tag_role")
source_type = enum("official_paper", "official_key", "publisher", "dataset", "manual_entry", "other", name="source_type")
media_type = enum("image", "diagram", "table", "audio", "other", name="media_type")
verification_aspect = enum("content", "answer", "taxonomy", "reference", name="verification_aspect")
import_format = enum("csv", "json", "manual", name="import_format")
import_batch_status = enum("previewed", "validated", "imported", "partially_rejected", "rejected", name="import_batch_status")
import_row_status = enum("accepted", "rejected", "exact_duplicate", "probable_duplicate", "requires_review", name="import_row_status")


def timestamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]


def upgrade() -> None:
    op.create_table("subject_systems", sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True), sa.Column("system_id", sa.Integer(), sa.ForeignKey("systems.id", ondelete="RESTRICT"), primary_key=True))
    op.create_index("ix_subject_systems_system_id", "subject_systems", ["system_id"])
    op.create_table("exams", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(120), nullable=False, unique=True), sa.Column("code", sa.String(32), nullable=False, unique=True), sa.Column("description", sa.Text()), sa.Column("lifecycle_status", lifecycle, nullable=False), *timestamps())
    op.create_table("exam_administrations", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="RESTRICT"), nullable=False), sa.Column("exam_year", sa.Integer(), nullable=False), sa.Column("session_code", sa.String(40), nullable=False), sa.Column("attempt_label", sa.String(120)), sa.Column("exam_date", sa.DateTime(timezone=True)), *timestamps(), sa.UniqueConstraint("exam_id", "exam_year", "session_code", name="uq_exam_administrations_identity"))
    op.create_index("ix_exam_administrations_exam_year", "exam_administrations", ["exam_id", "exam_year"])
    op.create_table("sources", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(160), nullable=False), sa.Column("source_type", source_type, nullable=False), sa.Column("external_namespace", sa.String(160), nullable=False, unique=True), sa.Column("citation", sa.Text()), sa.Column("source_url", sa.Text()), sa.Column("source_version", sa.String(80)), sa.Column("verification_status", verification, nullable=False), *timestamps())
    op.create_index("ix_sources_verification_status", "sources", ["verification_status"])

    with op.batch_alter_table("questions") as batch:
        batch.add_column(sa.Column("question_type", question_type, nullable=False, server_default="single_best_answer"))
        batch.add_column(sa.Column("answer_explanation", sa.Text()))
        batch.add_column(sa.Column("reference_text", sa.Text()))
        batch.add_column(sa.Column("difficulty", sa.Integer()))
        batch.add_column(sa.Column("is_clinical", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("is_integrated", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("clinical_metadata_notes", sa.Text()))
        batch.add_column(sa.Column("content_fingerprint_version", sa.String(16), nullable=False, server_default="v1"))
        batch.create_check_constraint("ck_questions_difficulty_range", "difficulty IS NULL OR difficulty BETWEEN 1 AND 5")
    op.create_index("ix_questions_content_fingerprint", "questions", ["content_hash", "content_fingerprint_version"])

    with op.batch_alter_table("question_occurrences") as batch:
        batch.add_column(sa.Column("source_id", sa.Integer(), sa.ForeignKey("sources.id", name="fk_occurrences_source", ondelete="RESTRICT")))
        batch.add_column(sa.Column("exam_administration_id", sa.Integer(), sa.ForeignKey("exam_administrations.id", name="fk_occurrences_administration", ondelete="RESTRICT")))
        batch.add_column(sa.Column("question_number", sa.String(64)))
    # Phase 1 stored source provenance as required free text. Preserve every value by
    # creating a deterministic legacy source and linking existing occurrences to it.
    # No exam administration is inferred from a year alone because its exam family is
    # not known in the Phase 1 schema.
    connection = op.get_bind()
    source_rows = connection.execute(sa.text("SELECT DISTINCT source FROM question_occurrences")).scalars().all()
    now = datetime.now(timezone.utc)
    for legacy_source in source_rows:
        namespace = f"legacy.{hashlib.sha256(legacy_source.encode()).hexdigest()[:48]}"
        result = connection.execute(sa.text("INSERT INTO sources (name, source_type, external_namespace, verification_status, created_at, updated_at) VALUES (:name, 'other', :namespace, 'unverified', :created_at, :updated_at)"), {"name": legacy_source, "namespace": namespace, "created_at": now, "updated_at": now})
        connection.execute(sa.text("UPDATE question_occurrences SET source_id = :source_id WHERE source = :source"), {"source_id": result.lastrowid, "source": legacy_source})
    op.create_index("ix_question_occurrences_source_id", "question_occurrences", ["source_id"])
    op.create_index("ix_question_occurrences_exam_administration_id", "question_occurrences", ["exam_administration_id"])
    op.create_index("ix_occurrences_source_id_identifier", "question_occurrences", ["source_id", "source_identifier"], unique=True, sqlite_where=sa.text("source_id IS NOT NULL AND source_identifier IS NOT NULL"))
    op.create_index("ix_occurrences_administration_question", "question_occurrences", ["exam_administration_id", "question_id"])

    op.create_table("question_options", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False), sa.Column("position", sa.Integer(), nullable=False), sa.Column("label", sa.String(16)), sa.Column("text", sa.Text(), nullable=False), sa.Column("is_correct", sa.Boolean(), nullable=False), sa.Column("explanation", sa.Text()), *timestamps(), sa.UniqueConstraint("question_id", "position", name="uq_question_options_position"), sa.CheckConstraint("position > 0", name="ck_question_options_positive_position"))
    op.create_index("ix_question_options_question_id", "question_options", ["question_id"])
    op.create_index("ix_question_options_question_correct", "question_options", ["question_id", "is_correct"])
    one_target = "(CASE WHEN subject_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN system_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN topic_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN subtopic_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
    op.create_table("question_taxonomy_tags", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False), sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="RESTRICT")), sa.Column("system_id", sa.Integer(), sa.ForeignKey("systems.id", ondelete="RESTRICT")), sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id", ondelete="RESTRICT")), sa.Column("subtopic_id", sa.Integer(), sa.ForeignKey("subtopics.id", ondelete="RESTRICT")), sa.Column("tag_role", tag_role, nullable=False), sa.Column("verification_status", verification, nullable=False), *timestamps(), sa.CheckConstraint(one_target, name="ck_question_taxonomy_tags_one_target"))
    for column in ["question_id", "subject_id", "system_id", "topic_id", "subtopic_id"]:
        op.create_index(f"ix_question_taxonomy_tags_{column}", "question_taxonomy_tags", [column])
    op.create_index("ix_question_taxonomy_tags_topic_question", "question_taxonomy_tags", ["topic_id", "question_id"])
    op.create_index("ix_question_taxonomy_tags_subtopic_question", "question_taxonomy_tags", ["subtopic_id", "question_id"])
    for name, column in [("subject", "subject_id"), ("system", "system_id"), ("topic", "topic_id"), ("subtopic", "subtopic_id")]:
        op.create_index(f"uq_question_taxonomy_tags_{name}", "question_taxonomy_tags", ["question_id", column], unique=True, sqlite_where=sa.text(f"{column} IS NOT NULL"))
    op.create_table("question_media", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False), sa.Column("question_option_id", sa.Integer(), sa.ForeignKey("question_options.id", ondelete="CASCADE")), sa.Column("media_type", media_type, nullable=False), sa.Column("storage_reference", sa.Text(), nullable=False), sa.Column("alt_text", sa.Text()), sa.Column("caption", sa.Text()), sa.Column("content_hash", sa.String(64)), sa.Column("position", sa.Integer(), nullable=False), *timestamps(), sa.UniqueConstraint("question_id", "position", name="uq_question_media_position"))
    op.create_index("ix_question_media_question_id", "question_media", ["question_id"])
    op.create_index("ix_question_media_question_option_id", "question_media", ["question_option_id"])
    op.create_index("ix_question_media_content_hash", "question_media", ["content_hash"])
    op.create_table("question_verification_states", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False), sa.Column("verification_aspect", verification_aspect, nullable=False), sa.Column("status", verification, nullable=False), sa.Column("reviewed_at", sa.DateTime(timezone=True)), sa.Column("review_notes", sa.Text()), sa.Column("review_source_id", sa.Integer(), sa.ForeignKey("sources.id", ondelete="RESTRICT")), *timestamps(), sa.UniqueConstraint("question_id", "verification_aspect", name="uq_question_verification_aspect"))
    op.create_index("ix_question_verification_states_question_id", "question_verification_states", ["question_id"])
    op.create_index("ix_question_verification_states_status_aspect", "question_verification_states", ["status", "verification_aspect"])
    op.create_table("import_batches", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("source_id", sa.Integer(), sa.ForeignKey("sources.id", ondelete="RESTRICT")), sa.Column("input_format", import_format, nullable=False), sa.Column("input_name", sa.String(255), nullable=False), sa.Column("input_checksum", sa.String(64), nullable=False), sa.Column("schema_version", sa.String(32), nullable=False), sa.Column("status", import_batch_status, nullable=False), sa.Column("started_at", sa.DateTime(timezone=True), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True)), sa.Column("row_count", sa.Integer(), nullable=False), sa.Column("accepted_count", sa.Integer(), nullable=False), sa.Column("rejected_count", sa.Integer(), nullable=False), sa.Column("duplicate_count", sa.Integer(), nullable=False))
    op.create_index("ix_import_batches_source_id", "import_batches", ["source_id"])
    op.create_index("ix_import_batches_status", "import_batches", ["status"])
    op.create_index("ix_import_batches_source_checksum", "import_batches", ["source_id", "input_checksum"])
    op.create_table("import_rows", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False), sa.Column("row_number", sa.Integer(), nullable=False), sa.Column("external_id", sa.String(160)), sa.Column("raw_payload", sa.Text(), nullable=False), sa.Column("normalized_payload", sa.Text()), sa.Column("status", import_row_status, nullable=False), sa.Column("validation_errors", sa.Text()), sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT")), sa.Column("question_occurrence_id", sa.Integer(), sa.ForeignKey("question_occurrences.id", ondelete="RESTRICT")), sa.Column("matched_question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT")), *timestamps(), sa.UniqueConstraint("import_batch_id", "row_number", name="uq_import_rows_batch_row"))
    op.create_index("ix_import_rows_batch_status", "import_rows", ["import_batch_id", "status"])
    op.create_index("ix_import_rows_external_id", "import_rows", ["external_id"])


def downgrade() -> None:
    for table in ["import_rows", "import_batches", "question_verification_states", "question_media", "question_taxonomy_tags", "question_options"]:
        op.drop_table(table)
    for index in ["ix_occurrences_administration_question", "ix_occurrences_source_id_identifier", "ix_question_occurrences_exam_administration_id", "ix_question_occurrences_source_id"]:
        op.drop_index(index, table_name="question_occurrences")
    with op.batch_alter_table("question_occurrences") as batch:
        batch.drop_column("question_number")
        batch.drop_column("exam_administration_id")
        batch.drop_column("source_id")
    op.drop_index("ix_questions_content_fingerprint", table_name="questions")
    with op.batch_alter_table("questions") as batch:
        batch.drop_constraint("ck_questions_difficulty_range", type_="check")
        batch.drop_constraint("question_type", type_="check")
        for column in ["content_fingerprint_version", "clinical_metadata_notes", "is_integrated", "is_clinical", "difficulty", "reference_text", "answer_explanation", "question_type"]:
            batch.drop_column(column)
    for table in ["sources", "exam_administrations", "exams", "subject_systems"]:
        op.drop_table(table)
