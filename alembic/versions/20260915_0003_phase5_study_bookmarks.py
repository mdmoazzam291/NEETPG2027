"""Add durable question bookmarks for the Phase 5 study workflow.

Revision ID: 20260915_0003
Revises: 20260911_0002
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa


revision = "20260915_0003"
down_revision = "20260911_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_bookmarks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
        sa.UniqueConstraint("question_id", name="uq_question_bookmarks_question"),
    )
    op.create_index("ix_question_bookmarks_created_at", "question_bookmarks", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_question_bookmarks_created_at", table_name="question_bookmarks")
    op.drop_table("question_bookmarks")
