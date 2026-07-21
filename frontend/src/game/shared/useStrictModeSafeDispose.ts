import { useEffect, useRef } from "react";

interface DisposableResource {
  dispose(): void;
}

/**
 * React 개발 모드의 setup -> cleanup -> setup 검사에서는 같은 객체를 폐기하지 않는다.
 * 실제 unmount 또는 다른 객체로 교체될 때만 최종 dispose를 실행한다.
 */
export function useStrictModeSafeDispose<T extends DisposableResource>(resource: T): void {
  const lifecycleRef = useRef({ generation: 0, current: resource });
  lifecycleRef.current.current = resource;

  useEffect(() => {
    lifecycleRef.current.current = resource;
    lifecycleRef.current.generation += 1;

    return () => {
      const cleanupGeneration = ++lifecycleRef.current.generation;
      queueMicrotask(() => {
        const lifecycle = lifecycleRef.current;
        const reallyUnmounted = lifecycle.generation === cleanupGeneration;
        const resourceWasReplaced = lifecycle.current !== resource;
        if (reallyUnmounted || resourceWasReplaced) resource.dispose();
      });
    };
  }, [resource]);
}
