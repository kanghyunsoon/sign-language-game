package backend.ssafy.suhwa.gameresult.dto;

/** 상위 N명/본인 랭킹 조회 결과. score는 게임 종류에 따라 승수(대전) 또는 최저 점수(솔로)를 담는다. */
public record RankedPlayer(Long userId, String nickname, int score) {
}
