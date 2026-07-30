// 샘플러 CSV를 한 화면 요약으로 줄인다. 보고할 때 CSV를 눈으로 읽지 않기 위한 것.
//
//   node tools/summarize-metrics.mjs <results>/<TAG_RUN>-server-metrics.csv
//
// 열마다 최대·평균·마지막값을 내고, 힙처럼 추세가 중요한 값은 앞 1/4 구간과 뒤 1/4 구간의
// 평균을 나란히 보여준다 — 누수 판정은 최댓값이 아니라 추세로 한다.

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('사용법: node tools/summarize-metrics.mjs <server-metrics.csv>');
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
const header = lines[0].split(',');
const rows = lines.slice(1).map((l) => l.split(','));

if (rows.length === 0) {
  console.error('데이터 행이 없다. 샘플러가 돌지 않았거나 actuator가 401로 막혔을 수 있다.');
  process.exit(1);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v) => (v === null || Number.isNaN(v) ? '-' : Math.abs(v) >= 1e6 ? (v / 1048576).toFixed(1) + 'Mi' : Number(v.toFixed(3)).toString());

const q = Math.max(1, Math.floor(rows.length / 4));
console.log(`샘플 ${rows.length}개  ${rows[0][0]} → ${rows[rows.length - 1][0]}\n`);
console.log('지표'.padEnd(42), 'max'.padStart(10), 'mean'.padStart(10), '앞1/4'.padStart(10), '뒤1/4'.padStart(10), '마지막'.padStart(10));

for (let c = 1; c < header.length; c++) {
  const vals = rows.map((r) => (r[c] === undefined || r[c] === '' ? null : Number(r[c]))).filter((v) => v !== null);
  if (vals.length === 0) {
    console.log(header[c].padEnd(42), '(값 없음 — 메트릭 미등록 또는 401)');
    continue;
  }
  const head = vals.slice(0, q);
  const tail = vals.slice(-q);
  console.log(
    header[c].padEnd(42),
    fmt(Math.max(...vals)).padStart(10),
    fmt(mean(vals)).padStart(10),
    fmt(mean(head)).padStart(10),
    fmt(mean(tail)).padStart(10),
    fmt(vals[vals.length - 1]).padStart(10),
  );
}

console.log('\n해석 힌트');
console.log('  pending 이 0 이 아니면 → 커넥션 풀 부족 (-708)');
console.log('  executor.queued 가 뒤1/4 에서 더 크면 → 예약 작업이 쌓이는 중 (취소된 타이머 포함)');
console.log('  heap 뒤1/4 이 앞1/4 보다 크게 높으면 → 누수 후보 (소크에서만 판정 가능)');
