import http from 'k6/http';
import { BASE_URL } from './config.js';

// 엔드포인트 하나당 함수 하나. 세 가지를 강제한다.
//  1) tags.name — k6 는 URL 별로 메트릭을 쪼개므로 /game-rooms/{id}/ready 처럼 id 가 박힌
//     경로는 태그로 묶어야 한다. 이 태그가 임계값과 결과표의 행 이름이 된다.
//  2) responseCallback — 기대되는 4xx 를 http_req_failed 에서 뺀다.
//  3) 본문 파싱은 호출부에서. create/join 의 realtimeTicket 을 시나리오 5 가 쓴다.
//
// 경로는 앱 직접 접속 기준(/auth/login)으로 쓴다. nginx 경유 시에는 X-Forwarded-Prefix: /api
// 때문에 /api/auth/login 이 되므로, BASE_URL 에 prefix 까지 포함시켜 스크립트는 손대지 않는다.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const auth = (token) => ({ ...JSON_HEADERS, Authorization: `Bearer ${token}` });

const ok = (...statuses) => http.expectedStatuses(...statuses);

// 방 API 는 낙관적 락 충돌(409)과 상태 경합(400/404/409)이 정상 발생한다.
const ROOM_OK = ok(200, 201, 204, 400, 404, 409);

function post(path, body, params) {
  return http.post(`${BASE_URL}${path}`, body === null ? null : JSON.stringify(body), params);
}

export function login(email, password) {
  return post('/auth/login', { email, password }, {
    headers: JSON_HEADERS,
    tags: { name: 'login' },
    responseCallback: ok(200, 401),
  });
}

export function refresh(refreshToken) {
  return post('/auth/refresh', { refreshToken }, {
    headers: JSON_HEADERS,
    tags: { name: 'refresh' },
    // 시나리오 8은 동일 토큰 동시 요청으로 회전 경쟁을 재현한다 — 4xx 가 곧 성공이다.
    responseCallback: ok(200, 400, 401),
  });
}

/** 실시간 티켓. 1회용 + TTL 30초이므로 반드시 연결 직전에 발급한다. */
export function issueSseTicket(token) {
  return post('/auth/sse-ticket', null, {
    headers: auth(token),
    tags: { name: 'sse_ticket' },
    responseCallback: ok(201, 401),
  });
}

export function me(token) {
  // 대조군. 거의 비용이 없는 조회라, 방 API p95 가 무너질 때 이것도 같이 무너지면
  // 원인이 전역(CPU 포화·스레드 고갈)이고 이것만 멀쩡하면 팬아웃 경로에 국지적이다.
  return http.get(`${BASE_URL}/users/me`, {
    headers: auth(token),
    tags: { name: 'users_me' },
    responseCallback: ok(200),
  });
}

export function listSigns(token, category) {
  return http.get(`${BASE_URL}/signs?category=${category}`, {
    headers: auth(token),
    tags: { name: 'signs' },
    responseCallback: ok(200),
  });
}

export function rankings(token, gameType) {
  return http.get(`${BASE_URL}/rankings?gameType=${gameType}`, {
    headers: auth(token),
    tags: { name: 'rankings' },
    responseCallback: ok(200),
  });
}

export function createRoom(token, gameType = 'SIGN_DUEL') {
  return post('/game-rooms', { gameType }, {
    headers: auth(token),
    tags: { name: 'room_create' },
    responseCallback: ROOM_OK,
  });
}

export function joinRoom(token, roomCode) {
  return post('/game-rooms/join', { roomCode }, {
    headers: auth(token),
    tags: { name: 'room_join' },
    responseCallback: ROOM_OK,
  });
}

export function setReady(token, roomId, isReady) {
  return post(`/game-rooms/${roomId}/ready`, { isReady }, {
    headers: auth(token),
    tags: { name: 'room_ready' },
    responseCallback: ROOM_OK,
  });
}

export function startGame(token, roomId) {
  return post(`/game-rooms/${roomId}/start`, null, {
    headers: auth(token),
    tags: { name: 'room_start' },
    responseCallback: ROOM_OK,
  });
}

/** winnerUserId 를 null 로 보내면 무승부이며 game_results 에 기록되지 않는다(FR-033). */
export function reportResult(token, roomId, winnerUserId) {
  return post(`/game-rooms/${roomId}/results`, { winnerUserId }, {
    headers: auth(token),
    tags: { name: 'room_results' },
    responseCallback: ROOM_OK,
  });
}

export function leaveRoom(token, roomId) {
  return post(`/game-rooms/${roomId}/leave`, null, {
    headers: auth(token),
    tags: { name: 'room_leave' },
    responseCallback: ROOM_OK,
  });
}

/**
 * 로비 SSE 에 한 번 붙어 상태 코드만 확인한다(스모크 전용).
 *
 * 이 엔드포인트는 NO_TIMEOUT 스트림이라 k6 의 http.get 은 응답이 끝나기를 기다린다.
 * 짧은 타임아웃으로 끊고, 타임아웃(status 0)은 "연결이 열린 채 유지됐다"로 해석한다.
 * 실제 이벤트 수신 검증은 sse-swarm 이 한다.
 */
export function subscribeOnce(ticket, timeout = '2s') {
  return http.get(`${BASE_URL}/game-rooms/subscribe?ticket=${ticket}`, {
    timeout,
    tags: { name: 'sse_subscribe' },
    responseCallback: ok(200, 401),
  });
}

export function wsUrl(roomId, ticket) {
  const base = BASE_URL.replace(/^http/, 'ws');
  return `${base}/ws/game-rooms/${roomId}?ticket=${ticket}`;
}
