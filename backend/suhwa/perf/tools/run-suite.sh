#!/usr/bin/env bash
# 측정 1회분을 처음부터 끝까지 돌린다. 호스트에서 실행한다(bash + docker).
#
#   COMPOSE_DIR=/c/Users/SSAFY/Desktop/suhwa-perf/env TAG_RUN=baseline-01 ./tools/run-suite.sh
#
# 왜 스크립트인가: 손으로 돌리면 회차마다 도착률·구독자 수·시드 상태가 미묘하게 달라져
# 파일 대 파일 비교가 불가능해진다. 여기 적힌 순서가 곧 측정 프로토콜이다.
set -uo pipefail

cd "$(dirname "$0")/.."   # backend/suhwa/perf

# Git Bash(MSYS)는 컨테이너 내부 경로 인수(/scripts/...)를 호스트 경로로 변환해버린다.
# 리눅스에서는 아무 효과가 없다.
export MSYS_NO_PATHCONV=1

COMPOSE_DIR="${COMPOSE_DIR:?COMPOSE_DIR 을 지정할 것 (docker-compose.perf.yml 이 있는 로컬 디렉터리)}"
TAG_RUN="${TAG_RUN:-adhoc}"
USERS="${USERS:-200}"
APP_URL="${APP_URL:-http://127.0.0.1:18080}"

# s1 은 곡선을 얻어야 하므로 도착률을 훑는다. s3 은 executor 가 스스로 램프한다.
S1_RATES="${S1_RATES:-10 30 60}"
S1_DURATION="${S1_DURATION:-45s}"
S3_RATE="${S3_RATE:-20}"
S3_STAGE="${S3_STAGE:-45s}"
S4_RATE="${S4_RATE:-10}"
S4_DURATION="${S4_DURATION:-60s}"
SUBSCRIBER_GRID="${SUBSCRIBER_GRID:-0 50 200}"
SKIP_S4="${SKIP_S4:-0}"

dc() { (cd "$COMPOSE_DIR" && docker compose -f docker-compose.perf.yml --env-file .env.perf "$@"); }
k6run() { dc --profile load run --rm k6 run "$@"; }
say() { echo; echo "=== $* ==="; }

say "0. 앱 health"
curl -sf "$APP_URL/actuator/health" || { echo "앱이 응답하지 않는다"; exit 1; }
echo

say "1. 토큰 발급 — 스위트 안에서 매번 새로 받는다"
# 액세스 토큰 수명이 기본 1시간이다. 이미지 빌드나 앞 회차가 길어지면 스위트 도중에 만료돼
# 401 이 쏟아진다(실제로 한 번 그렇게 깨졌다). 발급을 측정 직전으로 옮겨 그 창을 없앤다.
if [ "${SKIP_MINT:-0}" != "1" ]; then
  USERS="$USERS" APP_URL="$APP_URL" node tools/mint-tokens.mjs || exit 1
fi

say "2. 스모크 — 실패하면 중단한다"
if ! TAG_RUN="$TAG_RUN" k6run /scripts/s0-smoke.js > "/tmp/${TAG_RUN}-s0.log" 2>&1; then
  echo "스모크 실패. 부하를 걸지 않는다."; tail -30 "/tmp/${TAG_RUN}-s0.log"; exit 1
fi
grep -E "checks_succeeded" "/tmp/${TAG_RUN}-s0.log" || true

say "3. 샘플러 기동 (서버 내부 지표 → CSV)"
TAG_RUN="$TAG_RUN" dc --profile load up -d sampler

say "4. s1 인증 처리량 — 도착률 훑기: $S1_RATES"
for r in $S1_RATES; do
  echo "--- s1 rate=$r"
  RATE="$r" DURATION="$S1_DURATION" TAG_RUN="$TAG_RUN" \
    k6run --summary-export="/results/${TAG_RUN}-s1-rate${r}.json" /scripts/s1-auth.js \
    2>&1 | grep -E "login|users_me|dropped_iterations|http_req_failed|✓|✗" | tail -12
done

say "5. s3 방 생명주기 churn (기준선, ramping)"
RATE="$S3_RATE" STAGE_DURATION="$S3_STAGE" TAG_RUN="$TAG_RUN" \
  k6run --summary-export="/results/${TAG_RUN}-s3.json" /scripts/s3-room-churn.js \
  2>&1 | tail -45

if [ "$SKIP_S4" != "1" ]; then
  say "6. s4 실시간 팬아웃 — 구독자 격자: $SUBSCRIBER_GRID"
  for subs in $SUBSCRIBER_GRID; do
    echo "--- s4 subscribers=$subs"
    if [ "$subs" -gt 0 ]; then
      SUBSCRIBERS="$subs" TAG_RUN="$TAG_RUN" dc --profile load up -d sse-swarm
      # 구독이 다 붙기를 기다린다. 붙기 전에 부하를 주면 축이 오염된다.
      sleep 20
      dc logs --tail 3 sse-swarm 2>&1 | tail -3
    fi
    SUBSCRIBERS="$subs" WAITING_ROOMS="${WAITING_ROOMS:-0}" RATE="$S4_RATE" DURATION="$S4_DURATION" TAG_RUN="$TAG_RUN" \
      k6run /scripts/s4-fanout.js 2>&1 | tail -14
    if [ "$subs" -gt 0 ]; then
      dc logs --tail 2 sse-swarm 2>&1 | tail -2
      dc stop sse-swarm >/dev/null 2>&1
      dc rm -f sse-swarm >/dev/null 2>&1
    fi
  done
fi

say "7. 샘플러 종료"
dc stop sampler >/dev/null 2>&1

say "8. 부하 후 정합성 점검"
bash tools/integrity-check.sh || echo "(정합성 위반 — 결과 문서에 기록할 것)"

say "9. 서버 지표 요약"
node tools/summarize-metrics.mjs "$COMPOSE_DIR/../results/${TAG_RUN}-server-metrics.csv" 2>/dev/null \
  || echo "(서버 지표 CSV를 읽지 못했다)"

say "완료 — 결과 파일"
ls -1 "$COMPOSE_DIR/../results/"
