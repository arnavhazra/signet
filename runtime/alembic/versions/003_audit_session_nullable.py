"""nullable audit_events.session_id for agent.denied / session-less proposals

Revision ID: 003_audit_session_nullable
Revises: 002_org_outbox
Create Date: 2026-09-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003_audit_session_nullable"
down_revision = "002_org_outbox"
branch_labels = None
depends_on = None


def _uuid():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(32)


def upgrade() -> None:
    op.alter_column(
        "audit_events",
        "session_id",
        existing_type=_uuid(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "audit_events",
        "session_id",
        existing_type=_uuid(),
        nullable=False,
    )
