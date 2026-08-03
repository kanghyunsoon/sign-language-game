import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SYMBOL_RANGE_OPTIONS, type CreateRoomRequest, type SymbolRange } from "../room";
import styles from "./BattleRoomUi.module.css";

export interface CreateRoomModalProps {
  readonly open: boolean;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (request: CreateRoomRequest) => void;
}

export function CreateRoomModal({ open, submitting, onClose, onSubmit }: CreateRoomModalProps) {
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<SymbolRange>("ALL");
  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) onSubmit({ roomTitle: title.trim(), symbolRange: range });
  };

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-room-title">
        <header><div><span>1:1 대전</span><h2 id="create-room-title">새 방 만들기</h2></div><button type="button" className={styles.iconButton} aria-label="닫기" onClick={onClose}><X aria-hidden="true" /></button></header>
        <form onSubmit={submit}>
          <label>방 제목<input value={title} maxLength={30} required autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="예: 입문 자음 연습" /></label>
          <fieldset><legend>출제 범위</legend>{SYMBOL_RANGE_OPTIONS.map((option) => <label key={option.value} className={styles.radioOption}><input type="radio" name="symbolRange" value={option.value} checked={range === option.value} onChange={() => setRange(option.value)} /><span><strong>{option.label}</strong><small>{option.symbols.join(" ")}</small></span></label>)}</fieldset>
          <div className={styles.modalActions}><button type="button" onClick={onClose}>취소</button><button type="submit" className={styles.primaryButton} disabled={submitting || !title.trim()}>{submitting ? "생성 중" : "방 만들기"}</button></div>
        </form>
      </section>
    </div>
  );
}
