// actuator 메트릭 샘플러. k6 는 클라이언트 관점만 보므로 서버 내부는 여기서 긁는다.
// 1초 주기로 /actuator/metrics/{name} 을 읽어 CSV 한 줄씩 남긴다.
//
// 노출은 compose 의 MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=health,metrics 로 켜진다 —
// application.yaml 을 고치지 않으므로 운영으로 새어 나갈 경로가 없다.

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://backend:8080';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 1000);
const TAG_RUN = process.env.TAG_RUN || 'adhoc';
const RESULTS_DIR = process.env.RESULTS_DIR || '/results';

// [메트릭 이름, 태그 필터, 읽을 통계] — 무엇을 판정하는지는 PLAN.md §6-9 참조.
const SERIES = [
  // 0 을 벗어나는 순간이 풀 부족 시작점(-708)
  ['hikaricp.connections.pending', null, 'VALUE'],
  ['hikaricp.connections.active', null, 'VALUE'],
  ['hikaricp.connections.acquire', null, 'MAX'],
  // 🔴2 소크의 우상향 추세
  ['jvm.memory.used', 'area:heap', 'VALUE'],
  ['jvm.gc.pause', null, 'MAX'],
  // 스레드 고갈이 원인인지
  ['tomcat.threads.busy', null, 'VALUE'],
  // 확인 대기·유예 타이머 스케줄러 포화. 다른 부하 테스트에는 없는 이 프로젝트 고유 지표다 —
  // 포화되면 MR !120 의 TaskRejectedException 가드가 발동해 방 정리가 조용히 누락된다.
  ['executor.active', null, 'VALUE'],
  ['executor.queued', null, 'VALUE'],
  ['executor.pool.size', null, 'VALUE'],
];

const outPath = path.join(RESULTS_DIR, `${TAG_RUN}-server-metrics.csv`);
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const header = ['ts_iso', ...SERIES.map(([n, t, s]) => `${n}${t ? `[${t}]` : ''}.${s}`)].join(',');
fs.writeFileSync(outPath, header + '\n');
console.log(`[sampler] ${outPath} 기록 시작 (${INTERVAL_MS}ms 주기)`);

async function readOne([name, tag, stat]) {
  const url = `${BASE_URL}/actuator/metrics/${encodeURIComponent(name)}${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const body = await res.json();
    const m = (body.measurements || []).find((x) => x.statistic === stat);
    return m ? String(m.value) : '';
  } catch {
    // 앱이 아직 안 떴거나 재시작 중인 경우는 빈 칸으로 남긴다 — 샘플러가 죽으면 안 된다.
    return '';
  }
}

async function tick() {
  const values = await Promise.all(SERIES.map(readOne));
  fs.appendFileSync(outPath, [new Date().toISOString(), ...values].join(',') + '\n');
}

setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[sampler] 종료. 결과: ${outPath}`);
    process.exit(0);
  });
}
