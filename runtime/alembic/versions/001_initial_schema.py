"""initial schema: workflows, sessions, audit, remediations

Revision ID: 001_initial
Revises:
Create Date: 2026-09-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _uuid():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(32)


def upgrade() -> None:
    uuid_type = _uuid()
    json_type = sa.JSON()

    op.create_table(
        "workflows",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("slug", sa.String(128), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("definition", json_type, nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("slug", "version", name="uq_workflows_slug_version"),
    )
    op.create_index("ix_workflows_slug", "workflows", ["slug"])
    op.create_index("ix_workflows_slug_status", "workflows", ["slug", "status"])
    op.create_index(
        "uq_workflows_one_published",
        "workflows",
        ["slug"],
        unique=True,
        sqlite_where=sa.text("status = 'published'"),
        postgresql_where=sa.text("status = 'published'"),
    )

    op.create_table(
        "workflow_sessions",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("workflow_id", uuid_type, sa.ForeignKey("workflows.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="created"),
        sa.Column("current_node_id", sa.String(128), nullable=True),
        sa.Column("accumulated_answers", json_type, nullable=False),
        sa.Column("derived", json_type, nullable=False),
        sa.Column("citations", json_type, nullable=False),
        sa.Column("history", json_type, nullable=False),
        sa.Column("event_fingerprint", sa.String(64), nullable=True, unique=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "audit_events",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("session_id", uuid_type, sa.ForeignKey("workflow_sessions.id"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("payload", json_type, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_events_session_id", "audit_events", ["session_id"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])

    op.create_table(
        "remediations",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("session_id", uuid_type, sa.ForeignKey("workflow_sessions.id"), nullable=False),
        sa.Column("audit_event_id", uuid_type, sa.ForeignKey("audit_events.id"), nullable=False),
        sa.Column("account_id", sa.String(64), nullable=False),
        sa.Column("security_id", sa.String(64), nullable=False),
        sa.Column("book_qty", sa.Float(), nullable=False),
        sa.Column("custodian_qty", sa.Float(), nullable=False),
        sa.Column("delta", sa.Float(), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_remediations_session_id", "remediations", ["session_id"])


def downgrade() -> None:
    op.drop_table("remediations")
    op.drop_table("audit_events")
    op.drop_table("workflow_sessions")
    op.drop_table("workflows")
