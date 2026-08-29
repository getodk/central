# Central Studio: questionnaire designer and Stata/SPSS export.
# Runs alongside central-backend and talks to it over its public API, so it does
# not need to be rebuilt when Central is upgraded.

FROM python:3.11-slim

LABEL org.opencontainers.image.source="https://github.com/getodk/central"

WORKDIR /usr/odk-studio

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so application edits do not invalidate the wheel layer.
COPY files/studio/app/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY files/studio/app/studio ./studio

# The data volume is created with these ownerships when it is first populated.
RUN useradd --system --uid 1001 --create-home --home-dir /var/lib/odk/studio studio \
    && chown -R studio:studio /var/lib/odk/studio
USER studio

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    STUDIO_DATA_DIR=/var/lib/odk/studio \
    STUDIO_WORKERS=2

EXPOSE 8686

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8686/studio/api/health || exit 1

CMD ["sh", "-c", "exec uvicorn studio.main:app --host 0.0.0.0 --port 8686 --workers ${STUDIO_WORKERS}"]
