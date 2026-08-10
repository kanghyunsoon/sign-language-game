// 방 WebSocket 반복 열고-닫기 소크. §11-2(동시 연결 4,866에서 OOM)는 "용량 한계"였지,
// 누수인지는 확인하지 않았다 — 누수는 연결 수와 무관하게 "닫았는데도 힙이 안 줄어드는가"로
// 판정해야 한다.
//
// 한도(4,866)의 절반도 안 되는 안전 수준(기본 2,000개)까지 열고, 잠시 유지했다가 전부 닫고
// 정리한 뒤 다시 여는 사이클을 반복한다. sample-metrics.mjs 가 같은 구간의 힙을 CSV로 남기고
// 있다는 전제로, 이 스크립트는 **사이클 경계 시각**을 JSON Lines 로 남긴다 — 사후에 "각 사이클
// 종료 직후 힙이 이전 사이클과 비슷한 지점으로 돌아왔는지"를 시각과 대조해서 판정한다.
//
// 판정 기준: 사이클마다 heap-at-close 가 우상향 추세면 누수 후보, 오르내림만 반복하면
// (GC 에 따라 흔들리는 것은 정상) 누수가 아니다.

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://backend:8080';
const TARGET_PER_CYCLE = Number(process.env.TARGET_PER_CYCLE || 2000);
const CYCLES = Number(process.env.CYCLES || 15);
const HOLD_MS = Number(process.env.HOLD_MS || 45000);
const SETTLE_MS = Number(process.env.SETTLE_MS || 20000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 100);
const TAG_RUN = process.env.TAG_RUN || 'adhoc';
const TOKENS_FILE = process.env.TOKENS_FILE || '/data/tokens.json';
const RESULTS_DIR = process.env.RESULTS_DIR || '/results';

const wsBase = BASE_URL.replace(/^http/, 'ws');
const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
const HOST = tokens[0];
const GUEST = tokens[1];

async function post(pathname, token, body) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((e) => ({ status: 0, _err: e }));
  if (res.status === 0) return { status: 0, body: null };
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function openSocket(roomId, ticket) {
  return new Promise((resolve) => {
    let settled = false;
    let ws;
    try {
      ws = new WebSocket(`${wsBase}/ws/game-rooms/${roomId}?ticket=${ticket}`);
    } catch (_) {
      resolve(null);
      return;
    }
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      if (!settled) { settled = true; resolve(ws); }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      if (!settled) { settled = true; resolve(null); }
    });
  });
}

async function createRoomPair() {
  const created = await post('/game-rooms', HOST.accessToken, { gameType: 'SIGN_DUEL' });
  if (created.status !== 201) return null;
  const joined = await post('/game-rooms/join', GUEST.accessToken, { roomCode: created.body.roomCode });
  if (joined.status !== 200) return null;
  return { roomId: created.body.id, hostTicket: created.body.realtimeTicket, guestTicket: joined.body.realtimeTicket };
}

async function cleanupRooms(roomIds) {
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
}

async function runCycle(cycleIndex) {
  const roomIds = [];
  const sockets = [];
  const openedAt0 = Date.now();

  let opened = 0;
  let createFailed = 0;
  let stalledRounds = 0;
  while (opened < TARGET_PER_CYCLE) {
    // Math.ceil 을 쓴다 — remaining 이 홀수(예: 이전 실패로 1개만 남음)면
    // '/2'가 정수가 아니게 되고, Array.from({length: 0.5})는 length가 0으로
    // 잘려 빈 배열이 된다. 그러면 이 반복에서 진행이 전혀 없는데 while 조건은
    // 그대로 참이라 무한 루프에 빠진다(await Promise.all([])이 즉시 끝나
    // I/O 대기도 없이 CPU만 계속 돈다). 최소 1쌍은 항상 시도하게 만든다.
    const remaining = TARGET_PER_CYCLE - opened;
    const batch = Math.max(1, Math.ceil(Math.min(BATCH_SIZE, remaining) / 2));
    const pairs = (await Promise.all(Array.from({ length: batch }, createRoomPair))).filter(Boolean);
    pairs.forEach((p) => roomIds.push(p.roomId));
    createFailed += batch - pairs.length;

    // 방어: 한 반복에서 성공이 0건이면 진행이 없다는 뜻이다. 몇 라운드
    // 연속으로 그러면(백엔드 문제든 스크립트 버그든) 조용히 영원히 도는 대신
    // 명확한 오류로 중단한다.
    if (pairs.length === 0) {
      stalledRounds += 1;
      if (stalledRounds >= 20) {
        throw new Error(`cycle ${cycleIndex}: 20회 연속 방 생성 실패로 진행이 없다 (opened=${opened}/${TARGET_PER_CYCLE})`);
      }
      // 실패가 연속될 때는 짧게 쉬어 무의미한 재시도로 CPU/네트워크를 태우지 않는다.
      await new Promise((r) => setTimeout(r, 200));
    } else {
      stalledRounds = 0;
    }

    const opens = [];
    for (const p of pairs) {
      opens.push(openSocket(p.roomId, p.hostTicket));
      opens.push(openSocket(p.roomId, p.guestTicket));
    }
    const results = await Promise.all(opens);
    for (const ws of results) {
      if (ws) { sockets.push(ws); opened += 1; }
    }

    // 진행 로그 — 버그든 백엔드 문제든 "멈춘 것처럼 보이는" 상태를 몇 분씩
    // 조용히 넘기지 않기 위해 반복마다 남긴다.
    console.log(`[soak]   cycle ${cycleIndex} 진행: ${opened}/${TARGET_PER_CYCLE} (누적 실패 ${createFailed})`);
  }

  const allOpenAt = Date.now();
  console.log(`[soak] cycle ${cycleIndex}: 연결 ${opened}개 (실패 방 생성 ${createFailed}) — ${allOpenAt - openedAt0}ms`);

  await new Promise((r) => setTimeout(r, HOLD_MS));
  const beforeCloseAt = Date.now();

  for (const ws of sockets) {
    try { ws.close(); } catch (_) { /* 이미 끊김 */ }
  }
  await cleanupRooms(roomIds);
  const afterCleanupAt = Date.now();

  console.log(`[soak] cycle ${cycleIndex}: 닫고 정리 완료 — ${afterCleanupAt - beforeCloseAt}ms`);

  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const settledAt = Date.now();

  return {
    cycle: cycleIndex,
    opened,
    createFailed,
    openedAtIso: new Date(allOpenAt).toISOString(),
    closedAtIso: new Date(beforeCloseAt).toISOString(),
    settledAtIso: new Date(settledAt).toISOString(),
  };
}

async function main() {
  console.log(`[soak] ${BASE_URL} 사이클당 ${TARGET_PER_CYCLE}개 × ${CYCLES}회, 유지 ${HOLD_MS}ms, 정착 대기 ${SETTLE_MS}ms`);
  const markers = [];
  for (let c = 1; c <= CYCLES; c++) {
    const marker = await runCycle(c);
    markers.push(marker);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `${TAG_RUN}-ws-soak-cycles.json`);
  fs.writeFileSync(outPath, JSON.stringify(markers, null, 2));
  console.log(`[soak] 완료. 사이클 경계 기록: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
