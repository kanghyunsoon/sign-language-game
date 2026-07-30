// 실행 노브. 전부 환경변수로 받고, 기본값은 로컬 4코어에서 서버를 죽이지 않는 낮은 값이다.
// 램프는 의도적으로 올린다 — 첫 실행에서 포화시키면 하니스 문제와 서버 문제를 구분할 수 없다.

const num = (name, fallback) => {
  const raw = __ENV[name];
  return raw === undefined || raw === '' ? fallback : Number(raw);
};

export const BASE_URL = __ENV.BASE_URL || 'http://backend:8080';
export const TAG_RUN = __ENV.TAG_RUN || 'adhoc';

export const RATE = num('RATE', 10);          // 초당 도착 수
export const DURATION = __ENV.DURATION || '2m';
export const VUS_MAX = num('VUS_MAX', 200);

// 시나리오 3·4에서 한 iteration 이 두 계정을 쓴다. 풀이 이보다 작으면
// 같은 계정이 여러 방의 host 가 되므로(서버가 막지 않는다) 넉넉히 잡는다.
export const TOKENS_PATH = __ENV.TOKENS_PATH || './data/tokens.json';

// 목표 SLO. 아직 확정값이 아니다(action-plan Phase 0 #4). 기준선을 보고 조정한다.
export const SLO = {
  roomApiP95: num('SLO_ROOM_P95', 500),
  controlP95: num('SLO_CONTROL_P95', 200),
  loginP95: num('SLO_LOGIN_P95', 800),
};
