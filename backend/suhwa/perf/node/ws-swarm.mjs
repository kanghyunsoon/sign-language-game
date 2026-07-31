// 방 WebSocket 동시 연결 한계 측정. 시나리오 5(미구현이었음) 대신 이 도구로 확인한다.
//
// k6 대신 Node 로 짠 이유: 목적이 "부하를 만드는 것"이 아니라 "연결을 최대한 많이,
// 최대한 오래 열어두고 어디서 깨지는지 보는 것"이라 sse-swarm 과 같은 이유다(PLAN.md §6-4).
// Node 22 는 표준 라이브러리에 WebSocket 클라이언트가 내장돼 있어 의존성이 없다.
//
// 방식: 방을 하나씩 만들고(host) 바로 입장시켜(guest) 두 티켓을 받은 뒤, 그 방의
// host·guest 두 소켓을 모두 연다. 티켓은 1회용 + TTL 30초이므로 발급 직후 연결한다.
// SIGNAL·WEBRTC_CONNECTED 는 보내지 않는다 — 연결을 계속 열어두는 것이 목적이므로
// 의도적 종료 신호를 보내면 서버가 유예 타이머 없이 세션을 정리해버린다.
//
// 배치 단위로 늘려가며 열린 연결 수·실패(핸드셰이크 거부·조기 종료)·서버 쪽
// jvm.threads.live 를 함께 보고, 목표치에 도달하거나 실패율이 튀면 멈춘다.

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://backend:8080';
const TARGET = Number(process.env.TARGET || 2000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS || 500);
const TAG_RUN = process.env.TAG_RUN || 'adhoc';
const TOKENS_FILE = process.env.TOKENS_FILE || '/data/tokens.json';
const RESULTS_DIR = process.env.RESULTS_DIR || '/results';
// 실패율이 이 값을 넘는 배치가 STOP_AFTER_BAD_BATCHES 번 연속되면 중단한다 —
// 계속 밀어붙이면 서버가 아니라 우리 프로세스의 소켓/FD 한도에 먼저 걸릴 수 있다.
const BAD_BATCH_FAIL_RATE = Number(process.env.BAD_BATCH_FAIL_RATE || 0.2);
const STOP_AFTER_BAD_BATCHES = Number(process.env.STOP_AFTER_BAD_BATCHES || 3);

const wsBase = BASE_URL.replace(/^http/, 'ws');
const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
if (tokens.length < 2) {
  console.error('tokens.json 에 계정이 2개 미만이다.');
  process.exit(1);
}
// host/guest 는 소수 계정만 반복 사용한다 — 방 생성엔 계정 수 제약이 없고(같은 유저가
// 여러 방의 host 가 돼도 서버가 막지 않는다), 연결 수 자체를 재는 것이 목적이라
// 200개짜리 풀을 아낄 이유가 없다.
const HOST = tokens[0];
const GUEST = tokens[1];

