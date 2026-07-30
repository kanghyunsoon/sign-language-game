import { check, fail } from 'k6';
import * as api from './lib/api.js';
import { TOKENS } from './lib/tokens.js';

// 시나리오 0 — 하니스 자체 검증. 1 VU / 1 iteration.
// 여기서 실패하면 부하를 걸 이유가 없다. 모든 단언이 통과해야 다음 단계로 간다.
export const options = {
  vus: 1,
  iterations: 1,
  // 스모크는 임계값으로 판정하지 않는다. check 실패가 곧 실패다.
  thresholds: { checks: ['rate==1.0'] },
};

export default function () {
  const host = TOKENS[0];
  const guest = TOKENS[1];

  // --- 대조군 경로
  check(api.me(host.accessToken), { 'users/me 200': (r) => r.status === 200 });

  // --- 방 생성: 201 + roomCode + realtimeTicket (FR-001/002 — 티켓이 응답에 동봉된다)
  const created = api.createRoom(host.accessToken, 'SIGN_DUEL');
  if (!check(created, {
    'create 201': (r) => r.status === 201,
    'create roomCode': (r) => !!r.json('roomCode'),
    'create realtimeTicket': (r) => !!r.json('realtimeTicket'),
  })) {
    fail(`create 실패: ${created.status} ${created.body}`);
  }
  const roomId = created.json('id');
  const roomCode = created.json('roomCode');

  // --- 입장: participantCount 가 2 가 되고 게스트용 티켓이 새로 나온다
  const joined = api.joinRoom(guest.accessToken, roomCode);
  if (!check(joined, {
    'join 200': (r) => r.status === 200,
    'join participantCount 2': (r) => r.json('participantCount') === 2,
    'join realtimeTicket': (r) => !!r.json('realtimeTicket'),
  })) {
    fail(`join 실패: ${joined.status} ${joined.body}`);
  }

  // --- 준비: 양쪽 다 true 여야 start 가 통과한다
  api.setReady(host.accessToken, roomId, true);
  const ready2 = api.setReady(guest.accessToken, roomId, true);
  check(ready2, {
    'ready 200': (r) => r.status === 200,
    'both ready': (r) => r.json('hostReady') === true && r.json('guestReady') === true,
  });

  // --- 시작
  const startRes = api.startGame(host.accessToken, roomId);
  if (!check(startRes, {
    'start 200': (r) => r.status === 200,
    'start IN_PROGRESS': (r) => r.json('status') === 'IN_PROGRESS',
  })) {
    fail(`start 실패: ${startRes.status} ${startRes.body}`);
  }

  // --- 결과 보고: 201, 그리고 방은 CLOSED 가 아니라 WAITING 으로 복귀한다(FR-013)
  const result = api.reportResult(host.accessToken, roomId, host.userId);
  check(result, {
    'results 201': (r) => r.status === 201,
    'results winner': (r) => r.json('winnerUserId') === host.userId,
  });

  // 재대결 경로로 WAITING 복귀를 확인한다 — 이미 참가자인 join 은 인원을 늘리지 않고
  // 현재 상태를 그대로 돌려주므로(FR-020) status 를 읽는 데 쓸 수 있다.
  const rejoin = api.joinRoom(guest.accessToken, roomCode);
  check(rejoin, {
    'rematch: 방이 WAITING 으로 복귀': (r) => r.status === 200 && r.json('status') === 'WAITING',
    'rematch: 재입장은 인원을 늘리지 않는다': (r) => r.json('participantCount') === 2,
  });

  // --- 나가기: guest 먼저, 그다음 host(위임 없이 CLOSED)
  check(api.leaveRoom(guest.accessToken, roomId), { 'leave guest 204': (r) => r.status === 204 });
  check(api.leaveRoom(host.accessToken, roomId), { 'leave host 204': (r) => r.status === 204 });

  // --- 티켓이 1회용인지. 이 전제가 깨지면 시나리오 4·5 가 조용히 잘못된 값을 낸다.
  const ticketRes = api.issueSseTicket(host.accessToken);
  if (!check(ticketRes, {
    'sse-ticket 201': (r) => r.status === 201,
    'sse-ticket 본문': (r) => !!r.json('ticket'),
  })) {
    fail(`sse-ticket 실패: ${ticketRes.status} ${ticketRes.body}`);
  }
  const ticket = ticketRes.json('ticket');

  const first = api.subscribeOnce(ticket).status;
  const second = api.subscribeOnce(ticket).status;
  check(null, {
    // status 0 = 타임아웃, 즉 연결이 열린 채 유지됐다는 뜻이므로 성공으로 본다.
    'ticket 첫 사용은 거부되지 않는다': () => first === 200 || first === 0,
    'ticket 1회용: 두 번째 사용은 401': () => second === 401,
  });
}
