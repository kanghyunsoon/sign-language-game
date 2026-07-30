#!/usr/bin/env bash
# 측정용 데이터 시딩. 호스트에서 실행한다(bash + docker 필요).
#
#   USERS=200 WAITING_ROOMS=0 ./tools/seed.sh
#
# 1) API 로 계정 하나를 만든다 → 앱이 만든 진짜 BCrypt 해시가 DB 에 생긴다
# 2) 그 해시를 복사해 N명을 SQL 로 벌크 insert 한다 → 해시 생성 비용은 1회
set -euo pipefail

cd "$(dirname "$0")/.."

USERS="${USERS:-200}"
WAITING_ROOMS="${WAITING_ROOMS:-0}"
APP_URL="${APP_URL:-http://127.0.0.1:18080}"
SEED_PASSWORD="${SEED_PASSWORD:-perfPassw0rd!}"
DB_NAME="${DB_NAME:-suhwa}"
DB_PASSWORD="${DB_PASSWORD:-perf-local-root}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-perf-mysql}"

echo "[seed] 원본 계정 생성 (BCrypt 해시 확보)"
code=$(curl -s -o /tmp/seed-signup.json -w '%{http_code}' -X POST "$APP_URL/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"perf-seed@perf.local\",\"password\":\"$SEED_PASSWORD\",\"nickname\":\"perf-seed\"}")

if [ "$code" = "201" ]; then
  echo "[seed] 생성됨"
elif [ "$code" = "409" ] || [ "$code" = "400" ]; then
  # 이미 있으면 그대로 쓴다. 비밀번호가 다르면 로그인이 실패하므로 그때는 DB 를 비우고 다시 한다.
  echo "[seed] 이미 존재함 ($code) — 기존 해시를 재사용한다"
else
  echo "[seed] signup 실패: HTTP $code"; cat /tmp/seed-signup.json; exit 1
fi

echo "[seed] SQL 적용: users=$USERS waiting_rooms=$WAITING_ROOMS"
sed -e "s/{{USERS}}/$USERS/g" -e "s/{{WAITING_ROOMS}}/$WAITING_ROOMS/g" tools/seed.sql \
  | docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$DB_PASSWORD" --default-character-set=utf8mb4 "$DB_NAME"

echo "[seed] 완료"
