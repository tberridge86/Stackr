from __future__ import annotations

import json
import logging
import re
import secrets
import time
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass

logger = logging.getLogger("stackr.recognition.trace")
TRACEPARENT = re.compile(r"^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$", re.IGNORECASE)


@dataclass(frozen=True)
class TraceContext:
    trace_id: str
    span_id: str
    parent_span_id: str | None
    flags: str = "01"


_current: ContextVar[TraceContext | None] = ContextVar("stackr_trace", default=None)


def parse_traceparent(value: str | None) -> tuple[str, str, str] | None:
    match = TRACEPARENT.fullmatch((value or "").strip())
    if not match or set(match.group(1)) == {"0"} or set(match.group(2)) == {"0"}:
        return None
    return match.group(1).lower(), match.group(2).lower(), match.group(3).lower()


def bind_request_trace(value: str | None) -> tuple[TraceContext, Token]:
    parsed = parse_traceparent(value)
    context = TraceContext(
        trace_id=parsed[0] if parsed else secrets.token_hex(16),
        span_id=secrets.token_hex(8),
        parent_span_id=parsed[1] if parsed else None,
        flags=parsed[2] if parsed else "01",
    )
    return context, _current.set(context)


def reset_trace(token: Token) -> None:
    _current.reset(token)


def current_trace() -> TraceContext | None:
    return _current.get()


def traceparent(context: TraceContext | None = None) -> str | None:
    active = context or current_trace()
    return f"00-{active.trace_id}-{active.span_id}-{active.flags}" if active else None


@contextmanager
def trace_span(service: str, operation: str):
    parent = current_trace()
    span = TraceContext(
        trace_id=parent.trace_id if parent else secrets.token_hex(16),
        span_id=secrets.token_hex(8),
        parent_span_id=parent.span_id if parent else None,
        flags=parent.flags if parent else "01",
    )
    token = _current.set(span)
    started = time.perf_counter()
    status = "ok"
    try:
        yield span
    except Exception:
        status = "error"
        raise
    finally:
        logger.info(json.dumps({
            "event": "stackr_trace_span",
            "trace_id": span.trace_id,
            "span_id": span.span_id,
            "parent_span_id": span.parent_span_id,
            "service": service,
            "operation": operation,
            "status": status,
            "duration_ms": round((time.perf_counter() - started) * 1000),
        }))
        _current.reset(token)
