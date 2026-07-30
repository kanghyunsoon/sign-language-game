// 로비 SSE 구독자 팜 + 전달 지연 prober.
//
// 왜 k6 가 아닌가: k6 는 SSE 를 기본 지원하지 않는다(xk6-sse 커스텀 빌드가 필요). 그런데 구독자는
// "부하를 만드는 쪽"이 아니라 "존재해야 하는 배경"이므로 k6 의 스케줄링이 필요 없다.
//
// 왜 fetch 가 아닌 node:http 인가: 수백 개의 동시 스트리밍 응답을 유지해야 하는데,
// undici(전역 fetch)의 커넥션 풀링 동작에 의존하고 싶지 않다. node:http Agent 로 소켓을
// 직접 통제한다.
//
// prober 가 이 설계의 핵심이다. 팬아웃 지연을 재려면 "방이 만들어진 시각"과 "구독자가 그 방을
// 본 시각"이 필요한데, k6 와 이 프로세스는 별개라 상관을 맞추기 어렵다. 그래서 이 프로세스가
// 직접 방을 하나 만들고 자기 구독 스트림에 그 roomCode 가 나타나기까지를 잰다 —
// 같은 프로세스·같은 시계이므로 정확하다. 잰 뒤 곧바로 leave 해 적재량을 오염시키지 않는다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://backend:8080';
const SUBSCRIBERS = Number(process.env.SUBSCRIBERS || 50);
const PROBE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS || 5000);
const TAG_RUN = process.env.TAG_RUN || 'adhoc';
const TOKENS_FILE = process.env.TOKENS_FILE || '/data/tokens.json';
const RESULTS_DIR = process.env.RESULTS_DIR || '/results';

const base = new URL(BASE_URL);
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: Infinity });

const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
if (tokens.length < 2) {
  console.error('tokens.json 에 계정이 2개 미만이다. tools/mint-tokens.mjs 를 먼저 실행할 것.');
  process.exit(1);
}

const stats = {
  connected: 0,
  failed: 0,
  events: { snapshot: 0, update: 0, heartbeat: 0, other: 0 },
  probeLagMs: [],
  probeMisses: 0,
};

// --- HTTP 헬퍼 -------------------------------------------------------------

function request(method, pathname, { token, body, stream } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        agent,
        host: base.hostname,
        port: base.port || 80,
        method,
        path: base.pathname.replace(/\/$/, '') + pathname,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(stream ? { Accept: 'text/event-stream' } : {}),
        },
      },
      (res) => {
        if (stream) {
          resolve(res);
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 티켓은 1회용 + TTL 30초다. 발급 직후 연결해야 한다. */
async function issueTicket(token) {
  const res = await request('POST', '/auth/sse-ticket', { token });
  if (res.status !== 201) throw new Error(`sse-ticket ${res.status}: ${res.body}`);
  return JSON.parse(res.body).ticket;
}

// --- 구독자 -----------------------------------------------------------------

const subscribers = [];

/**
 * SSE 스트림 하나를 연다. onEvent 는 (eventName, dataString) 으로 호출된다.
 * SSE 프레임 파싱은 빈 줄 구분 + `event:`/`data:` 필드만 다룬다 — 앱이 그 두 필드만 쓴다.
 */
async function openSubscriber(token, onEvent) {
  const ticket = await issueTicket(token);
  const res = await request('GET', `/game-rooms/subscribe?ticket=${ticket}`, { stream: true });
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`subscribe ${res.statusCode}`);
  }
  res.setEncoding('utf8');
  let buf = '';
  res.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let name = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      const key = ['snapshot', 'update', 'heartbeat'].includes(name) ? name : 'other';
      stats.events[key] += 1;
      if (onEvent) onEvent(name, dataLines.join('\n'));
    }
  });
  res.on('end', () => { stats.connected -= 1; });
  res.on('error', () => { stats.connected -= 1; });
  stats.connected += 1;
  return res;
}

// --- prober ----------------------------------------------------------------

let pendingProbe = null; // { roomCode, startedAt, resolve }

// 최근 update 이벤트를 짧게 보관한다.
//
// 왜 필요한가: 로비 브로드캐스트는 트랜잭션 커밋 직후(afterCommit)에 실행되므로, SSE 이벤트가
// create 의 HTTP 응답보다 **먼저** 도착할 수 있다. 응답을 받은 뒤에야 대기 등록을 하면 이미
// 지나간 이벤트를 놓쳐 전달 지연이 전부 miss 로 집계된다(실제로 그렇게 나왔다).
// 그래서 도착한 이벤트를 먼저 쌓아두고, 응답을 받은 뒤 과거분부터 조회한다.
const recentUpdates = [];

