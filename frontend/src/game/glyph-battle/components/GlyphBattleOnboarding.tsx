import { useState } from "react";
import styles from "../pages/LineRaceGamePage.module.css";

const STORAGE_KEY="glyph-turn-battle-tutorial-v1";
const STEPS=[
  {eyebrow:"1 · 동시 선택",title:"상대에게 보이지 않게 고릅니다",body:"기술 카드의 지문자를 만들면 선택이 잠깁니다. 두 사람의 선택은 모두 확정된 뒤 동시에 공개됩니다."},
  {eyebrow:"2 · 역할",title:"글자 모양이 기술 역할이 됩니다",body:"닫힌 ㅇ·ㅁ은 방어, 모음 획은 집중, 각진 자음은 공격, 강한 자음은 필살 기술입니다."},
  {eyebrow:"3 · 상성",title:"획 → 결 → 울림 → 획",body:"공격의 획은 방어의 결을 깨고, 결은 울림을 막고, 울림은 획의 흐름을 흩뜨립니다."},
  {eyebrow:"4 · 승리",title:"두 라운드를 먼저 가져가세요",body:"기술 공개 후 피해·보호막·집중력을 동시에 판정합니다. 상대 체력을 0으로 만들면 라운드 승리입니다."},
] as const;

export function GlyphBattleOnboarding(){
  const[open,setOpen]=useState(()=>firstVisit()),[step,setStep]=useState(0),item=STEPS[step]!;
  const close=()=>{setOpen(false);try{localStorage.setItem(STORAGE_KEY,"done");}catch{/* storage may be unavailable */}};
  return <><button type="button" className={styles.tutorialButton} onClick={()=>{setStep(0);setOpen(true);}}>게임 방법</button>{open?<div className={styles.tutorialBackdrop} role="dialog" aria-modal="true" aria-labelledby="glyph-tutorial-title"><section className={styles.tutorialCard}><span>{item.eyebrow}</span><div className={styles.tutorialSketch} data-step={step}>{step===0?"?  +  ?":step===1?"ㅇ  ㅣ  ㄱ  ㅋ":step===2?"획  ›  결  ›  울림": "2 ROUND WIN"}</div><h2 id="glyph-tutorial-title">{item.title}</h2><p>{item.body}</p><div className={styles.tutorialDots}>{STEPS.map((_,index)=><i key={index} data-active={index===step}/>)}</div><div className={styles.tutorialActions}>{step>0?<button type="button" onClick={()=>setStep(value=>value-1)}>이전</button>:<span/>}<button type="button" onClick={()=>step===STEPS.length-1?close():setStep(value=>value+1)}>{step===STEPS.length-1?"배틀 시작":"다음"}</button></div></section></div>:null}</>;
}
function firstVisit():boolean{try{return localStorage.getItem(STORAGE_KEY)!=="done";}catch{return true;}}
