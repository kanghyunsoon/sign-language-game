// 임시 이분 탐색용. s3 처럼 램프를 섞지 않고 고정 도착률로만 돌려, 어느 스테이지에서
// 무너지는지가 아니라 "이 도착률 자체가 버티는가"를 바로 answer 한다. 대조군은 전체
// 구간을 덮는다. 병목 지점을 좁힌 뒤에는 지워도 되는 일회성 도구다.
import exec from 'k6/execution';
import { VUS_MAX } from './lib/config.js';
import { runRoomLifecycle } from './lib/lifecycle.js';
import { TOKENS, pickPair } from './lib/tokens.js';
import * as api from './lib/api.js';

const RATE = Number(__ENV.RATE || 100);
const DURATION = __ENV.DURATION || '45s';

export const options = {
  scenarios: {
    churn: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(100, VUS_MAX),
      maxVUs: VUS_MAX,
      exec: 'churn',
    },
    control: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 50,
      exec: 'control',
    },
  },
  thresholds: {
    'http_req_duration{name:room_create}': ['p(95)<600000'],
    'http_req_duration{name:users_me}': ['p(95)<600000'],
  },
};

export function churn() {
  const [host, guest] = pickPair(exec.scenario.iterationInTest);
  runRoomLifecycle(host, guest);
}

export function control() {
  api.me(TOKENS[exec.scenario.iterationInTest % TOKENS.length].accessToken);
}

export function handleSummary(data) {
  const p95 = (name) => {
    const m = data.metrics[`http_req_duration{name:${name}}`];
    return m ? Math.round(m.values['p(95)']) : '-';
  };
  const dropped = data.metrics.dropped_iterations ? data.metrics.dropped_iterations.values.count : 0;
  return {
    stdout: `\n[flat] rate=${RATE}/s  room_create p95=${p95('room_create')}ms  users_me p95=${p95('users_me')}ms  dropped=${dropped}\n`,
  };
}
