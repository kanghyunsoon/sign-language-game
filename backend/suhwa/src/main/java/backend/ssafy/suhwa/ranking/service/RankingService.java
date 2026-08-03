package backend.ssafy.suhwa.ranking.service;

import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.dto.DuelAggregate;
import backend.ssafy.suhwa.gameresult.dto.SoloBestScore;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.ranking.dto.RankingEntry;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.service.UserService;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingService {

    private static final int TOP_N = 5;

    private final GameResultService gameResultService;
    private final UserService userService;

    public RankingResponse getRankings(Long requesterId, GameResultType gameType) {
        return gameType == GameResultType.TETRIS_SOLO
                ? getSoloRankings(requesterId)
                : getDuelRankings(requesterId, gameType);
    }

    private RankingResponse getSoloRankings(Long requesterId) {
        List<SoloBestScore> bestScores =
                gameResultService.findBestScoresByGameType(GameResultType.TETRIS_SOLO);
        Set<Long> userIds =
                bestScores.stream().map(SoloBestScore::getUserId).collect(Collectors.toSet());
        Map<Long, User> activeUsers = activeUsers(userIds);

        List<Scored> scored = bestScores.stream()
                .filter(row -> activeUsers.containsKey(row.getUserId()))
                .map(row -> new Scored(
                        row.getUserId(),
                        activeUsers.get(row.getUserId()).getNickname(),
                        row.getScore(),
                        0))
                .sorted(Comparator.comparingInt(Scored::score).thenComparing(Scored::userId))
                .toList();

        List<RankingEntry> ranked = rank(scored, true);
        return response(ranked, requesterId);
    }

    private RankingResponse getDuelRankings(Long requesterId, GameResultType gameType) {
        List<DuelAggregate> aggregates = gameResultService.findDuelAggregatesByGameType(gameType);
        Set<Long> userIds =
                aggregates.stream().map(DuelAggregate::getUserId).collect(Collectors.toSet());
        Map<Long, User> activeUsers = activeUsers(userIds);

        List<Scored> scored = aggregates.stream()
                .filter(row -> activeUsers.containsKey(row.getUserId()))
                .map(row -> {
                    int wins = row.getWins();
                    int losses = (int) (row.getGames() - row.getWins());
                    return new Scored(
                            row.getUserId(),
                            activeUsers.get(row.getUserId()).getNickname(),
                            wins,
                            losses);
                })
                .sorted(Comparator.comparingInt(Scored::score)
                        .reversed()
                        .thenComparingInt(Scored::tieBreak)
                        .thenComparing(Scored::userId))
                .toList();

        return response(rank(scored, false), requesterId);
    }

    private Map<Long, User> activeUsers(Set<Long> userIds) {
        return userService.findActiveByIds(userIds).stream()
                .collect(Collectors.toMap(User::getId, user -> user));
    }

    private List<RankingEntry> rank(List<Scored> scored, boolean shareScoreRank) {
        int lastRank = 0;
        Integer lastScore = null;
        java.util.ArrayList<RankingEntry> ranked = new java.util.ArrayList<>(scored.size());
        for (int i = 0; i < scored.size(); i++) {
            Scored row = scored.get(i);
            if (!shareScoreRank || lastScore == null || row.score() != lastScore) {
                lastRank = i + 1;
            }
            ranked.add(new RankingEntry(lastRank, row.userId(), row.nickname(), row.score()));
            lastScore = row.score();
        }
        return ranked;
    }

    private RankingResponse response(List<RankingEntry> ranked, Long requesterId) {
        List<RankingEntry> top = ranked.stream().limit(TOP_N).toList();
        RankingEntry me = ranked.stream()
                .filter(entry -> entry.userId().equals(requesterId))
                .findFirst()
                .orElse(null);
        return new RankingResponse(top, me);
    }

    private record Scored(Long userId, String nickname, int score, int tieBreak) {
    }
}
