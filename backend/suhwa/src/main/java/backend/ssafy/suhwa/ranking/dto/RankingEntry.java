package backend.ssafy.suhwa.ranking.dto;

/** score는 게임 종류에 따라 승수(대전, SUM) 또는 최고 점수(솔로, MAX)를 의미한다(FR-026/029). */
public record RankingEntry(
        int rank,
        Long userId,
        String nickname,
        int score,
        Long playDurationMs) {

    public RankingEntry(int rank, Long userId, String nickname, int score) {
        this(rank, userId, nickname, score, null);
    }
}
