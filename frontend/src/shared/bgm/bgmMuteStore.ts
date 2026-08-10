import { useSyncExternalStore } from "react";

/**
 * 배경음악 음소거 상태를 앱 전역에서 공유한다.
 *
 * 네비게이션 바의 토글 버튼과 App의 재생 훅이 서로 다른 트리에 있어
 * 컨텍스트 대신 모듈 단위 저장소를 둔다. 설정은 localStorage에 남겨
 * 새로고침이나 페이지 이동 후에도 유지한다.
 */
const STORAGE_KEY = "sudal.bgm.muted";

function readStoredMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // 사생활 보호 모드 등에서 접근이 막히면 기본값(재생)으로 둔다.
    return false;
  }
}

let muted = readStoredMuted();
const listeners = new Set<() => void>();

export function getBgmMuted(): boolean {
  return muted;
}

export function setBgmMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;

  try {
    localStorage?.setItem(STORAGE_KEY, String(next));
  } catch {
    // 저장에 실패해도 이번 세션 동안의 설정은 유지한다.
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 음소거 상태와 토글 함수를 반환한다. */
export function useBgmMuted(): readonly [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, getBgmMuted, getBgmMuted);
  return [value, () => setBgmMuted(!getBgmMuted())] as const;
}