function onProbeEvent(name, data) {
  if (name !== 'update') return;
  const now = Date.now();
  recentUpdates.push({ t: now, data });
  while (recentUpdates.length > 0 && now - recentUpdates[0].t > 5000) recentUpdates.shift();

  if (pendingProbe && data.includes(pendingProbe.roomCode)) {
    stats.probeLagMs.push(now - pendingProbe.startedAt);
    const done = pendingProbe;
    pendingProbe = null;
    done.resolve();
  }
}

async function probeOnce(token) {
  // 요청을 보내기 **전에** 기준 시각을 잡는다. 응답 후에 잡으면 팬아웃 지연이 음수가 되거나
  // 과소평가된다.
  const startedAt = Date.now();
  const created = await request('POST', '/game-rooms', { token, body: { gameType: 'SIGN_DUEL' } });
  if (created.status !== 201) return;
  const room = JSON.parse(created.body);

  // 응답을 기다리는 동안 이미 도착했는지 먼저 본다.
  const already = recentUpdates.find((u) => u.t >= startedAt && u.data.includes(room.roomCode));
  if (already) {
    stats.probeLagMs.push(already.t - startedAt);
    await request('POST', `/game-rooms/${room.id}/leave`, { token });
    return;
  }

  const seen = new Promise((resolve) => {
    pendingProbe = { roomCode: room.roomCode, startedAt, resolve };
  });
  // 2초 안에 안 오면 놓친 것으로 센다 — 팬아웃이 밀리고 있다는 신호다.
  const timedOut = await Promise.race([
    seen.then(() => false),
    new Promise((r) => setTimeout(() => r(true), 2000)),
  ]);
  if (timedOut) {
    stats.probeMisses += 1;
    pendingProbe = null;
  }
  // 방을 회수한다. host 혼자이므로 이 leave 로 방이 CLOSED 가 되고 적재량이 늘지 않는다.
  await request('POST', `/game-rooms/${room.id}/leave`, { token });
}

// --- 실행 ------------------------------------------------------------------

async function main() {
  console.log(`[swarm] ${BASE_URL} 구독자 ${SUBSCRIBERS}명 연결 시작`);

  for (let i = 0; i < SUBSCRIBERS; i++) {
    const token = tokens[i % tokens.length].accessToken;
    try {
      // 구독자 0번만 prober 의 관측창으로 쓴다. 나머지는 이벤트를 세기만 한다.
      const res = await openSubscriber(token, i === 0 ? onProbeEvent : null);
      subscribers.push(res);
    } catch (e) {
      stats.failed += 1;
      if (stats.failed <= 5) console.error(`[swarm] 구독 실패: ${e.message}`);
    }
    // 티켓 발급이 초당 수백 건 쏟아지면 그 자체가 부하가 된다. 아주 조금 간격을 준다.
    if (i % 25 === 24) await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`[swarm] 연결 ${stats.connected} / 실패 ${stats.failed}`);

  // prober 는 구독자가 하나라도 있을 때만 의미가 있다.
  const proberToken = tokens[tokens.length - 1].accessToken;
  if (stats.connected > 0 && PROBE_INTERVAL_MS > 0) {
    setInterval(() => { probeOnce(proberToken).catch(() => {}); }, PROBE_INTERVAL_MS);
  }

  setInterval(report, 10_000);
  process.on('SIGTERM', finish);
  process.on('SIGINT', finish);
}

function pct(arr, p) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
}

function report() {
  const lag = stats.probeLagMs;
  console.log(
    `[swarm] 연결=${stats.connected} update=${stats.events.update} heartbeat=${stats.events.heartbeat} ` +
    `probe n=${lag.length} p50=${pct(lag, 50)}ms p95=${pct(lag, 95)}ms max=${lag.length ? Math.max(...lag) : null}ms miss=${stats.probeMisses}`,
  );
}

function finish() {
  const summary = {
    tagRun: TAG_RUN,
    subscribersRequested: SUBSCRIBERS,
    subscribersConnected: stats.connected,
    subscribeFailures: stats.failed,
    events: stats.events,
    probe: {
      samples: stats.probeLagMs.length,
      p50: pct(stats.probeLagMs, 50),
      p95: pct(stats.probeLagMs, 95),
      max: stats.probeLagMs.length ? Math.max(...stats.probeLagMs) : null,
      misses: stats.probeMisses,
    },
  };
  try {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RESULTS_DIR, `${TAG_RUN}-swarm-sub${SUBSCRIBERS}.json`),
      JSON.stringify(summary, null, 2),
    );
  } catch (e) {
    console.error(`[swarm] 결과 저장 실패: ${e.message}`);
  }
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
