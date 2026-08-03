package backend.ssafy.suhwa.gameresult.dto;

/**
 * 랭킹 조회 결과 한 행. score는 게임 종류에 따라 승수(대전) 또는 최저 점수(솔로)를 담고, rank는
 * DB가 윈도우 함수(ROW_NUMBER/RANK)로 직접 매긴 순위다 — 애플리케이션에서 "나보다 나은 유저 수"를
 * 별도로 세지 않는다.
 */
public record RankedPlayer(int rank, Long userId, String nickname, int score) {
}
