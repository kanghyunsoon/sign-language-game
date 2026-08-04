import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/**
 * 앱 전체가 공유하는 고정 캔버스 기준.
 *
 * 메인, 사전, 테스트, 오답노트, 프로필, 로그인이 모두 이 크기의 캔버스를 그린 뒤
 * transform으로 축소한다. 게임 화면도 같은 기준을 써야 페이지를 옮길 때
 * 콘텐츠 폭과 좌우 여백이 흔들리지 않는다.
 */
export const APP_CANVAS_WIDTH = 1920;
export const APP_CANVAS_HEIGHT = 1080;

export interface FixedCanvasMetrics {
  /** 캔버스에 적용할 transform scale. */
  readonly scale: number;
  /**
   * 뒤로가기·홈·아이디 칩처럼 앱 공통 규격을 따라야 하는 요소의 보정 배율.
   *
   * 설계 폭이 1920이 아닌 화면에서 `calc(155px * var(--app-chrome-scale))`처럼 쓰면
   * 메인 화면과 같은 실제 크기로 렌더된다.
   */
  readonly chromeScale: number;
}

/**
 * 설계 크기가 다른 화면도 앱 표준과 같은 화면 폭을 차지하도록 축소율을 계산한다.
 *
 * 앱 표준(1920 × 1080)을 그대로 쓰는 화면은 `min(vw / 1920, vh / 1080)`이 된다.
 * 설계 폭이 다른 게임 화면은 같은 배율에 `1920 / 설계폭`을 곱해, 렌더된 폭이
 * 앱 표준 캔버스의 폭과 일치하게 만든다. 게임 화면(1280 × 720, 1680 × 945)은
 * 앱 표준과 같은 16:9라 폭뿐 아니라 높이까지 정확히 일치한다.
 * 세로가 부족한 뷰포트에서는 넘치지 않도록 실제 뷰포트 기준으로 한 번 더 제한한다.
 */
export function useFixedCanvasScale(
  designWidth: number = APP_CANVAS_WIDTH,
  designHeight: number = APP_CANVAS_HEIGHT,
): FixedCanvasMetrics {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const appScale = Math.min(
        window.innerWidth / APP_CANVAS_WIDTH,
        window.innerHeight / APP_CANVAS_HEIGHT,
      );
      const matchedToAppWidth = appScale * (APP_CANVAS_WIDTH / designWidth);

      setScale(Math.min(
        matchedToAppWidth,
        window.innerWidth / designWidth,
        window.innerHeight / designHeight,
      ));
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [designHeight, designWidth]);

  return { scale, chromeScale: designWidth / APP_CANVAS_WIDTH };
}

/**
 * 고정 캔버스 요소에 그대로 펼쳐 넣는 style 객체.
 *
 * `transform`은 캔버스를 화면 중앙에 놓고, `--app-chrome-scale`은 공통 규격 요소가
 * 참조한다.
 */
export function fixedCanvasStyle(metrics: FixedCanvasMetrics): CSSProperties {
  return {
    transform: `translate(-50%, -50%) scale(${metrics.scale})`,
    "--app-chrome-scale": `${metrics.chromeScale}`,
  } as CSSProperties;
}
