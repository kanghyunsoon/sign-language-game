#!/bin/bash

set -euo pipefail

CERT_NAME="i15a405.p.ssafy.io"
SOURCE_DIR="${RENEWED_LINEAGE:-/etc/letsencrypt/live/${CERT_NAME}}"
TARGET_DIR="/opt/sudal/webrtc/certs"
COMPOSE_FILE="/opt/sudal/webrtc/docker-compose.yml"
ENV_FILE="/opt/sudal/.env"

# 다른 인증서가 갱신된 경우 실행하지 않는다.
if [[ "$(basename "$SOURCE_DIR")" != "$CERT_NAME" ]]; then
  exit 0
fi

install -d -m 700 -o 65534 -g 65534 "$TARGET_DIR"

install -m 644 -o 65534 -g 65534 \
  "$SOURCE_DIR/fullchain.pem" \
  "$TARGET_DIR/fullchain.pem.new"

install -m 600 -o 65534 -g 65534 \
  "$SOURCE_DIR/privkey.pem" \
  "$TARGET_DIR/privkey.pem.new"

mv -f "$TARGET_DIR/fullchain.pem.new" "$TARGET_DIR/fullchain.pem"
mv -f "$TARGET_DIR/privkey.pem.new" "$TARGET_DIR/privkey.pem"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  restart coturn