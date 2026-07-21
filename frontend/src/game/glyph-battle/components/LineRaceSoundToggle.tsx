import { Volume2, VolumeX } from "lucide-react";
import type { LineRaceFeedbackAudio } from "../feedback";

export function LineRaceSoundToggle({audio,muted,onMutedChange}:{readonly audio:LineRaceFeedbackAudio;readonly muted:boolean;readonly onMutedChange:(muted:boolean)=>void}){
  return <button type="button" aria-pressed={muted} aria-label={muted?"효과음 켜기":"효과음 끄기"} onClick={()=>{audio.unlock();const next=!muted;audio.setMuted(next);onMutedChange(next)}}>
    {muted?<VolumeX aria-hidden="true" size={16}/>:<Volume2 aria-hidden="true" size={16}/>}<span>{muted?"효과음 꺼짐":"효과음 켜짐"}</span>
  </button>;
}
