import exec from 'k6/execution';
import * as api from './lib/api.js';
import { DURATION, RATE, SLO, VUS_MAX } from './lib/config.js';
import { countExpected } from './lib/metrics.js';
import { TOKENS, pickOne } from './lib/tokens.js';

// 시나리오 1 — BCrypt CPU 상한 (-612).
//
// open model(constant-arrival-rate)을 쓴다. ramping-vus 는 서버가 느려지면 요청 발생도 같이
// 느려져 포화 지점을 가린다. dropped_iterations 가 0 을 벗어나면 k6 가 목표 도착률을 못 만들고
// 있다는 신호이므로 반드시 함께 본다.
//
// 시드된 계정은 전원 비밀번호가 같다(tools/seed.sql — 앱이 만든 해시 1개를 복사했다).
const PASSWORD = __ENV.SEED_PASSWORD || 'perfPassw0rd!';

export const options = {
  scenarios: {
    login: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(50, VUS_MAX),
      maxVUs: VUS_MAX,
      exec: 'loginFlow',
    },
    // 대조군. BCrypt 로 CPU 가 포화되면 이것도 같이 무너진다 —
    // 그게 확인되면 원인이 전역이라는 증거다.
    control: {
      executor: 'constant-arrival-rate',
      rate: Math.max(1, Math.round(RATE / 5)),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'controlFlow',
    },
  },
  thresholds: {
    'http_req_duration{name:login}': [`p(95)<${SLO.loginP95}`],
    'http_req_duration{name:users_me}': [`p(95)<${SLO.controlP95}`],
    // 로그인 실패는 계정 시딩이 잘못됐다는 뜻이다. 관용 없이 0 으로 둔다.
    'expected_4xx{step:login}': ['count==0'],
    http_req_failed: ['rate==0'],
  },
};

export function loginFlow() {
  const user = pickOne(exec.scenario.iterationInTest);
  const res = api.login(user.email, PASSWORD);
  countExpected(res, 'login');
}

export function controlFlow() {
  const user = TOKENS[exec.scenario.iterationInTest % TOKENS.length];
  api.me(user.accessToken);
}
