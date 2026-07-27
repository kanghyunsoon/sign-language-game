package backend.ssafy.suhwa.ranking.service;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.ranking.dto.RankingEntry;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.service.UserService;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세 게임 종류가 완전히 분리된 랭킹을 game_results 집계로 산정한다(FR-025/026/029, research.md #5).
 * users.win_count/loss_count는 더 이상 참조하지 않는다(FR-032). 대전 모드는 승수(SUM) 내림차순,
 * 동률이면 패수 오름차순으로 정렬하고(기존 001 동률 규칙과 동일, FR-026), 솔로는 최고 점수(MAX)
 * 내림차순으로 정렬한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingService {

    private static final int TOP_N = 5;

    private final GameResultService gameResultService;
    private final UserService userService;

    public RankingResponse getRankings(Long requesterId, GameResultType gameType) {
        boolean solo = gameType == GameResultType.TETRIS_SOLO;

        Map<Long, List<GameResult>> byUser = gameResultService.findByGameType(gameType).stream()
                .collect(Collectors.groupingBy(GameResult::getUserId));

        // 탈퇴 회원은 User의 @SQLRestriction로 조회 결과에서 이미 제외된다(FR-007).
        // 집계엔 있으나 회원이 조회되지 않는 항목은 아래 activeUsers 매칭에서 자연히 빠진다.
        Map<Long, User> activeUsers = userService.findActiveByIds(byUser.keySet()).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        List<Scored> scored = byUser.entrySet().stream()
                .filter(e -> activeUsers.containsKey(e.getKey()))
                .map(e -> toScored(activeUsers.get(e.getKey()), e.getValue(), solo))
                .sorted(solo
                        ? Comparator.comparingInt(Scored::score).reversed()
                        : Comparator.comparingInt(Scored::score).reversed()
                                .thenComparing(Comparator.comparingInt(Scored::tieBreak)))
                .toList();

        List<RankingEntry> top = new ArrayList<>();
        for (int i = 0; i < Math.min(TOP_N, scored.size()); i++) {
            Scored s = scored.get(i);
            top.add(new RankingEntry(i + 1, s.userId(), s.nickname(), s.score()));
        }

        return new RankingResponse(top, findMe(scored, requesterId, solo));
    }

    private Scored toScored(User user, List<GameResult> rows, boolean solo) {
        if (solo) {
            int best = rows.stream().mapToInt(GameResult::getScore).max().orElse(0);
            return new Scored(user.getId(), user.getNickname(), best, 0);
        }
        int winCount = rows.stream().mapToInt(GameResult::getScore).sum();
        int lossCount = rows.size() - winCount;
        return new Scored(user.getId(), user.getNickname(), winCount, lossCount);
    }

    /** 요청자가 이 게임 종류를 한 번도 플레이하지 않았으면 null(US9 AC4) — 001과 달리 항상 존재하지 않는다. */
    private RankingEntry findMe(List<Scored> scored, Long requesterId, boolean solo) {
        Scored mine = scored.stream().filter(s -> s.userId().equals(requesterId)).findFirst().orElse(null);
        if (mine == null) {
            return null;
        }
        // 동률은 같은 순위를 공유한다(기존 001 countHigherRanked와 동일한 방식) — top 리스트의 순차
        // 번호와는 별개로, "나보다 확실히 나은" 기록 수 + 1로 계산한다.
        long betterCount = scored.stream()
                .filter(s -> !s.userId().equals(requesterId))
                .filter(s -> solo ? s.score() > mine.score() : outranksInDuel(s, mine))
                .count();
        return new RankingEntry((int) betterCount + 1, mine.userId(), mine.nickname(), mine.score());
    }

    private boolean outranksInDuel(Scored candidate, Scored mine) {
        return candidate.score() > mine.score()
                || (candidate.score() == mine.score() && candidate.tieBreak() < mine.tieBreak());
    }

    private record Scored(Long userId, String nickname, int score, int tieBreak) {
    }
}
