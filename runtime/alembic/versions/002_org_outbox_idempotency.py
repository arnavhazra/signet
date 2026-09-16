"""org_id, exception_events outbox, lock_version, RLS

Revision ID: 002_org_outbox
Revises: 001_initial
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002_org_outbox"
down_revision = "001_initial"
branch_labels = None
depends_on = None

DEMO_ORG = "org_signet_demo"


def _uuid():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(32)


def upgrade() -> None:
    uuid_type = _uuid()
    json_type = sa.JSON()
    bind = op.get_bind()

    op.add_column("workflow_sessions", sa.Column("org_id", sa.String(64), nullable=True))
    op.add_column("workflow_sessions", sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("audit_events", sa.Column("org_id", sa.String(64), nullable=True))
    op.add_column("audit_events", sa.Column("actor", sa.String(64), nullable=True))
    op.add_column("remediations", sa.Column("org_id", sa.String(64), nullable=True))

    op.execute(sa.text(f"UPDATE workflow_sessions SET org_id = '{DEMO_ORG}' WHERE org_id IS NULL"))
    op.execute(sa.text(f"UPDATE audit_events SET org_id = '{DEMO_ORG}' WHERE org_id IS NULL"))
    op.execute(sa.text(f"UPDATE remediations SET org_id = '{DEMO_ORG}' WHERE org_id IS NULL"))

    op.alter_column("workflow_sessions", "org_id", existing_type=sa.String(64), nullable=False)
    op.alter_column("audit_events", "org_id", existing_type=sa.String(64), nullable=False)
    op.alter_column("remediations", "org_id", existing_type=sa.String(64), nullable=False)

    op.create_index("ix_workflow_sessions_org_id", "workflow_sessions", ["org_id"])
    op.create_index("ix_sessions_org_status_created", "workflow_sessions", ["org_id", "status", "created_at"])
    op.create_index("ix_audit_events_org_id", "audit_events", ["org_id"])
    op.create_index("ix_remediations_org_id", "remediations", ["org_id"])

    inspector = sa.inspect(bind)
    unique_names = {c["name"] for c in inspector.get_unique_constraints("workflow_sessions")}
    index_names = {i["name"] for i in inspector.get_indexes("workflow_sessions")}
    if "uq_workflow_sessions_event_fingerprint" in unique_names:
        op.drop_constraint("uq_workflow_sessions_event_fingerprint", "workflow_sessions", type_="unique")
    if "workflow_sessions_event_fingerprint_key" in unique_names:
        op.drop_constraint("workflow_sessions_event_fingerprint_key", "workflow_sessions", type_="unique")
    if "ix_workflow_sessions_event_fingerprint" in index_names:
        op.drop_index("ix_workflow_sessions_event_fingerprint", table_name="workflow_sessions")
    op.create_unique_constraint("uq_sessions_org_fingerprint", "workflow_sessions", ["org_id", "event_fingerprint"])

    op.create_table(
        "exception_events",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("org_id", sa.String(64), nullable=False),
        sa.Column("source", sa.String(256), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("payload", json_type, nullable=False),
        sa.Column("session_id", uuid_type, sa.ForeignKey("workflow_sessions.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("org_id", "source", name="uq_exception_events_org_source"),
    )
    op.create_index("ix_exception_events_org_id", "exception_events", ["org_id"])
    op.create_index(
        "uq_exception_events_org_idempotency",
        "exception_events",
        ["org_id", "idempotency_key"],
        unique=True,
        sqlite_where=sa.text("idempotency_key IS NOT NULL"),
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                ALTER TABLE workflow_sessions ENABLE ROW LEVEL SECURITY;
                ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
                ALTER TABLE remediations ENABLE ROW LEVEL SECURITY;
                ALTER TABLE exception_events ENABLE ROW LEVEL SECURITY;
                DROP POLICY IF EXISTS workflow_sessions_org ON workflow_sessions;
                CREATE POLICY workflow_sessions_org ON workflow_sessions
                  USING (org_id = current_setting('app.current_org', true));
                DROP POLICY IF EXISTS audit_events_org ON audit_events;
                CREATE POLICY audit_events_org ON audit_events
                  USING (org_id = current_setting('app.current_org', true));
                DROP POLICY IF EXISTS remediations_org ON remediations;
                CREATE POLICY remediations_org ON remediations
                  USING (org_id = current_setting('app.current_org', true));
                DROP POLICY IF EXISTS exception_events_org ON exception_events;
                CREATE POLICY exception_events_org ON exception_events
                  USING (org_id = current_setting('app.current_org', true));
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                DROP POLICY IF EXISTS exception_events_org ON exception_events;
                DROP POLICY IF EXISTS remediations_org ON remediations;
                DROP POLICY IF EXISTS audit_events_org ON audit_events;
                DROP POLICY IF EXISTS workflow_sessions_org ON workflow_sessions;
                ALTER TABLE exception_events DISABLE ROW LEVEL SECURITY;
                ALTER TABLE remediations DISABLE ROW LEVEL SECURITY;
                ALTER TABLE audit_events DISABLE ROW LEVEL SECURITY;
                ALTER TABLE workflow_sessions DISABLE ROW LEVEL SECURITY;
                """
            )
        )
    op.drop_index("uq_exception_events_org_idempotency", table_name="exception_events")
    op.drop_table("exception_events")
    op.drop_constraint("uq_sessions_org_fingerprint", "workflow_sessions", type_="unique")
    op.create_unique_constraint("uq_workflow_sessions_event_fingerprint", "workflow_sessions", ["event_fingerprint"])
    op.drop_index("ix_remediations_org_id", table_name="remediations")
    op.drop_index("ix_audit_events_org_id", table_name="audit_events")
    op.drop_index("ix_sessions_org_status_created", table_name="workflow_sessions")
    op.drop_index("ix_workflow_sessions_org_id", table_name="workflow_sessions")
    op.drop_column("remediations", "org_id")
    op.drop_column("audit_events", "actor")
    op.drop_column("audit_events", "org_id")
    op.drop_column("workflow_sessions", "lock_version")
    op.drop_column("workflow_sessions", "org_id")
