package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** GameRoomService(대전 결과), SoloResultService(솔로 결과), RankingService(집계) 3곳이 공유한다(plan.md Structure Decision). */
public interface GameResultRepository extends JpaRepository<GameResult, Long> {

    /**
     * 랭킹 조회 결과 프로젝션. 대전은 SUM(score)=승수를, 솔로는 유저별 최저 점수를 score에 담는다 —
     * 두 경우를 같은 모양으로 매핑해 GameResultService가 게임 종류별 분기 없이 바로 RankedPlayer로
     * 옮길 수 있게 한다. 순위는 DB가 윈도우 함수로 직접 매긴 값이라 애플리케이션에서 다시 계산하지
     * 않는다. 탈퇴 회원(users.deleted_at IS NOT NULL, FR-007)은 두 쿼리 모두 users 조인으로 걸러진다.
     */
    interface RankedRow {

        Long getUserId();

        String getNickname();

        Integer getScore();

        Integer getRank();
    }

    /**
     * 대전 상위 N명 + 본인(순위 무관) 한 번에 조회. idx_game_result_type_user_score(game_type,
     * user_id, score) 커버링 인덱스로 GROUP BY까지는 game_results 본 테이블을 다시 찾아가지 않고
     * 인덱스만으로 처리되고, 그 결과(유저 수만큼의 행)에 ROW_NUMBER()로 순위를 매긴 뒤 상위 N행과
     * 본인 행만 걸러낸다 — 동률이어도 순번을 공유하지 않는다(승수 같으면 패수 적은 쪽이 우선).
     */
    @Query(
            value = """
                    SELECT userId, nickname, score, rnk AS `rank` FROM (
                        SELECT gr.user_id AS userId, u.nickname AS nickname, SUM(gr.score) AS score,
                               ROW_NUMBER() OVER (
                                   ORDER BY SUM(gr.score) DESC, (COUNT(*) - SUM(gr.score)) ASC, gr.user_id ASC
                               ) AS rnk
                        FROM game_results gr
                        JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                        WHERE gr.game_type = :gameType
                        GROUP BY gr.user_id, u.nickname
                    ) ranked
                    WHERE rnk <= :topN OR userId = :requesterId
                    ORDER BY rnk ASC
                    """,
            nativeQuery = true)
    List<RankedRow> findDuelRanked(
            @Param("gameType") String gameType, @Param("requesterId") Long requesterId, @Param("topN") int topN);

    /**
     * 솔로 상위 N명 + 본인(순위 무관) 한 번에 조회. 최저 점수 오름차순, 동률은 RANK()로 같은 순위
     * 라벨을 공유한다(공동 순위) — 다만 "상위 N행에 넣을지"는 그 공유 순위가 아니라 ROW_NUMBER()로
     * 정한 결정론적 위치(pos) 기준이다. 그렇지 않으면 동률 인원이 N명을 넘을 때(예: N명 넘게 공동
     * 1위) top 목록이 N행을 훌쩍 넘겨버린다 — "동률이면 같은 순위 번호를 표시"와 "상위 N개만 보여준다"
     * 는 서로 다른 기준이라 분리했다.
     */
    @Query(
            value = """
                    SELECT userId, nickname, score, rnk AS `rank` FROM (
                        SELECT gr.user_id AS userId, u.nickname AS nickname, MIN(gr.score) AS score,
                               RANK() OVER (ORDER BY MIN(gr.score) ASC) AS rnk,
                               ROW_NUMBER() OVER (ORDER BY MIN(gr.score) ASC, gr.user_id ASC) AS pos
                        FROM game_results gr
                        JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                        WHERE gr.game_type = :gameType
                        GROUP BY gr.user_id, u.nickname
                    ) ranked
                    WHERE pos <= :topN OR userId = :requesterId
                    ORDER BY pos ASC
                    """,
            nativeQuery = true)
    List<RankedRow> findSoloRanked(
            @Param("gameType") String gameType, @Param("requesterId") Long requesterId, @Param("topN") int topN);
}
