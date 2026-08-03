package backend.ssafy.suhwa.gameresult.dto;

/** 대전 "나" 조회 전용 — 순위(betterCount) 계산에 승/패 두 값이 다 필요해 RankedPlayer보다 필드가 하나 더 많다. */
public record DuelSelfAggregate(Long userId, String nickname, int wins, int losses) {
}