async function post(path, token, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const sockets = []; // { ws, roomId, role, state: 'connecting'|'open'|'closed'|'errored' }
const roomIds = [];
const stats = { opened: 0, failed: 0, closedEarly: 0, roomsCreated: 0, createFailed: 0 };

function openSocket(roomId, ticket, role) {
  return new Promise((resolve) => {
    const entry = { roomId, role, state: 'connecting' };
    sockets.push(entry);
    let settled = false;
    const url = `${wsBase}/ws/game-rooms/${roomId}?ticket=${ticket}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      entry.state = 'errored';
      stats.failed += 1;
      resolve(false);
      return;
    }
    entry.ws = ws;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        entry.state = 'errored';
        stats.failed += 1;
        resolve(false);
      }
    }, 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        entry.state = 'open';
        stats.opened += 1;
        resolve(true);
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        entry.state = 'errored';
        stats.failed += 1;
        resolve(false);
      }
    });
    ws.addEventListener('close', () => {
      if (entry.state === 'open') {
        // 연결됐던 소켓이 나중에 끊긴 것 — 한도 도달 후의 정리로 볼 수 있다.
        stats.closedEarly += 1;
      }
      entry.state = 'closed';
    });
  });
}

async function createRoomPair() {
  const created = await post('/game-rooms', HOST.accessToken, { gameType: 'SIGN_DUEL' });
  if (created.status !== 201) {
    stats.createFailed += 1;
    return null;
  }
  const joined = await post('/game-rooms/join', GUEST.accessToken, { roomCode: created.body.roomCode });
  if (joined.status !== 200) {
    stats.createFailed += 1;
    return null;
  }
  stats.roomsCreated += 1;
  roomIds.push(created.body.id);
  return {
    roomId: created.body.id,
    hostTicket: created.body.realtimeTicket,
    guestTicket: joined.body.realtimeTicket,
  };
}

/** 만든 방을 REST 로 회수한다 — 정리 배치(5분/30분 보관)에 맡기면 그동안 다음
 * 측정의 배경 WAITING 방 수를 오염시킨다. guest 먼저 나가야 host 위임이 일어나지 않고
 * 바로 CLOSED 된다. */
async function cleanupRooms() {
  console.log(`[ws-swarm] 방 ${roomIds.length}개 정리 중`);
  const CONCURRENCY = 20;
  let i = 0;
  async function worker() {
    while (i < roomIds.length) {
      const roomId = roomIds[i++];
      await post(`/game-rooms/${roomId}/leave`, GUEST.accessToken).catch(() => {});
      await post(`/game-rooms/${roomId}/leave`, HOST.accessToken).catch(() => {});
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('[ws-swarm] 정리 완료');
}

function currentOpenCount() {
  return sockets.filter((s) => s.state === 'open').length;
}

async function main() {
  console.log(`[ws-swarm] ${BASE_URL} 목표 ${TARGET}개 연결, 배치 ${BATCH_SIZE}개씩`);
  let consecutiveBadBatches = 0;

  while (currentOpenCount() < TARGET) {
    const before = currentOpenCount();
    const batch = [];
    for (let i = 0; i < BATCH_SIZE / 2; i++) {
      batch.push(createRoomPair());
    }
    const pairs = (await Promise.all(batch)).filter(Boolean);

    const opens = [];
    for (const pair of pairs) {
      opens.push(openSocket(pair.roomId, pair.hostTicket, 'host'));
      opens.push(openSocket(pair.roomId, pair.guestTicket, 'guest'));
    }
    await Promise.all(opens);

    const after = currentOpenCount();
    const attempted = pairs.length * 2;
    const batchFailRate = attempted > 0 ? 1 - (after - before) / attempted : 1;

    console.log(
      `[ws-swarm] 열린 연결=${after}  이번 배치 시도=${attempted} 실패율=${(batchFailRate * 100).toFixed(1)}%  ` +
      `누적 실패=${stats.failed}  방 생성 실패=${stats.createFailed}`,
    );

    if (batchFailRate > BAD_BATCH_FAIL_RATE) {
      consecutiveBadBatches += 1;
      if (consecutiveBadBatches >= STOP_AFTER_BAD_BATCHES) {
        console.log(`[ws-swarm] 연속 ${STOP_AFTER_BAD_BATCHES}배치 실패율 초과 — 한계로 보고 중단`);
        break;
      }
    } else {
      consecutiveBadBatches = 0;
    }

    if (attempted === 0) {
      console.log('[ws-swarm] 방 생성 자체가 안 된다 — 중단');
      break;
    }

    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  const summary = {
    tagRun: TAG_RUN,
    target: TARGET,
    peakOpen: currentOpenCount(),
    totalOpened: stats.opened,
    totalFailed: stats.failed,
    closedEarlyAfterOpen: stats.closedEarly,
    roomsCreated: stats.roomsCreated,
    roomCreateFailed: stats.createFailed,
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `${TAG_RUN}-ws-swarm.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  for (const s of sockets) {
    try { s.ws?.close(); } catch (_) { /* 이미 끊김 */ }
  }
  await cleanupRooms();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
