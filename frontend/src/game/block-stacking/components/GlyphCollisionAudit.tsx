import { useEffect, useMemo, useRef, useState } from "react";

import {
  createGlyphRaster,
  getGlyphCollisionOverrides,
  getGlyphCollisionRects,
  setGlyphCollisionOverride,
  type GlyphCollisionRect,
} from "../glyphs/glyphRaster";

const PREVIEW_SIZE = 220;
const PREVIEW_SCALE = 0.92;
const MIN_RECT_SIZE = 2;
const MIN_PREVIEW_ZOOM = 0.8;
const MAX_PREVIEW_ZOOM = 2;
const PREVIEW_ZOOM_STEP = 0.2;

interface PartDragState {
  readonly symbol: string;
  readonly index: number;
  readonly mode: "move" | "resize";
  readonly startX: number;
  readonly startY: number;
  readonly original: GlyphCollisionRect;
}

interface GroupDragState {
  readonly symbol: string;
  readonly mode: "group-move" | "group-resize";
  readonly startX: number;
  readonly startY: number;
  readonly originals: readonly GlyphCollisionRect[];
  readonly bounds: CollisionBounds;
}

interface CollisionBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

type DragState = PartDragState | GroupDragState;

interface AuditHistoryState {
  readonly rectanglesBySymbol: Record<string, readonly GlyphCollisionRect[]>;
  readonly overrides: Readonly<Record<string, readonly GlyphCollisionRect[]>>;
}

interface CopiedCollisionSelection {
  readonly sourceSymbol: string;
  readonly rectangles: readonly GlyphCollisionRect[];
}

