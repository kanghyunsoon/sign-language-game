import { Counter, Rate, Trend } from 'k6/metrics';

// 기대되는 4xx. 시나리오 3에서 @Version 낙관적 락 때문에 CONCURRENT_UPDATE_CONFLICT 가
// 정상적으로 발생하고, 계정 풀이 겹치면 ROOM_FULL·ROOM_NOT_WAITING 도 나온다.
// http_req_failed 에 섞이면 지표가 오염되므로 responseCallback 으로 빼고 여기서 따로 센다.
// 충돌률 자체가 지표이므로 코드별로 구분해 센다.
export const expected4xx = new Counter('expected_4xx');

// 한 iteration 이 create→…→leave 를 끝까지 통과한 비율.
// 이 값이 무너지면 p95 숫자를 믿을 수 없다 — 미완료 방이 WAITING 으로 쌓여
// 팬아웃 비용 축(배경 WAITING 방 수)이 실행 중에 제멋대로 커지기 때문이다.
export const lifecycleOk = new Rate('lifecycle_ok');

// 개별 API 가 아니라 흐름 전체의 체감 시간.
export const lifecycleDuration = new Trend('room_lifecycle_duration', true);

// 시나리오 5 용. 내가 보낸 SIGNAL 이 상대 소켓에 도착하기까지.
export const wsSignalRtt = new Trend('ws_signal_rtt', true);

/** 응답이 기대된 4xx 면 카운트하고 true 를 돌려준다. */
export function countExpected(res, step) {
  if (res.status >= 400 && res.status < 500) {
    let code = 'UNKNOWN';
    try {
      code = res.json('code') || 'UNKNOWN';
    } catch (_) {
      // 본문이 JSON 이 아닌 경우(프록시 오류 등)는 UNKNOWN 으로 남긴다.
    }
    expected4xx.add(1, { step, code, status: String(res.status) });
    return true;
  }
  return false;
}
