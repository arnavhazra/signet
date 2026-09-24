from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid

from app.models.base import Base
from app.org import DEMO_ORG_ID


def utcnow() -> datetime:
    return datetime.utcnow()


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    definition: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("slug", "version", name="uq_workflows_slug_version"),
        Index("ix_workflows_slug_status", "slug", "status"),
        Index(
            "uq_workflows_one_published",
            "slug",
            unique=True,
            sqlite_where=text("status = 'published'"),
            postgresql_where=text("status = 'published'"),
        ),
    )


class WorkflowSession(Base):
    __tablename__ = "workflow_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[str] = mapped_column(String(64), nullable=False, default=DEMO_ORG_ID, index=True)
    workflow_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workflows.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="created")
    current_node_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    accumulated_answers: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    derived: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    citations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    history: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    event_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("org_id", "event_fingerprint", name="uq_sessions_org_fingerprint"),
        Index("ix_sessions_org_status_created", "org_id", "status", "created_at"),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[str] = mapped_column(String(64), nullable=False, default=DEMO_ORG_ID, index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("workflow_sessions.id"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    actor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)


class Remediation(Base):
    __tablename__ = "remediations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[str] = mapped_column(String(64), nullable=False, default=DEMO_ORG_ID, index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("workflow_sessions.id"), nullable=False, index=True
    )
    audit_event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("audit_events.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(String(64), nullable=False)
    security_id: Mapped[str] = mapped_column(String(64), nullable=False)
    book_qty: Mapped[float] = mapped_column(nullable=False)
    custodian_qty: Mapped[float] = mapped_column(nullable=False)
    delta: Mapped[float] = mapped_column(nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class ExceptionEventRow(Base):
    __tablename__ = "exception_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[str] = mapped_column(String(64), nullable=False, default=DEMO_ORG_ID, index=True)
    source: Mapped[str] = mapped_column(String(256), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("workflow_sessions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("org_id", "source", name="uq_exception_events_org_source"),
        Index(
            "uq_exception_events_org_idempotency",
            "org_id",
            "idempotency_key",
            unique=True,
            sqlite_where=text("idempotency_key IS NOT NULL"),
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
    )


class DemoAccount(Base):
    """Simulated signup profile — one row per visitor org_id. No email, no Stripe."""

    __tablename__ = "demo_accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    org_name: Mapped[str] = mapped_column(String(256), nullable=False)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="operator")
    confirm_token: Mapped[str] = mapped_column(String(64), nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
