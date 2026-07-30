/**
 * 히어로에 보여줄 수달 그림 선택을 기억한다.
 *
 * 백엔드에 사용자 설정 API가 아직 없어 localStorage에 담아 둔다. API가 생기면
 * 아래 read/write만 교체하면 되고, 화면은 그대로 쓸 수 있다.
 *
 * 그림의 순번이 아니라 id를 저장한다. 목록의 순서를 바꾸거나 그림을 더해도
 * 사용자가 골라 둔 그림이 다른 그림으로 바뀌지 않아야 하기 때문이다.
 */
const STORAGE_KEY = "handpractice.otterHabitat";

/** localStorage를 못 쓰는 환경(SSR·프라이빗 모드)에서 쓰는 대체 저장소. */
let memoryFallback: string | null = null;

/** 저장해 둔 그림 id. 없거나 읽을 수 없으면 null. */
export function readOtterHabitatId(): string | null {
  if (memoryFallback !== null) return memoryFallback;

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 고른 그림 id를 남긴다. */
export function writeOtterHabitatId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장이 막힌 환경에서도 이 화면 안에서는 선택이 유지된다.
    memoryFallback = id;
  }
}

/**
 * 저장된 id가 목록에서 몇 번째인지. 기록이 없거나 사라진 그림을 가리키면
 * 첫 그림으로 돌아가, 손으로 고친 값이 들어와도 화면이 비지 않는다.
 */
export function findHabitatIndex(
  ids: readonly string[],
  savedId: string | null,
): number {
  const index = savedId === null ? -1 : ids.indexOf(savedId);

  return index === -1 ? 0 : index;
}

/** 테스트에서 저장소를 비운다. */
export function resetOtterHabitatForTest() {
  memoryFallback = null;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경이면 위의 초기화만으로 충분하다.
  }
}
