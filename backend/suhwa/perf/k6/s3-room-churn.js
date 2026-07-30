import exec from 'k6/execution';
import { DURATION, RATE, SLO, VUS_MAX } from './lib/config.js';
import { runRoomLifecycle } from './lib/lifecycle.js';
import { TOKENS, pickPair } from './lib/tokens.js';
import * as api from './lib/api.js';

// 시나리오 3 — 방 생명주기 churn. 핵심 쓰기 경로 + 낙관적 락 충돌률.
//
// 이 시나리오 단독 수치는 방 API 비용의 **하한**이다:
//   - SSE 구독자가 0명이므로 broadcastUpdate() 가 빈 루프다
//   - WS 세션이 0개이므로 GAME_STARTED·PEER_LEFT 팬아웃이 0이다
// 진짜 비용은 s4 에서 나온다. 여기서 얻는 것은 "팬아웃을 제외한 순수 DB·트랜잭션 비용"이다.
//
// ramping-arrival-rate 로 도착률을 단계적으로 올려 무너지는 지점을 찾는다.
// 각 단계 길이는 JIT 워밍업과 커넥션 풀 정착을 감안해 최소 1분 이상으로 둔다.

const STAGE = __ENV.STAGE_DURATION || '1m';

export const options = {
  scenarios: {
    churn: {
      executor: 'ramping-arrival-rate',
      startRate: Math.max(1, Math.round(RATE / 4)),
      timeUnit: '1s',
      preAllocatedVUs: Math.min(50, VUS_MAX),
      maxVUs: VUS_MAX,
      stages: [
        { target: Math.max(1, Math.round(RATE / 4)), duration: STAGE },
        { target: Math.round(RATE / 2), duration: STAGE },
        { target: RATE, duration: STAGE },
        { target: RATE * 2, duration: STAGE },
      ],
      exec: 'churn',
    },
    control: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'control',
    },
  },
  thresholds: {
    // 방 API 5개를 개별로 본다 — 어느 단계가 먼저 무너지는지가 정보다.
    'http_req_duration{name:room_create}': [`p(95)<${SLO.roomApiP95}`],
    'http_req_duration{name:room_join}': [`p(95)<${SLO.roomApiP95}`],
    'http_req_duration{name:room_ready}': [`p(95)<${SLO.roomApiP95}`],
    'http_req_duration{name:room_start}': [`p(95)<${SLO.roomApiP95}`],
    'http_req_duration{name:room_results}': [`p(95)<${SLO.roomApiP95}`],
    'http_req_duration{name:room_leave}': [`p(95)<${SLO.roomApiP95}`],
    'http_req_duration{name:users_me}': [`p(95)<${SLO.controlP95}`],
    // 기대되는 4xx 는 http_req_failed 에서 제외했으므로 이쪽은 0 이어야 한다.
    http_req_failed: ['rate==0'],
    // 흐름이 절반도 완주하지 못하면 p95 숫자를 믿을 수 없다. 경고선으로 둔다.
    lifecycle_ok: ['rate>0.95'],
  },
};

export function churn() {
  const [host, guest] = pickPair(exec.scenario.iterationInTest);
  runRoomLifecycle(host, guest);
}

export function control() {
  api.me(TOKENS[exec.scenario.iterationInTest % TOKENS.length].accessToken);
}
