package backend.ssafy.suhwa.ranking.dto;

import backend.ssafy.suhwa.user.domain.User;

public record RankingEntry(int rank, Long userId, String nickname, int winCount, int lossCount) {

    public static RankingEntry of(int rank, User user) {
        return new RankingEntry(rank, user.getId(), user.getNickname(), user.getWinCount(), user.getLossCount());
    }
}
