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
    const initialBounds = mount.getBoundingClientRect();
    const width = Math.max(1, Math.round(initialBounds.width));
    const height = Math.max(1, Math.round(initialBounds.height));

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

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      renderer?.destroy();
      if (rendererHost.parentElement === mount) rendererHost.remove();
      callbacksRef.current.onRendererDisposed?.();
    };
  // Callers often construct Partial<RendererConfig> inline. Recreate the
  // expensive Pixi application only when an actual config value changes.
  }, [rendererConfig?.width, rendererConfig?.height, rendererConfig?.dangerLineY, rendererConfig?.dangerLineRatio, rendererConfig?.letterWidth, rendererConfig?.letterHeight, rendererConfig?.removalHighlightDurationMs, rendererConfig?.showScenery]);

  return <div ref={mountRef} className={className} />;
});
