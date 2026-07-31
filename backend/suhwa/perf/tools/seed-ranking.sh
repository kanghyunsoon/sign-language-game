#!/usr/bin/env bash
# 랭킹 성능 측정용 시딩. 반드시 깨끗한 DB(docker compose down -v 직후)에서 실행한다 —
# 다른 부하 테스트로 쌓인 game_results 가 섞이면 "몇 명이 실제 차이를 만드는지"가 흐려진다.
#
#   USERS=100000 ROWS_PER_USER=2 ./tools/seed-ranking.sh
set -euo pipefail
cd "$(dirname "$0")/.."

USERS="${USERS:-100000}"
ROWS_PER_USER="${ROWS_PER_USER:-2}"
APP_URL="${APP_URL:-http://127.0.0.1:18080}"
SEED_PASSWORD="${SEED_PASSWORD:-perfPassw0rd!}"
DB_NAME="${DB_NAME:-suhwa}"
DB_PASSWORD="${DB_PASSWORD:-perf-local-root}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-perf-mysql}"

echo "[seed-ranking] 원본 계정 확보"
code=$(curl -s -o /tmp/rank-seed-signup.json -w '%{http_code}' -X POST "$APP_URL/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"perf-seed@perf.local\",\"password\":\"$SEED_PASSWORD\",\"nickname\":\"perf-seed\"}")
if [ "$code" != "201" ] && [ "$code" != "409" ] && [ "$code" != "400" ]; then
  echo "[seed-ranking] signup 실패: HTTP $code"; cat /tmp/rank-seed-signup.json; exit 1
fi

echo "[seed-ranking] SQL 적용: users=$USERS rows_per_user=$ROWS_PER_USER (시간이 걸릴 수 있다)"
START=$(date +%s)
sed -e "s/{{USERS}}/$USERS/g" -e "s/{{ROWS_PER_USER}}/$ROWS_PER_USER/g" tools/seed-ranking.sql \
  | docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$DB_PASSWORD" --default-character-set=utf8mb4 "$DB_NAME"
END=$(date +%s)
echo "[seed-ranking] SQL 적용 완료 ($((END-START))초)"
