import type { LocalLineRaceGatewaySnapshot } from "../transport";
import type { LineRaceInputState } from "../recognition";
import type { LineRaceUserFeedbackView } from "../feedback";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import { describeGlyphRule, getGlyphCombatRule } from "../duel/GlyphCombatRules";
import styles from "./LineRaceRecognition.module.css";

export function LineRaceAttackHand({ gateway, input, now, userFeedback, duelView, onDevSelect }: {
  readonly gateway: LocalLineRaceGatewaySnapshot;
  readonly input: LineRaceInputState;
  readonly now: number;
  readonly userFeedback: LineRaceUserFeedbackView;
  readonly duelView?: GlyphDuelView;
  readonly onDevSelect?: (symbol:string)=>void;
}) {
  const coolingDown = now < gateway.attackCooldownEndsAt;
  const selectionLocked = duelView?.phase === "WAITING" || duelView?.phase === "REVEAL";
  const charging = input.chargingSelection;
  const opponentStatus = duelView?.phase === "WAITING" ? "상대 선택 대기" : "상대 선택 중";
  return <section className={`${styles.panel} ${styles.movePanel}`} aria-labelledby="glyph-move-title">
    <div className={styles.moveHeader}><div><span>TURN {duelView?.turn ?? 1} · {opponentStatus}</span><h2 id="glyph-move-title">기술 선택</h2></div><strong data-phase={duelView?.phase}>{selectionLocked ? "선택 완료" : charging ? "충전 중" : "동시 선택"}</strong></div>
    <p className={styles.turnPrompt}>{charging ? `${charging.symbol} 선택 게이지를 채우는 중입니다.` : duelView?.prompt ?? "카드의 지문자를 만들면 기술이 확정됩니다."}</p>
    <div className={styles.cards} style={{ gridTemplateColumns: `repeat(${Math.max(1, gateway.attackHand.length)}, minmax(0, 1fr))` }}>{gateway.attackHand.map((symbol, index) => {
      const rule = getGlyphCombatRule(symbol);
      const target = !selectionLocked && userFeedback.target.kind === "ATTACK" && userFeedback.target.available && userFeedback.target.symbols.includes(symbol);
      const isCharging = charging?.symbol === symbol;
      const recognizing = isCharging || (["RECOGNIZING", "CONFIRMING"].includes(userFeedback.state) && userFeedback.symbol === symbol);
      const confirmed = userFeedback.state === "CONFIRMED" && userFeedback.symbol === symbol;
      const pending = userFeedback.state === "ACTION_PENDING" && userFeedback.symbol === symbol;
      const succeeded = userFeedback.state === "SUCCESS" && userFeedback.symbol === symbol;
      const consumed = succeeded && gateway.lastConsumedSymbol === symbol;
      const disabled = coolingDown || selectionLocked;
      const status = isCharging ? "선택 게이지 충전 중" : recognizing ? userFeedback.message : confirmed ? "선택 확정 중" : pending ? "서버 판정 중" : succeeded ? "선택 완료" : disabled ? "선택 잠김" : "공격 가능";
      return <article key={`${symbol}-${index}`} data-symbol={symbol} data-role={rule.role} data-feedback={status}
        role={onDevSelect ? "button" : undefined} tabIndex={onDevSelect && !disabled ? 0 : undefined}
        onClick={onDevSelect && !disabled ? ()=>onDevSelect(symbol) : undefined}
        onKeyDown={onDevSelect && !disabled ? event=>{if(event.key==="Enter"||event.key===" ")onDevSelect(symbol);} : undefined}
        className={`${styles.card} ${styles[`role${rule.role}`]} ${target ? styles.target : ""} ${recognizing ? styles.recognized : ""} ${confirmed ? styles.confirmed : ""} ${pending ? styles.pending : ""} ${disabled ? styles.cooldown : ""} ${consumed ? styles.consumed : ""}`}>
        <GlyphCardMark symbol={symbol}/><h3>{rule.label}</h3><small>{describeGlyphRule(rule)}</small><em>{status}</em>
        {recognizing ? <i className={`${styles.cardProgress} ${isCharging ? styles.cardCharge : ""}`} style={isCharging ? { animationDuration: `${Math.max(1, (charging.completesAt - charging.startedAt))}ms` } : { width: `${(userFeedback.recognitionProgress ?? 0) * 100}%` }} /> : null}
      </article>;
    })}</div>
  </section>;
}

function GlyphCardMark({symbol}:{readonly symbol:string}){
  return <strong className={styles.cardGlyphText} lang="ko" aria-label={symbol}>{symbol}</strong>;
}
