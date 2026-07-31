import exec from 'k6/execution';
import { RATE, SLO, VUS_MAX } from './lib/config.js';
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
const STAGES = 4;

// 대조군은 램프 **전 구간**을 덮어야 한다. 처음에는 DURATION(기본 2m)을 그대로 썼는데
// 램프 총 길이(4단계)보다 짧아 최상단 구간에서 대조군이 이미 멈춰 있었고, 그 결과
// "방 API 만 느려졌고 대조군은 멀쩡하다 → 팬아웃 국지적"이라는 잘못된 판정이 나올 수 있었다.
// 램프 길이에서 직접 계산한다.
function stageSeconds(v) {
  const m = /^(\d+)(s|m)$/.exec(v.trim());
  if (!m) throw new Error(`STAGE_DURATION 형식이 잘못됐다: ${v} (예: 45s, 1m)`);
  return Number(m[1]) * (m[2] === 'm' ? 60 : 1);
}
const CONTROL_DURATION = `${stageSeconds(STAGE) * STAGES}s`;

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
      duration: CONTROL_DURATION,
      preAllocatedVUs: 5,
      // 포화 구간에서 대조군 요청도 대기하게 되므로 VU 여유를 넉넉히 준다.
      // 부족하면 대조군 자체가 dropped 되어 관측이 끊긴다.
      maxVUs: 50,
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
