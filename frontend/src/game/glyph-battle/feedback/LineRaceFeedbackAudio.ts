export type LineRaceSoundCue = "ATTACK_APPROVED" | "OBSTACLE_WARNING" | "COUNTER_SUCCESS" | "COLLISION" | "FINAL_TEN" | "FINISH";

const STORAGE_KEY = "line-race-sound-muted";

export class LineRaceFeedbackAudio {
  private context: AudioContext | null = null;
  private unlocked = false;
  private muted: boolean;
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
    this.muted = storage?.getItem(STORAGE_KEY) === "true";
  }
  isMuted(): boolean { return this.muted; }
  setMuted(value: boolean): void { this.muted = value; this.storage?.setItem(STORAGE_KEY, String(value)); }
  unlock(): void {
    if (this.unlocked || typeof AudioContext === "undefined") return;
    this.context = new AudioContext(); this.unlocked = true; void this.context.resume();
  }
  play(cue: LineRaceSoundCue): void {
    if (this.muted || !this.unlocked || !this.context) return;
    const [frequency, duration, type] = cueDefinition(cue); const now = this.context.currentTime;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.12, now + .015); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(now); oscillator.stop(now + duration + .02);
  }
  dispose(): void { void this.context?.close(); this.context = null; this.unlocked = false; }
}

function cueDefinition(cue: LineRaceSoundCue): [number, number, OscillatorType] {
  if (cue === "ATTACK_APPROVED") return [520, .13, "square"];
  if (cue === "OBSTACLE_WARNING") return [260, .2, "sawtooth"];
  if (cue === "COUNTER_SUCCESS") return [760, .16, "triangle"];
  if (cue === "COLLISION") return [110, .24, "sawtooth"];
  if (cue === "FINAL_TEN") return [420, .12, "square"];
  return [640, .3, "triangle"];
}
