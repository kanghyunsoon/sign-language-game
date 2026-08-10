import { useState } from "react";
import type { CreateLineRaceRoomOptions } from "../room";
import { createDefaultJamoObstacleRegistry } from "../obstacle";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition";
import styles from "./LineRaceRoom.module.css";

const registrySymbols = createDefaultJamoObstacleRegistry().getSupportedSymbols();
export const LINE_RACE_SYMBOLS: readonly string[] = COMPETITIVE_RECOGNITION_SYMBOLS.filter((symbol) => registrySymbols.includes(symbol));

export function LineRaceCreateRoomForm({ submitting, onSubmit }: { submitting: boolean; onSubmit: (request: CreateLineRaceRoomOptions) => void }) {
  const [title,setTitle]=useState("지문자 레이스"); const [visibility,setVisibility]=useState<"PUBLIC"|"PRIVATE">("PUBLIC");
  const [duration,setDuration]=useState(60_000); const [symbols,setSymbols]=useState<readonly string[]>(LINE_RACE_SYMBOLS);
  const toggle=(symbol:string)=>setSymbols((current)=>current.includes(symbol)?current.filter((item)=>item!==symbol):[...current,symbol]);
  const valid=title.trim().length>=2&&symbols.length>=2;
  return <form className={styles.form} onSubmit={(event)=>{event.preventDefault();if(valid)onSubmit({title,visibility,matchDurationMs:duration,supportedSymbols:symbols});}}>
    <label>방 제목<input value={title} maxLength={30} onChange={(event)=>setTitle(event.target.value)}/></label>
    <label>공개 설정<select value={visibility} onChange={(event)=>setVisibility(event.target.value as "PUBLIC"|"PRIVATE")}><option value="PUBLIC">공개방</option><option value="PRIVATE">비공개방</option></select></label>
    <label>경기 시간<select value={duration} onChange={(event)=>setDuration(Number(event.target.value))}><option value={30_000}>30초</option><option value={60_000}>60초</option><option value={90_000}>90초</option></select></label>
    <fieldset><legend>사용 지문자 · 최소 2개</legend><div className={styles.symbols}>{LINE_RACE_SYMBOLS.map((symbol)=><label key={symbol}><input type="checkbox" checked={symbols.includes(symbol)} onChange={()=>toggle(symbol)}/>{symbol}</label>)}</div></fieldset>
    <button className={styles.primary} disabled={!valid||submitting}>{submitting?"생성 중…":"라인 레이스 방 만들기"}</button>
  </form>;
}
