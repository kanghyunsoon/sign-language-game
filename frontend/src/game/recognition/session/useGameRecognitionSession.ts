import { useEffect, useMemo, useRef } from "react";
import type { SharedGameCameraSession } from "../../media/camera/SharedGameCameraSession";
import type { ActivePlayerSession } from "../active-player";
import { DefaultGameRecognitionSession, DEFAULT_GAME_RECOGNITION_OPTIONS } from "./DefaultGameRecognitionSession";
import type { GameRecognitionBackend, GameRecognitionSessionOptions } from "./GameRecognitionSession";
export function useGameRecognitionSession(recognizer:GameRecognitionBackend,cameraSession:SharedGameCameraSession,activePlayerSession?:ActivePlayerSession,overrides:Partial<Omit<GameRecognitionSessionOptions,"cameraSession">>={}){
  const session=useMemo(()=>new DefaultGameRecognitionSession(recognizer,activePlayerSession),[activePlayerSession,recognizer]);
  const cleanupGenerationRef=useRef(0);
  useEffect(()=>{
    cleanupGenerationRef.current+=1;
    const options={...DEFAULT_GAME_RECOGNITION_OPTIONS(cameraSession),...overrides};
    void session.start(options).catch(()=>undefined);
    return()=>{const cleanupGeneration=++cleanupGenerationRef.current;queueMicrotask(()=>{if(cleanupGenerationRef.current===cleanupGeneration)void session.dispose();});};
  },[cameraSession,session]);
  return session;
}
