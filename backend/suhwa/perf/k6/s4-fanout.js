import exec from 'k6/execution';
import * as api from './lib/api.js';
import { DURATION, RATE, SLO, VUS_MAX } from './lib/config.js';
import { runRoomLifecycle } from './lib/lifecycle.js';
import { TOKENS, pickPair } from './lib/tokens.js';

// 시나리오 4 — 실시간 팬아웃. 이번 측정의 핵심.
//
// s3 와 부하 자체는 동일하고 **배경 조건만 다르다**: sse-swarm 이 구독자 N명을 유지하고 있고,
// 시드가 배경 WAITING 방 W개를 깔아둔 상태다. SSE 를 독립 시나리오로 만들면 구독자 0명이 되어
// 🔴3 이 아예 드러나지 않는다 — 구독은 부하가 아니라 배경 조건이다.
//
// 왜 두 축인가:
//   LobbyBroadcastService.broadcastUpdate() 는 WAITING 전량을 한 번 조회한 뒤
//   emitter 마다 send(snapshot) 을 호출하고, SseEmitter.send 는 emitter 별로 데이터를
//   **다시 직렬화한다.** 따라서 방 API 한 번의 팬아웃 비용은
//        O(구독자 수 × WAITING 방 수)
//   이고, 구독자만 늘리면 실제 규모를 놓친다.
//
// 도착률은 s3 에서 p95 가 목표 안에 들던 값으로 **고정**한다. 여기서 바꾸는 변수는
// 구독자 수(0/50/200/500)와 배경 WAITING 방 수(0/20/100)뿐이다.

export const options = {
  scenarios: {
    churn: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(50, VUS_MAX),
      maxVUs: VUS_MAX,
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
  // 이 시나리오는 합격/불합격이 아니라 **곡선**을 얻는 것이 목적이다. 구독자 500명에서
  // p95 가 무너지는 것은 발견이지 실패가 아니므로 실질적인 상한을 걸지 않는다.
  //
  // 그런데도 임계값을 선언하는 이유: k6 는 **임계값이 참조한 태그에 대해서만** 하위 메트릭
  // (http_req_duration{name:room_create})을 만든다. thresholds 를 비워두면 요약에 태그별
  // p95 가 아예 존재하지 않아 격자표를 채울 수 없다. 그래서 통과가 보장된 값으로 선언만 한다.
  thresholds: {
    'http_req_duration{name:room_create}': ['p(95)<600000'],
    'http_req_duration{name:room_join}': ['p(95)<600000'],
    'http_req_duration{name:room_ready}': ['p(95)<600000'],
    'http_req_duration{name:room_start}': ['p(95)<600000'],
    'http_req_duration{name:room_results}': ['p(95)<600000'],
    'http_req_duration{name:room_leave}': ['p(95)<600000'],
    'http_req_duration{name:users_me}': ['p(95)<600000'],
  },
  // 태그를 붙여 결과 파일에서 격자 좌표를 잃지 않게 한다.
  tags: {
    subscribers: __ENV.SUBSCRIBERS || 'unknown',
    waiting_rooms: __ENV.WAITING_ROOMS || 'unknown',
    rate: String(RATE),
  },
};

export function churn() {
  const [host, guest] = pickPair(exec.scenario.iterationInTest);
  runRoomLifecycle(host, guest);
}

export function control() {
  // 방 API p95 가 무너질 때 이것도 무너지면 원인이 전역(CPU 포화·스레드 고갈)이고,
  // 이것만 멀쩡하면 원인이 팬아웃 경로에 국지적이다. 병목을 좁히는 데 이 한 줄이 결정적이다.
  api.me(TOKENS[exec.scenario.iterationInTest % TOKENS.length].accessToken);
}

export function handleSummary(data) {
  const key = `${__ENV.TAG_RUN || 'adhoc'}-sub${__ENV.SUBSCRIBERS || 'x'}-wait${__ENV.WAITING_ROOMS || 'x'}`;
  const out = {};
  out[`/results/${key}.json`] = JSON.stringify(data, null, 2);
  out.stdout = summarize(data);
  return out;
}

function summarize(data) {
  const p95 = (name) => {
    const m = data.metrics[`http_req_duration{name:${name}}`];
    return m ? Math.round(m.values['p(95)']) : '-';
  };
  const rows = ['room_create', 'room_join', 'room_start', 'room_results', 'room_leave', 'users_me']
    .map((n) => `  ${n.padEnd(14)} p95=${p95(n)}ms`)
    .join('\n');
  return [
    '',
    `[s4] subscribers=${__ENV.SUBSCRIBERS} waiting_rooms=${__ENV.WAITING_ROOMS} rate=${RATE}/s`,
    rows,
    `  lifecycle_ok   ${data.metrics.lifecycle_ok ? (data.metrics.lifecycle_ok.values.rate * 100).toFixed(1) + '%' : '-'}`,
    '',
  ].join('\n');
}
