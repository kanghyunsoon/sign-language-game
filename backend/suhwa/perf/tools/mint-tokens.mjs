// 시드된 계정 전원을 로그인해 k6/data/tokens.json 을 만든다. 호스트에서 실행한다.
//
//   USERS=200 node tools/mint-tokens.mjs
//
// 왜 k6 setup() 이 아니라 별도 단계인가:
//  1) 시나리오 3·4 는 BCrypt 비용을 지불해서는 안 된다. 방 API p95 를 재는데 로그인 CPU 가
//     섞이면 곡선이 무의미해진다. BCrypt 는 시나리오 1에서만 잰다.
//  2) k6 의 open() 은 init 스코프 전용이라 파일이 미리 있어야 한다.
//
// 액세스 토큰 수명이 기본 1시간이므로 한 번 발급하면 한 실행 내내 유효하다.
// 단 30~60분 소크에서는 경계에 걸린다 — 소크 직전에 다시 실행하거나 시나리오에 refresh 를 넣어야 한다.

import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:18080';
const USERS = Number(process.env.USERS || 200);
const PASSWORD = process.env.SEED_PASSWORD || 'perfPassw0rd!';
const OUT = process.env.OUT || path.resolve('k6/data/tokens.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);

async function login(email) {
  const res = await fetch(`${APP_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`${email}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function me(accessToken) {
  const res = await fetch(`${APP_URL}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`users/me HTTP ${res.status}`);
  return res.json();
}

async function mint(n) {
  const email = `perf${n}@perf.local`;
  const tokens = await login(email);
  // userId 가 필요하다 — 결과 보고의 winnerUserId 로 쓴다. 토큰을 디코딩하는 대신
  // /users/me 로 확실하게 얻는다(응답 형식이 바뀌어도 여기만 고치면 된다).
  const profile = await me(tokens.accessToken);
  return {
    userId: profile.id ?? profile.userId,
    email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async function main() {
  const out = [];
  const failures = [];
  const queue = Array.from({ length: USERS }, (_, i) => i + 1);

  // BCrypt 는 CPU 를 잡아먹으므로 동시성을 낮게 유지한다 — 여기서 앱을 포화시킬 필요가 없다.
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const n = queue.shift();
        if (n === undefined) return;
        try {
          out.push(await mint(n));
        } catch (e) {
          failures.push(e.message);
        }
      }
    }),
  );

  if (out.length < 2) {
    console.error('[tokens] 발급된 토큰이 2개 미만이다. 시딩이 됐는지, 비밀번호가 맞는지 확인할 것.');
    failures.slice(0, 5).forEach((m) => console.error(`  ${m}`));
    process.exit(1);
  }

  // 계정 번호 순서를 유지한다 — pickPair 가 인접한 두 개를 짝으로 쓰므로 순서가 재현돼야 한다.
  out.sort((a, b) => Number(a.email.match(/\d+/)[0]) - Number(b.email.match(/\d+/)[0]));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`[tokens] ${out.length}개 발급 → ${OUT}${failures.length ? ` (실패 ${failures.length})` : ''}`);
  if (failures.length) failures.slice(0, 5).forEach((m) => console.error(`  ${m}`));
}

main();
