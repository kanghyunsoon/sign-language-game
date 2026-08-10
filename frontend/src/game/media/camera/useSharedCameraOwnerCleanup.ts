import {useEffect,useRef} from "react";
import type {SharedGameCameraSession} from "./SharedGameCameraSession";

/** Releases an owner-scoped shared camera without treating React StrictMode's effect probe as a real unmount. */
export function useSharedCameraOwnerCleanup(cameraSession:SharedGameCameraSession,onRelease?:()=>void):void{
  const generationRef=useRef(0),releaseRef=useRef(onRelease);releaseRef.current=onRelease;
  useEffect(()=>{generationRef.current+=1;return()=>{const generation=++generationRef.current;queueMicrotask(()=>{if(generationRef.current!==generation)return;cameraSession.stop();releaseRef.current?.();});};},[cameraSession]);
}
