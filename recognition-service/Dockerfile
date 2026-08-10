FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN python -m venv /opt/venv
COPY requirements.txt .
RUN /opt/venv/bin/python -m pip install --requirement requirements.txt

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8080 \
    WEB_CONCURRENCY=1 \
    MALLOC_ARENA_MAX=2 \
    STACKR_RECOGNITION_CONCURRENCY_HINT=1 \
    STACKR_RECOGNITION_MODEL_DIRECTORY=/models

RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin stackr \
  && mkdir -p /app /models \
  && chown stackr:stackr /app \
  && chown root:root /models \
  && chmod 0555 /models

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=stackr:stackr app ./app

USER 10001:10001

EXPOSE 8080
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/health', timeout=2).read()" || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY:-1} --timeout-graceful-shutdown 30"]
