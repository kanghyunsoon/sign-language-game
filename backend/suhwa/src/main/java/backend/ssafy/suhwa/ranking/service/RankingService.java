package backend.ssafy.suhwa.ranking.service;

import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.dto.RankedPlayer;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.ranking.dto.RankingEntry;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세 게임 종류가 완전히 분리된 랭킹을 game_results 집계로 산정한다(FR-025/026/029). 대전 모드는
 * 승수(SUM) 내림차순, 동률이면 패수 오름차순으로 정렬하고(동률도 순번을 나눠 갖지 않는다), 솔로는
 * 유저별 최저 점수 오름차순으로 정렬하며 동률은 같은 순위를 공유한다(공동 순위).
 *
 * <p>순위 계산 자체를 DB의 윈도우 함수(ROW_NUMBER/RANK)에 맡긴다 — 애플리케이션은
 * GameResultService가 돌려주는 상위 N명 + 본인 1명분(둘이 겹치면 그만큼 더 적은) 행만 다루고,
 * "나보다 나은 유저 수"를 별도로 세지 않는다. 탈퇴 회원 제외(FR-007)는 그 쿼리 안의 users 조인이
 * 대신한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingService {

    private static final int TOP_N = 5;

    private final GameResultService gameResultService;

    public RankingResponse getRankings(Long requesterId, GameResultType gameType) {
        List<RankedPlayer> rows = gameType == GameResultType.TETRIS_SOLO
                ? gameResultService.findSoloRanked(gameType, requesterId, TOP_N)
                : gameResultService.findDuelRanked(gameType, requesterId, TOP_N);
        return toResponse(rows, requesterId);
    }

    /**
     * 리포지토리 쿼리는 "상위 N행(위치 기준) + 본인 행(있다면)"을 위치 오름차순으로 돌려준다. 동률이
     * 공유하는 표시 순위(RankedPlayer.rank)로 자르면 안 된다 — 동률 인원이 N명을 넘을 때 그 라벨이
     * N보다 작은 행이 N개를 훌쩍 넘을 수 있기 때문이다(공동 1등이 N+1명이면 전부 rank=1).
     * 본인이 상위 N위 밖이면 그 행은 위치상 항상 맨 뒤에 붙어 오므로, 행 수가 N을 넘는지만 보면
     * "마지막 한 행이 본인용으로 추가된 행"인지 구분할 수 있다.
     */
    private RankingResponse toResponse(List<RankedPlayer> rows, Long requesterId) {
        List<RankedPlayer> topRows = rows.size() > TOP_N ? rows.subList(0, TOP_N) : rows;
        List<RankingEntry> top = topRows.stream().map(this::toEntry).toList();
        RankingEntry me = rows.stream()
                .filter(r -> r.userId().equals(requesterId))
                .findFirst()
                .map(this::toEntry)
                .orElse(null);
        return new RankingResponse(top, me);
    }

    private RankingEntry toEntry(RankedPlayer r) {
        return new RankingEntry(r.rank(), r.userId(), r.nickname(), r.score());
    }
}
