#!/usr/bin/env bash
set -Eeuo pipefail

MYSQL_CONTAINER="${MYSQL_CONTAINER:-sudal-mysql}"
BACKUP_DIR="${BACKUP_DIR:-/opt/sudal/backups/mysql}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
BACKUP_FILE="${BACKUP_DIR}/suhwa-${TIMESTAMP}.sql.gz"
TEMP_FILE="${BACKUP_FILE}.tmp"

umask 077
if ! docker inspect \
  --format '{{.State.Running}}' \
  "${MYSQL_CONTAINER}" 2>/dev/null |
  grep -qx 'true'; then
  echo "ERROR: ${MYSQL_CONTAINER} 컨테이너가 실행 중이 아닙니다." >&2
  exit 1
fi

install -d -m 700 "${BACKUP_DIR}"

cleanup() {
  rm -f "${TEMP_FILE}"
}
trap cleanup EXIT

echo "MySQL 백업을 시작합니다: ${BACKUP_FILE}"

if ! docker exec "${MYSQL_CONTAINER}" sh -c '
  MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --no-tablespaces \
    --set-gtid-purged=OFF \
    -u"$MYSQL_USER" \
    "$MYSQL_DATABASE"
' | gzip -9 > "${TEMP_FILE}"; then
  echo "ERROR: MySQL 백업 생성에 실패했습니다." >&2
  exit 1
fi

gzip -t "${TEMP_FILE}"
mv "${TEMP_FILE}" "${BACKUP_FILE}"

sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

find "${BACKUP_DIR}" \
  -type f \
  \( -name 'suhwa-*.sql.gz' -o -name 'suhwa-*.sql.gz.sha256' \) \
  -mtime "+${RETENTION_DAYS}" \
  -delete

trap - EXIT

echo "MySQL 백업이 완료되었습니다."
echo "백업 파일: ${BACKUP_FILE}"