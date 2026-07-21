import { useEffect, useState } from "react";

export type LineRaceMotionMode = "FULL" | "REDUCED";
export function resolveLineRaceMotionMode(media: Pick<MediaQueryList,"matches"> | null): LineRaceMotionMode { return media?.matches ? "REDUCED" : "FULL"; }
export function useLineRaceMotionMode(): LineRaceMotionMode {
  const query = "(prefers-reduced-motion: reduce)";
  const [mode,setMode]=useState<LineRaceMotionMode>(()=>resolveLineRaceMotionMode(typeof matchMedia === "undefined"?null:matchMedia(query)));
  useEffect(()=>{if(typeof matchMedia === "undefined")return;const media=matchMedia(query),update=()=>setMode(resolveLineRaceMotionMode(media));update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update)},[]);
  return mode;
}