function getCollisionBounds(rectangles: readonly GlyphCollisionRect[]): CollisionBounds {
  const left = Math.min(...rectangles.map((rectangle) => rectangle.x - rectangle.width / 2));
  const top = Math.min(...rectangles.map((rectangle) => rectangle.y - rectangle.height / 2));
  const right = Math.max(...rectangles.map((rectangle) => rectangle.x + rectangle.width / 2));
  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height / 2));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function GlyphCollisionAudit({ symbols }: { readonly symbols: readonly string[] }): React.JSX.Element {
  const savedOverridesAtLoad = useMemo(() => getGlyphCollisionOverrides(), []);
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0] ?? "");
  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1.4);
  const [rectanglesBySymbol, setRectanglesBySymbol] = useState<
    Record<string, readonly GlyphCollisionRect[]>
  >(() => Object.fromEntries(symbols.map((symbol) => [
    symbol,
    savedOverridesAtLoad[symbol] ?? getGlyphCollisionRects(symbol),
  ])));
  const [savedSymbolCount, setSavedSymbolCount] = useState(
    () => Object.keys(savedOverridesAtLoad).length,
  );
  const [notice, setNotice] = useState(
    () => Object.keys(savedOverridesAtLoad).length > 0
      ? `브라우저에 저장된 ${Object.keys(savedOverridesAtLoad).length}개 글자 설정을 불러왔습니다.`
      : "방향키: 이동 · Ctrl+방향키: 크기 · Alt+방향키: 회전 · Ctrl+C/V: 복제 · Ctrl+Z: 되돌리기",
  );
  const dragRef = useRef<DragState | null>(null);
  const copiedRectangleRef = useRef<CopiedCollisionSelection | null>(null);
  const undoStackRef = useRef<AuditHistoryState[]>([]);
  const rasterUrls = useMemo(() => Object.fromEntries(symbols.map((symbol) => {
    const raster = createGlyphRaster(symbol);
    return [symbol, { url: raster.canvas.toDataURL(), width: raster.canvas.width, height: raster.canvas.height }];
  })), [symbols]);
  const previewSize = PREVIEW_SIZE * previewZoom;
  const previewScale = PREVIEW_SCALE * previewZoom;

  const rememberUndoState = () => {
    undoStackRef.current.push({
      rectanglesBySymbol: Object.fromEntries(Object.entries(rectanglesBySymbol).map(
        ([symbol, rectangles]) => [symbol, rectangles.map((rectangle) => ({ ...rectangle }))],
      )),
      overrides: Object.fromEntries(Object.entries(getGlyphCollisionOverrides()).map(
        ([symbol, rectangles]) => [symbol, rectangles.map((rectangle) => ({ ...rectangle }))],
      )),
    });
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
  };

  const restorePreviousState = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setNotice("되돌릴 편집 작업이 없습니다.");
      return;
    }
    for (const symbol of Object.keys(getGlyphCollisionOverrides())) {
      setGlyphCollisionOverride(symbol, null);
    }
    for (const [symbol, rectangles] of Object.entries(previous.overrides)) {
      setGlyphCollisionOverride(symbol, rectangles);
    }
    setRectanglesBySymbol(previous.rectanglesBySymbol);
    setSavedSymbolCount(Object.keys(previous.overrides).length);
    setSelectedPartIndex(null);
    setNotice("마지막 콜리전 편집 작업을 되돌렸습니다.");
  };

  const updateRectangle = (
    symbol: string,
    index: number,
    updater: (rectangle: GlyphCollisionRect) => GlyphCollisionRect,
  ) => {
    const current = rectanglesBySymbol[symbol] ?? getGlyphCollisionRects(symbol);
    const next = current.map((rectangle, rectangleIndex) => (
      rectangleIndex === index ? updater(rectangle) : rectangle
    ));
    setGlyphCollisionOverride(symbol, next);
    setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
    setRectanglesBySymbol((previous) => ({ ...previous, [symbol]: next }));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = (event.clientX - drag.startX) / previewScale;
    const deltaY = (event.clientY - drag.startY) / previewScale;
    if (drag.mode === "group-move" || drag.mode === "group-resize") {
      const next = drag.mode === "group-move"
        ? drag.originals.map((rectangle) => ({
            ...rectangle,
            x: rectangle.x + deltaX,
            y: rectangle.y + deltaY,
          }))
        : (() => {
            const nextWidth = Math.max(MIN_RECT_SIZE, drag.bounds.width + deltaX);
            const nextHeight = Math.max(MIN_RECT_SIZE, drag.bounds.height + deltaY);
            const scaleX = nextWidth / Math.max(MIN_RECT_SIZE, drag.bounds.width);
            const scaleY = nextHeight / Math.max(MIN_RECT_SIZE, drag.bounds.height);
            return drag.originals.map((rectangle) => {
              const rectangleLeft = rectangle.x - rectangle.width / 2;
              const rectangleTop = rectangle.y - rectangle.height / 2;
              const width = Math.max(MIN_RECT_SIZE, rectangle.width * scaleX);
              const height = Math.max(MIN_RECT_SIZE, rectangle.height * scaleY);
              return {
                ...rectangle,
                x: drag.bounds.left + (rectangleLeft - drag.bounds.left) * scaleX + width / 2,
                y: drag.bounds.top + (rectangleTop - drag.bounds.top) * scaleY + height / 2,
                width,
                height,
              };
            });
          })();
      setGlyphCollisionOverride(drag.symbol, next);
      setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
      setRectanglesBySymbol((previous) => ({ ...previous, [drag.symbol]: next }));
      return;
    }
    const partDrag = drag as PartDragState;
    updateRectangle(partDrag.symbol, partDrag.index, () => {
      if (partDrag.mode === "move") {
        return {
          ...partDrag.original,
          x: partDrag.original.x + deltaX,
          y: partDrag.original.y + deltaY,
        };
      }
      const width = Math.max(MIN_RECT_SIZE, partDrag.original.width + deltaX);
      const height = Math.max(MIN_RECT_SIZE, partDrag.original.height + deltaY);
      return {
        x: partDrag.original.x + (width - partDrag.original.width) / 2,
        y: partDrag.original.y + (height - partDrag.original.height) / 2,
        width,
        height,
      };
    });
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setNotice(`${selectedSymbol} 충돌 영역을 브라우저에 저장했습니다.`);
  };

  const copyOverrides = async () => {
    for (const [symbol, rectangles] of Object.entries(rectanglesBySymbol)) {
      setGlyphCollisionOverride(symbol, rectangles);
    }
    setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
    await navigator.clipboard.writeText(JSON.stringify(getGlyphCollisionOverrides(), null, 2));
    setNotice("브라우저에 저장했고 JSON을 복사했습니다. 프로젝트 파일에는 아직 자동 반영되지 않습니다.");
  };

  const resetSelected = () => {
    rememberUndoState();
    setGlyphCollisionOverride(selectedSymbol, null);
    setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
    const automaticRectangles = getGlyphCollisionRects(selectedSymbol);
    setRectanglesBySymbol((previous) => ({
      ...previous,
      [selectedSymbol]: automaticRectangles,
    }));
    setSelectedPartIndex(null);
    setNotice(`${selectedSymbol}을 자동 충돌 영역으로 되돌렸습니다.`);
  };

  const deleteSelectedPart = () => {
    if (selectedPartIndex === null) return;
    const rectangles = rectanglesBySymbol[selectedSymbol] ?? getGlyphCollisionRects(selectedSymbol);
    if (rectangles.length <= 1) {
      setNotice("마지막 충돌 조각은 삭제할 수 없습니다.");
      return;
    }
    rememberUndoState();
    const next = rectangles.filter((_, index) => index !== selectedPartIndex);
    setGlyphCollisionOverride(selectedSymbol, next);
    setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
    setRectanglesBySymbol((previous) => ({ ...previous, [selectedSymbol]: next }));
    setSelectedPartIndex(null);
    setNotice(`${selectedSymbol}의 선택한 충돌 조각을 삭제했습니다.`);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCopyShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
      const isPasteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
      const rectangles = rectanglesBySymbol[selectedSymbol] ?? getGlyphCollisionRects(selectedSymbol);

      if (isUndoShortcut) {
        event.preventDefault();
        restorePreviousState();
        return;
      }

      if (isCopyShortcut) {
        event.preventDefault();
        const copiedRectangles = selectedPartIndex === null
          ? rectangles
          : rectangles[selectedPartIndex]
            ? [rectangles[selectedPartIndex]]
            : [];
        if (copiedRectangles.length === 0) return;
        copiedRectangleRef.current = {
          sourceSymbol: selectedSymbol,
          rectangles: copiedRectangles.map((rectangle) => ({ ...rectangle })),
        };
        setNotice(
          selectedPartIndex === null
            ? `${selectedSymbol}의 전체 콜리전 ${copiedRectangles.length}개를 복사했습니다.`
            : `${selectedSymbol}의 ${selectedPartIndex + 1}번 콜리전을 복사했습니다.`,
        );
        return;
      }

      if (isPasteShortcut) {
        const copiedSelection = copiedRectangleRef.current;
        if (!copiedSelection || !selectedSymbol) return;
        event.preventDefault();
        rememberUndoState();
        const isSameSymbol = copiedSelection.sourceSymbol === selectedSymbol;
        const pastedRectangles = copiedSelection.rectangles.map((rectangle) => ({
          ...rectangle,
          x: rectangle.x + (isSameSymbol ? 4 : 0),
          y: rectangle.y + (isSameSymbol ? 4 : 0),
        }));
        const next = [...rectangles, ...pastedRectangles];
        setGlyphCollisionOverride(selectedSymbol, next);
        setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
        setRectanglesBySymbol((previous) => ({ ...previous, [selectedSymbol]: next }));
        setSelectedPartIndex(pastedRectangles.length === 1 ? next.length - 1 : null);
        setNotice(
          `${copiedSelection.sourceSymbol}의 콜리전 ${pastedRectangles.length}개를 ${selectedSymbol}에 붙여넣었습니다.`,
        );
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedPartIndex === null) return;
        event.preventDefault();
        if (rectangles.length <= 1) {
          setNotice("마지막 충돌 조각은 삭제할 수 없습니다.");
          return;
        }
        rememberUndoState();
        const next = rectangles.filter((_, index) => index !== selectedPartIndex);
        setGlyphCollisionOverride(selectedSymbol, next);
        setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
        setRectanglesBySymbol((previous) => ({ ...previous, [selectedSymbol]: next }));
        setSelectedPartIndex(null);
        setNotice(`${selectedSymbol}의 선택한 충돌 조각을 삭제했습니다.`);
        return;
      }

      if (selectedPartIndex === null) return;
      const directions: Partial<Record<string, readonly [number, number]>> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      if (!rectangles[selectedPartIndex]) return;
      rememberUndoState();
      const next = rectangles.map((rectangle, index) => (
        index === selectedPartIndex
          ? event.altKey
            ? {
                ...rectangle,
                angle: (rectangle.angle ?? 0)
                  + (direction[0] + direction[1] < 0 ? -1 : 1) * step * Math.PI / 180,
              }
            : event.ctrlKey
            ? {
                ...rectangle,
                width: Math.max(MIN_RECT_SIZE, rectangle.width + direction[0] * step),
                height: Math.max(MIN_RECT_SIZE, rectangle.height + direction[1] * step),
              }
            : {
                ...rectangle,
                x: rectangle.x + direction[0] * step,
                y: rectangle.y + direction[1] * step,
              }
          : rectangle
      ));
      setGlyphCollisionOverride(selectedSymbol, next);
      setSavedSymbolCount(Object.keys(getGlyphCollisionOverrides()).length);
      setRectanglesBySymbol((previous) => ({ ...previous, [selectedSymbol]: next }));
      setNotice(
        event.altKey
          ? `${selectedSymbol} ${selectedPartIndex + 1}번 조각을 ${step}° 회전했습니다.`
          : event.ctrlKey
          ? `${selectedSymbol} ${selectedPartIndex + 1}번 조각 크기를 ${step}px 조절했습니다.`
          : `${selectedSymbol} ${selectedPartIndex + 1}번 조각을 ${step}px 이동했습니다.`,
      );
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rectanglesBySymbol, selectedPartIndex, selectedSymbol]);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10000,
      overflow: "auto",
      padding: 16,
      background: "#eef7ff",
      color: "#26343c",
    }}>
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,.96)",
        boxShadow: "0 4px 14px rgba(44,70,88,.12)",
      }}>
        <strong style={{ fontSize: 20 }}>글자별 콜리전 편집</strong>
        <span>
          선택: {selectedSymbol || "-"}
          {selectedPartIndex === null ? "" : ` · ${selectedPartIndex + 1}번 조각`}
        </span>
        <strong style={{ color: savedSymbolCount > 0 ? "#397451" : "#8b969c" }}>
          브라우저 저장 {savedSymbolCount}글자
        </strong>
        <span style={{ flex: 1, color: "#607681" }}>{notice}</span>
        <button
          type="button"
          onClick={() => setPreviewZoom((zoom) => Math.max(MIN_PREVIEW_ZOOM, zoom - PREVIEW_ZOOM_STEP))}
          disabled={previewZoom <= MIN_PREVIEW_ZOOM}
        >
          − 축소
        </button>
        <strong style={{ minWidth: 52, textAlign: "center" }}>{Math.round(previewZoom * 100)}%</strong>
        <button
          type="button"
          onClick={() => setPreviewZoom((zoom) => Math.min(MAX_PREVIEW_ZOOM, zoom + PREVIEW_ZOOM_STEP))}
          disabled={previewZoom >= MAX_PREVIEW_ZOOM}
        >
          + 확대
        </button>
        <button type="button" onClick={deleteSelectedPart} disabled={selectedPartIndex === null}>
          선택 조각 삭제
        </button>
        <button type="button" onClick={resetSelected} disabled={!selectedSymbol}>선택 글자 초기화</button>
        <button type="button" onClick={() => void copyOverrides()}>브라우저 저장 + JSON 복사</button>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${previewSize}px)`, gap: 12 }}>
        {symbols.map((symbol) => {
          const raster = rasterUrls[symbol]!;
          const rectangles = rectanglesBySymbol[symbol] ?? getGlyphCollisionRects(symbol);
          const isSelected = selectedSymbol === symbol;
          const groupBounds = getCollisionBounds(rectangles);
          return (
            <div
              key={symbol}
              onPointerDown={(event) => {
                event.preventDefault();
                setSelectedSymbol(symbol);
                setSelectedPartIndex(null);
                setNotice(`${symbol} 문자를 붙여넣기 대상으로 선택했습니다.`);
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              style={{
                position: "relative",
                width: previewSize,
                height: previewSize,
                overflow: "hidden",
                touchAction: "none",
                border: "1px solid #aac",
                outline: isSelected ? "3px solid #4e8bd8" : "none",
                outlineOffset: -3,
                borderRadius: 8,
                background: "white",
                boxSizing: "border-box",
                cursor: "default",
              }}
            >
              <img
                src={raster.url}
                alt=""
                aria-hidden="true"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: raster.width * previewScale,
                  height: raster.height * previewScale,
                  transform: "translate(-50%, -50%)",
                  filter: "brightness(.3) saturate(.65)",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
              {isSelected && selectedPartIndex === null && (
                <div
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    rememberUndoState();
                    event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
                    dragRef.current = {
                      symbol,
                      mode: "group-move",
                      startX: event.clientX,
                      startY: event.clientY,
                      originals: rectangles.map((rectangle) => ({ ...rectangle })),
                      bounds: groupBounds,
                    };
                  }}
                  style={{
                    position: "absolute",
                    zIndex: 1,
                    left: `calc(50% + ${groupBounds.left * previewScale}px)`,
                    top: `calc(50% + ${groupBounds.top * previewScale}px)`,
                    width: groupBounds.width * previewScale,
                    height: groupBounds.height * previewScale,
                    minWidth: 4,
                    minHeight: 4,
                    border: "2px dashed #1463c7",
                    background: "rgba(20, 99, 199, .04)",
                    boxSizing: "border-box",
                    cursor: "move",
                  }}
                >
                  <i
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      rememberUndoState();
                      event.currentTarget.parentElement?.parentElement?.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        symbol,
                        mode: "group-resize",
                        startX: event.clientX,
                        startY: event.clientY,
                        originals: rectangles.map((rectangle) => ({ ...rectangle })),
                        bounds: groupBounds,
                      };
                    }}
                    style={{
                      position: "absolute",
                      right: -7,
                      bottom: -7,
                      width: 12,
                      height: 12,
                      border: "2px solid white",
                      borderRadius: "50%",
                      background: "#1463c7",
                      cursor: "nwse-resize",
                    }}
                  />
                </div>
              )}
              {rectangles.map((rectangle, index) => (
                <div
                  key={index}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    rememberUndoState();
                    setSelectedSymbol(symbol);
                    setSelectedPartIndex(index);
                    event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
                    dragRef.current = {
                      symbol,
                      index,
                      mode: "move",
                      startX: event.clientX,
                      startY: event.clientY,
                      original: rectangle,
                    };
                  }}
                  style={{
                    position: "absolute",
                    zIndex: 2,
                    left: `calc(50% + ${rectangle.x * previewScale - rectangle.width * previewScale / 2}px)`,
                    top: `calc(50% + ${rectangle.y * previewScale - rectangle.height * previewScale / 2}px)`,
                    width: rectangle.width * previewScale,
                    height: rectangle.height * previewScale,
                    minWidth: 3,
                    minHeight: 3,
                    border: "1px solid rgba(220, 0, 0, .8)",
                    background: "rgba(255, 40, 40, .2)",
                    outline: isSelected && selectedPartIndex === index ? "2px solid #1463c7" : "none",
                    outlineOffset: 1,
                    boxSizing: "border-box",
                    cursor: "move",
                    transform: `rotate(${rectangle.angle ?? 0}rad)`,
                    transformOrigin: "center",
                  }}
                >
                  <i
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      rememberUndoState();
                      setSelectedSymbol(symbol);
                      setSelectedPartIndex(index);
                      event.currentTarget.parentElement?.parentElement?.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        symbol,
                        index,
                        mode: "resize",
                        startX: event.clientX,
                        startY: event.clientY,
                        original: rectangle,
                      };
                    }}
                    style={{
                      position: "absolute",
                      right: -5,
                      bottom: -5,
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: "#d60000",
                      cursor: "nwse-resize",
                    }}
                  />
                </div>
              ))}
              <b style={{ position: "absolute", left: 6, top: 4, fontSize: 16, pointerEvents: "none", userSelect: "none" }}>{symbol}</b>
              <small style={{ position: "absolute", right: 6, top: 5, pointerEvents: "none", userSelect: "none" }}>{rectangles.length}조각</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
