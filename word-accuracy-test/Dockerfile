FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/word-accuracy-test

COPY word-accuracy-test/server/requirements.txt /tmp/requirements.txt

RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

COPY word-accuracy-test/inference ./inference
COPY word-accuracy-test/models ./models
COPY word-accuracy-test/server ./server

RUN groupadd --gid 10004 word-v7-ai \
    && useradd --uid 10004 --gid word-v7-ai --create-home word-v7-ai \
    && chown -R word-v7-ai:word-v7-ai /app/word-accuracy-test

USER word-v7-ai:word-v7-ai

ENV HANDPRACTICE_WORDV7_HOST=0.0.0.0 \
    HANDPRACTICE_WORDV7_PORT=8768 \
    HANDPRACTICE_WORDV7_PATH=/word-v7

EXPOSE 8768

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
    CMD ["python", "-c", "from websockets.sync.client import connect; ws=connect('ws://127.0.0.1:8768/word-v7', open_timeout=3); ws.close()"]

CMD ["python", "-m", "server.main"]
