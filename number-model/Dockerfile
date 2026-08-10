FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/number-model

COPY number-model/requirements.txt /tmp/requirements.txt

RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

COPY number-model/numbermodel ./numbermodel
COPY number-model/server ./server
COPY number-model/contracts ./contracts
COPY number-model/models ./models

RUN groupadd --gid 10002 number-ai \
    && useradd --uid 10002 --gid number-ai --create-home number-ai \
    && chown -R number-ai:number-ai /app/number-model

USER number-ai:number-ai

ENV HANDPRACTICE_NUMBER_HOST=0.0.0.0 \
    HANDPRACTICE_NUMBER_PORT=8766 \
    HANDPRACTICE_NUMBER_PATH=/number \
    HANDPRACTICE_NUMBER_MODEL_DIR=/app/number-model/models/number-10-v1

EXPOSE 8766

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD ["python", "-c", "from websockets.sync.client import connect; ws=connect('ws://127.0.0.1:8766/number', open_timeout=3); ws.close()"]
CMD ["python", "-m", "server.main"]