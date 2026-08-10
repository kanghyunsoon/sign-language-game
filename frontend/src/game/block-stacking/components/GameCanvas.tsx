import { memo, useEffect, useRef } from "react";

import { PixiGameRenderer } from "../render/PixiGameRenderer";
import type { GameRenderer, RendererConfig } from "../render/types";

export interface GameCanvasProps {
  readonly className?: string;
  readonly rendererConfig?: Partial<RendererConfig>;
  readonly onRendererReady?: (renderer: GameRenderer, viewport: GameCanvasViewport) => void;
  readonly onViewportResize?: (viewport: GameCanvasViewport) => void;
  readonly onRendererDisposed?: () => void;
}

export interface GameCanvasViewport {
  readonly width: number;
  readonly height: number;
}

export const GameCanvas = memo(function GameCanvas({
  className,
  rendererConfig,
  onRendererReady,
  onViewportResize,
  onRendererDisposed,
}: GameCanvasProps): React.JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onRendererReady, onViewportResize, onRendererDisposed });
  callbacksRef.current = { onRendererReady, onViewportResize, onRendererDisposed };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    let disposed = false;
    let renderer: PixiGameRenderer | undefined;
    // React StrictMode can start two asynchronous renderer initializations.
    // Give each attempt an isolated host so a stale attempt can only replace
    // or destroy its own canvas, never the current attempt's canvas.
    const rendererHost = document.createElement("div");
    rendererHost.dataset.gameRendererHost = "";
    rendererHost.style.width = "100%";
    rendererHost.style.height = "100%";
    rendererHost.style.display = "block";
    mount.replaceChildren(rendererHost);
    // The game page itself can be uniformly CSS-scaled. Visual bounds include
    // that transform, while Pixi and the physics world need the untransformed
    // logical board size.
    const width = Math.max(1, Math.round(mount.clientWidth));
    const height = Math.max(1, Math.round(mount.clientHeight));

    void PixiGameRenderer.create(rendererHost, {
      ...rendererConfig,
      width,
      height,
    }).then((createdRenderer) => {
      if (disposed) {
        createdRenderer.destroy();
        return;
      }

      renderer = createdRenderer;
      callbacksRef.current.onRendererReady?.(createdRenderer, { width, height });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !renderer) {
        return;
      }

      const viewport = {
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: Math.max(1, Math.round(entry.contentRect.height)),
      };
      renderer.resize(viewport.width, viewport.height);
      callbacksRef.current.onViewportResize?.(viewport);
    });
    resizeObserver.observe(mount);

    // The solo page is fitted with a CSS transform. Browser zoom changes the
    // visual rectangle but not the element's ResizeObserver size, so refresh
    // the renderer once the new scale has been applied. This keeps the DOM
    // foreground glyph layer aligned with the canvas at every zoom level.
    let visualSyncFrame: number | undefined;
    const syncVisualBounds = () => {
      if (visualSyncFrame !== undefined) window.cancelAnimationFrame(visualSyncFrame);
      visualSyncFrame = window.requestAnimationFrame(() => {
        visualSyncFrame = undefined;
        if (!renderer) return;
        renderer.resize(
          Math.max(1, Math.round(mount.clientWidth)),
          Math.max(1, Math.round(mount.clientHeight)),
        );
      });
    };
    window.addEventListener("resize", syncVisualBounds);
    window.visualViewport?.addEventListener("resize", syncVisualBounds);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncVisualBounds);
      window.visualViewport?.removeEventListener("resize", syncVisualBounds);
      if (visualSyncFrame !== undefined) window.cancelAnimationFrame(visualSyncFrame);
      renderer?.destroy();
      if (rendererHost.parentElement === mount) rendererHost.remove();
      callbacksRef.current.onRendererDisposed?.();
    };
  // Callers often construct Partial<RendererConfig> inline. Recreate the
  // expensive Pixi application only when an actual config value changes.
  }, [rendererConfig?.width, rendererConfig?.height, rendererConfig?.coordinateWidth, rendererConfig?.coordinateHeight, rendererConfig?.dangerLineY, rendererConfig?.dangerLineRatio, rendererConfig?.letterWidth, rendererConfig?.letterHeight, rendererConfig?.letterBaseColor, rendererConfig?.letterTargetColor, rendererConfig?.letterShadowColor, rendererConfig?.removalHighlightDurationMs, rendererConfig?.showScenery]);

  return <div ref={mountRef} className={className} />;
});
