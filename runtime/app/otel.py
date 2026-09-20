from __future__ import annotations

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import Settings


def _http_traces_url(endpoint: str) -> str:
    """FastAPI uses the OTLP HTTP exporter (collector :4318). :4317 is gRPC."""
    traces_url = endpoint.rstrip("/")
    if traces_url.endswith(":4317"):
        traces_url = f"{traces_url[:-5]}:4318"
    if not traces_url.endswith("/v1/traces"):
        traces_url = f"{traces_url}/v1/traces"
    return traces_url


def setup_tracing(settings: Settings, engine=None) -> TracerProvider:
    resource = Resource.create({"service.name": settings.OTEL_SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    endpoint = (settings.OTEL_EXPORTER_OTLP_ENDPOINT or "").strip()
    # Hobby has no collector. An empty endpoint is a no-op provider (no stdout spans).
    if endpoint and not settings.TESTING:
        exporter = OTLPSpanExporter(endpoint=_http_traces_url(endpoint))
        provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    LoggingInstrumentor().instrument(set_logging_format=False)
    if engine is not None and not settings.TESTING:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
    return provider


def instrument_app(app) -> None:
    FastAPIInstrumentor.instrument_app(app)


def get_tracer(name: str = "hitl-runtime"):
    return trace.get_tracer(name)
