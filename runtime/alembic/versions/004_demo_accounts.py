"""demo_accounts for simulated signup / billing profile

Revision ID: 004_demo_accounts
Revises: 003_audit_session_nullable
Create Date: 2026-09-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004_demo_accounts"
down_revision = "003_audit_session_nullable"
branch_labels = None
depends_on = None


def _uuid():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(32)


def upgrade() -> None:
    uuid_type = _uuid()
    op.create_table(
        "demo_accounts",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("org_id", sa.String(64), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("org_name", sa.String(256), nullable=False),
        sa.Column("plan", sa.String(32), nullable=False, server_default="operator"),
        sa.Column("confirm_token", sa.String(64), nullable=False),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("org_id", name="uq_demo_accounts_org_id"),
    )
    op.create_index("ix_demo_accounts_org_id", "demo_accounts", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_demo_accounts_org_id", table_name="demo_accounts")
    op.drop_table("demo_accounts")
