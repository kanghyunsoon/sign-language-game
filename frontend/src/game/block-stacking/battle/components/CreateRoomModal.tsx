import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { isCompetitiveRecognitionReady } from "../../../recognition/readiness/recognitionReadiness";
import type { CreateRoomRequest } from "../room";
import styles from "./BattleRoomUi.module.css";

const ready = (symbols: readonly string[]) => symbols.filter(isCompetitiveRecognitionReady);

const SYMBOL_RANGES = [
  { value: "CONSONANTS", label: "자음", symbols: ready(["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]) },
  { value: "VOWELS", label: "모음", symbols: ready(["ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ"]) },
  { value: "BASIC", label: "기초 혼합", symbols: ready(["ㄱ", "ㄴ", "ㄷ", "ㅏ", "ㅓ", "ㅗ", "ㅜ"]) },
] as const;

export interface CreateRoomModalProps {
  readonly open: boolean;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (request: CreateRoomRequest) => void;
}

export function CreateRoomModal({ open, submitting, onClose, onSubmit }: CreateRoomModalProps) {
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("EASY");
  const [range, setRange] = useState<(typeof SYMBOL_RANGES)[number]["value"]>("BASIC");
  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const selected = SYMBOL_RANGES.find((option) => option.value === range) ?? SYMBOL_RANGES[2];
    if (title.trim()) onSubmit({ title: title.trim(), difficulty, symbolRange: selected.symbols });
  };

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-room-title">
        <header><div><span>1:1 대전</span><h2 id="create-room-title">새 방 만들기</h2></div><button type="button" className={styles.iconButton} aria-label="닫기" onClick={onClose}><X aria-hidden="true" /></button></header>
        <form onSubmit={submit}>
          <label>방 제목<input value={title} maxLength={30} required autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="예: 입문 자음 연습" /></label>
          <label>난이도<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="EASY">입문</option><option value="NORMAL">보통</option><option value="HARD">어려움</option></select></label>
          <fieldset><legend>출제 범위</legend>{SYMBOL_RANGES.map((option) => <label key={option.value} className={styles.radioOption}><input type="radio" name="symbolRange" value={option.value} checked={range === option.value} onChange={() => setRange(option.value)} /><span><strong>{option.label}</strong><small>{option.symbols.join(" ")}</small></span></label>)}</fieldset>
          <div className={styles.modalActions}><button type="button" onClick={onClose}>취소</button><button type="submit" className={styles.primaryButton} disabled={submitting || !title.trim()}>{submitting ? "생성 중" : "방 만들기"}</button></div>
        </form>
      </section>
    </div>
  );
}
