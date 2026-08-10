#!/usr/bin/env bash
# 부하가 끝난 뒤 불변식이 유지됐는지 확인한다.
#
#   ./tools/integrity-check.sh
#
# db/queries/game_results_integrity.sql 의 쿼리 1~3 을 건수만 세는 형태로 옮긴 것이다.
# 단위 테스트(GameResultIntegrityTest)가 만들 수 없는 규모·동시성을 통과한 뒤에도
# 승자1/패자0 불변식과 참조 무결성이 지켜졌는지 보는 것이 목적이므로, 부하 시나리오 뒤에
# 한 번 돌리는 것으로 충분하다. 세 값이 모두 0 이어야 한다.
set -uo pipefail

MYSQL_CONTAINER="${MYSQL_CONTAINER:-perf-mysql}"
DB_NAME="${DB_NAME:-suhwa}"
DB_PASSWORD="${DB_PASSWORD:-perf-local-root}"

out=$(docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$DB_PASSWORD" -N "$DB_NAME" 2>/dev/null <<'SQL'
SELECT 'q1_orphan_or_deleted_user', COUNT(*) FROM game_results gr
  LEFT JOIN users u ON u.id = gr.user_id WHERE u.id IS NULL OR u.deleted_at IS NOT NULL;
SELECT 'q2_duel_score_out_of_range', COUNT(*) FROM game_results
  WHERE game_type IN ('SIGN_DUEL','TETRIS_DUEL') AND score NOT IN (0,1);
SELECT 'q3_negative_score', COUNT(*) FROM game_results WHERE score < 0;
SELECT 'game_results_total', COUNT(*) FROM game_results;
SELECT 'rooms_total', COUNT(*) FROM game_rooms;
SELECT 'rooms_waiting', COUNT(*) FROM game_rooms WHERE status = 'WAITING';
SELECT 'rooms_in_progress', COUNT(*) FROM game_rooms WHERE status = 'IN_PROGRESS';
SELECT 'rooms_closed', COUNT(*) FROM game_rooms WHERE status = 'CLOSED';
SQL
)

echo "$out"

violations=$(echo "$out" | awk '$1 ~ /^q[123]_/ { s += $2 } END { print s+0 }')
if [ "$violations" != "0" ]; then
  echo
  echo "정합성 위반 ${violations}건 — 부하 후 불변식이 깨졌다. 결과 문서에 반드시 기록할 것."
  exit 1
fi
echo
echo "정합성 OK (쿼리 1~3 모두 0건)"

# 방이 계속 남아 있으면 정리 경로(폐기·배치)를 의심한다. IN_PROGRESS 가 남아 있으면
# 결과 보고 없이 끝난 대전이 있다는 뜻이므로 시나리오 쪽 문제다.
