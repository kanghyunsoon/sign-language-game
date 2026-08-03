package backend.ssafy.suhwa.ranking.service;

import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.dto.DuelSelfAggregate;
import backend.ssafy.suhwa.gameresult.dto.RankedPlayer;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.ranking.dto.RankingEntry;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세 게임 종류가 완전히 분리된 랭킹을 game_results 집계로 산정한다(FR-025/026/029). 대전 모드는
 * 승수(SUM) 내림차순, 동률이면 패수 오름차순으로 정렬하고(동률도 순번을 나눠 갖지 않는다), 솔로는
 * 유저별 최저 점수 오름차순으로 정렬하며 동률은 같은 순위를 공유한다(공동 순위).
 *
 * <p>이전에는 game_type 전체 기록(또는 전체 유저 집계)을 애플리케이션으로 가져와 Java에서
 * 정렬·순위를 매겼다. 사용자 수가 늘면 "상위 5명만 보여주면 되는" 요청 하나가 전체 유저 수만큼의
 * 행을 오가게 되는 게 문제였다. 지금은 상위 N명과 "나" 한 명분의 집계만 SQL이 직접 골라 돌려주고
 * (GameResultService의 Top N/self/rank-count 쿼리, 커버링 인덱스로 뒷받침됨), 애플리케이션은 그
 * 소수의 행만 다룬다. 탈퇴 회원 제외(FR-007)는 그 쿼리들 안의 users 조인이 대신한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingService {

    private static final int TOP_N = 5;
    private static final Pageable TOP_N_PAGE = PageRequest.of(0, TOP_N);

    private final GameResultService gameResultService;

    public RankingResponse getRankings(Long requesterId, GameResultType gameType) {
        return gameType == GameResultType.TETRIS_SOLO
                ? soloRankings(requesterId, gameType)
                : duelRankings(requesterId, gameType);
    }

    private RankingResponse duelRankings(Long requesterId, GameResultType gameType) {
        List<RankingEntry> top = toSequentialEntries(gameResultService.findDuelTopRanked(gameType, TOP_N_PAGE));

        DuelSelfAggregate self = gameResultService.findDuelSelf(gameType, requesterId).orElse(null);
        if (self == null) {
            return new RankingResponse(top, null);
        }
        long betterCount = gameResultService.countDuelUsersRankedAbove(gameType, self.wins(), self.losses());
        RankingEntry me = new RankingEntry((int) betterCount + 1, self.userId(), self.nickname(), self.wins());
        return new RankingResponse(top, me);
    }

    private RankingResponse soloRankings(Long requesterId, GameResultType gameType) {
        List<RankingEntry> top = toSharedRankEntries(gameResultService.findSoloTopRanked(gameType, TOP_N_PAGE));

        RankedPlayer self = gameResultService.findSoloSelf(gameType, requesterId).orElse(null);
        if (self == null) {
            return new RankingResponse(top, null);
        }
        long betterCount = gameResultService.countSoloUsersRankedAbove(gameType, self.score());
        RankingEntry me = new RankingEntry((int) betterCount + 1, self.userId(), self.nickname(), self.score());
        return new RankingResponse(top, me);
    }

    /** 대전 순위는 동률이어도 순번을 공유하지 않는다 — DB가 이미 승/패 기준으로 결정론적 순서를 매겨 돌려준다. */
    private List<RankingEntry> toSequentialEntries(List<RankedPlayer> ranked) {
        List<RankingEntry> entries = new ArrayList<>(ranked.size());
        for (int i = 0; i < ranked.size(); i++) {
            RankedPlayer r = ranked.get(i);
            entries.add(new RankingEntry(i + 1, r.userId(), r.nickname(), r.score()));
        }
        return entries;
    }

    /** 솔로 순위는 점수가 같으면 같은 순위를 공유한다(공동 순위). */
    private List<RankingEntry> toSharedRankEntries(List<RankedPlayer> ranked) {
        List<RankingEntry> entries = new ArrayList<>(ranked.size());
        int lastRank = 0;
        Integer lastScore = null;
        for (int i = 0; i < ranked.size(); i++) {
            RankedPlayer r = ranked.get(i);
            if (lastScore == null || r.score() != lastScore) {
                lastRank = i + 1;
            }
            entries.add(new RankingEntry(lastRank, r.userId(), r.nickname(), r.score()));
            lastScore = r.score();
        }
        return entries;
    }
}
