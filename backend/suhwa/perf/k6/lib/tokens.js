import { TOKENS_PATH } from './config.js';

// open() 은 init 스코프 전용이므로 파일이 미리 있어야 한다.
// tools/mint-tokens.mjs 가 만든다: [{ userId, email, accessToken, refreshToken }, ...]
export const TOKENS = JSON.parse(open(TOKENS_PATH));

if (!Array.isArray(TOKENS) || TOKENS.length < 2) {
  throw new Error(`tokens.json 이 비었거나 2개 미만이다(${TOKENS_PATH}). tools/mint-tokens.mjs 를 먼저 실행할 것.`);
}

/**
 * iteration 기준으로 두 계정을 고른다.
 *
 * __VU 를 쓰지 않는 이유: arrival-rate executor 에서는 VU 가 재사용되며 VU 번호와 동시성이
 * 대응하지 않는다. iteration 기준으로 두 개씩 떠가면 같은 계정이 동시에 두 방에 있는 상황을
 * 실질적으로 피할 수 있고, 계정 풀 크기가 곧 최대 동시 방 수의 상한이 된다.
 */
export function pickPair(iteration) {
  const pairs = Math.floor(TOKENS.length / 2);
  const i = iteration % pairs;
  return [TOKENS[i * 2], TOKENS[i * 2 + 1]];
}

export function pickOne(iteration) {
  return TOKENS[iteration % TOKENS.length];
}
