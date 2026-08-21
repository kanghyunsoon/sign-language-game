FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ai/game-server/requirements.txt /tmp/requirements.txt

RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

COPY ai/game-server /app/game-ai-dev-server
COPY ai/contracts /app/game-contracts

RUN mkdir -p /app/models \
    && groupadd --gid 10001 ai \
    && useradd --uid 10001 --gid ai --create-home ai \
    && chown -R ai:ai /app

USER ai:ai

WORKDIR /app/game-ai-dev-server

ENV HANDPRACTICE_AI_HOST=0.0.0.0 \
    HANDPRACTICE_AI_PORT=8765 \
    HANDPRACTICE_AI_MODEL=baseline

EXPOSE 8765

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD ["python", "-c", "import os,socket; socket.create_connection(('127.0.0.1', int(os.getenv('AI_PORT', '8765'))), 3).close()"]

CMD ["python", "-m", "app.main"]