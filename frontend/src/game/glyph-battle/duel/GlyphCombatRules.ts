export type GlyphAttackKind = "SEAL" | "WAVE" | "CUT" | "BURST";
export type GlyphMoveRole = "ATTACK" | "CONTROL" | "GUARD" | "FOCUS" | "FINISHER";

export interface GlyphCombatRule {
  readonly kind: GlyphAttackKind;
  readonly role: GlyphMoveRole;
  readonly roleLabel: string;
  readonly elementLabel: string;
  readonly label: string;
  readonly basisLabel: string;
  readonly difficulty: 1 | 2 | 3;
  readonly color: number;
  readonly damage: number;
  readonly focusGain: number;
  readonly focusCost: number;
  readonly damageReduction: number;
  readonly focusDrain: number;
}

export function getGlyphCombatRule(symbol: string): GlyphCombatRule {
  const difficulty=getGlyphDifficulty(symbol),scale=difficulty===1?1:difficulty===2?1.14:1.28;
  // 결계는 턴을 막지 않는다. 낮은 빈도의 투사체 제어 카드로만 처리한다.
  if (["ㅇ", "ㅁ"].includes(symbol)) return scaled({ kind:"SEAL", role:"CONTROL", roleLabel:"제어", elementLabel:"결", label:"결계", basisLabel:"닫힌 형태 · 상대를 잠시 가둔다", color:0xa96cff, damage:0, focusGain:8, focusCost:0, damageReduction:0, focusDrain:16 },difficulty,scale);
  if (["ㅋ", "ㅌ", "ㅍ"].includes(symbol)) return scaled({ kind:"SEAL", role:"GUARD", roleLabel:"방어", elementLabel:"방", label:"방패", basisLabel:"가로 획 · 들어오는 힘을 막는다", color:0x4f91ff, damage:0, focusGain:8, focusCost:0, damageReduction:38, focusDrain:0 },difficulty,scale);
  if (["ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ"].includes(symbol)) return scaled({ kind:"WAVE", role:"FOCUS", roleLabel:"집중", elementLabel:"울림", label:"공명", basisLabel:"방향 획 · 힘의 흐름을 모은다", color:0x29d3e2, damage:0, focusGain:26, focusCost:0, damageReduction:0, focusDrain:10 },difficulty,scale);
  if (["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅂ", "ㅅ", "ㅈ"].includes(symbol)) return scaled({ kind:"CUT", role:"ATTACK", roleLabel:"공격", elementLabel:"획", label:"획 베기", basisLabel:"각진 획 · 직접 베어낸다", color:0xff557a, damage:12, focusGain:10, focusCost:0, damageReduction:0, focusDrain:0 },difficulty,scale);
  return scaled({ kind:"BURST", role:"FINISHER", roleLabel:"필살", elementLabel:"무속성", label:"파열", basisLabel:"강한 자음 · 모은 힘을 터뜨린다", color:0xffa32b, damage:20, focusGain:4, focusCost:35, damageReduction:0, focusDrain:0 },difficulty,scale);
}

export function getGlyphDifficulty(symbol:string):1|2|3{
  if(["ㄲ","ㄸ","ㅃ","ㅆ","ㅉ","ㅋ","ㅌ","ㅍ","ㅊ","ㅢ","ㅚ","ㅟ","ㅒ","ㅖ"].includes(symbol))return 3;
  if(["ㄹ","ㅂ","ㅅ","ㅈ","ㅎ","ㅑ","ㅕ","ㅛ","ㅠ","ㅐ","ㅔ"].includes(symbol))return 2;
  return 1;
}

export function elementalModifier(attack: GlyphAttackKind, defense: GlyphAttackKind | null): { readonly multiplier:number; readonly label?:string } {
  if (!defense || attack === "BURST" || defense === "BURST" || attack === defense) return { multiplier:1 };
  if ((attack === "CUT" && defense === "SEAL") || (attack === "SEAL" && defense === "WAVE") || (attack === "WAVE" && defense === "CUT")) return { multiplier:1.3, label:"상성 우위" };
  if ((defense === "CUT" && attack === "SEAL") || (defense === "SEAL" && attack === "WAVE") || (defense === "WAVE" && attack === "CUT")) return { multiplier:.75, label:"효과 감소" };
  return { multiplier:1 };
}

export function describeGlyphRule(rule: GlyphCombatRule): string {
  if (rule.role === "CONTROL") return `상대 집중 ${rule.focusDrain} 감소`;
  if (rule.role === "GUARD") return `다음 피해 ${rule.damageReduction}% 감소`;
  if (rule.role === "FOCUS") return `집중 +${rule.focusGain}`;
  if (rule.role === "FINISHER") return `피해 ${rule.damage} · 집중 ${rule.focusCost} 필요`;
  return `피해 ${rule.damage} · 안정적인 공격`;
}

function scaled(base:Omit<GlyphCombatRule,"difficulty">,difficulty:1|2|3,scale:number):GlyphCombatRule{return{...base,difficulty,damage:Math.round(base.damage*scale),focusGain:Math.round(base.focusGain*scale),damageReduction:Math.round(base.damageReduction*scale)};}
