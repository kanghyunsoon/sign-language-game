package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** GameRoomService(대전 결과), SoloResultService(솔로 결과), RankingService(집계) 3곳이 공유한다(plan.md Structure Decision). */
public interface GameResultRepository extends JpaRepository<GameResult, Long> {

    /**
     * 상위 N명/본인 랭킹 조회 결과 프로젝션. 대전은 SUM(score)=승수를, 솔로는 유저별 최저 점수를
     * score에 담는다 — 두 경우를 같은 모양으로 매핑해 GameResultService가 게임 종류별 분기 없이
     * 바로 RankedPlayer로 옮길 수 있게 한다. 탈퇴 회원(users.deleted_at IS NOT NULL, FR-007)은
     * 아래 모든 쿼리에서 users 조인으로 걸러진다.
     */
    interface RankedRow {

        Long getUserId();

        String getNickname();

        Integer getScore();
    }

    /** 대전 "나" 조회 전용 — 순위(betterCount) 계산에 승/패 두 값이 다 필요해 RankedRow보다 필드가 하나 더 많다. */
    interface DuelSelfRow {

        Long getUserId();

        String getNickname();

        Integer getWins();

        Integer getLosses();
    }

    /**
     * 대전 상위 N명. idx_game_result_type_user_score(game_type, user_id, score) 커버링 인덱스로
     * WHERE/GROUP BY까지는 game_results 본 테이블을 다시 찾아가지 않고 인덱스만으로 처리된다.
     */
    @Query(
            value = """
                    SELECT gr.user_id AS userId, u.nickname AS nickname, SUM(gr.score) AS score
                    FROM game_results gr
                    JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                    WHERE gr.game_type = :gameType
                    GROUP BY gr.user_id, u.nickname
                    ORDER BY SUM(gr.score) DESC, (COUNT(*) - SUM(gr.score)) ASC, gr.user_id ASC
                    """,
            nativeQuery = true)
    List<RankedRow> findDuelTopRanked(@Param("gameType") String gameType, Pageable pageable);

    @Query(
            value = """
                    SELECT gr.user_id AS userId, u.nickname AS nickname,
                           SUM(gr.score) AS wins, (COUNT(*) - SUM(gr.score)) AS losses
                    FROM game_results gr
                    JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                    WHERE gr.game_type = :gameType AND gr.user_id = :userId
                    GROUP BY gr.user_id, u.nickname
                    """,
            nativeQuery = true)
    Optional<DuelSelfRow> findDuelSelf(@Param("gameType") String gameType, @Param("userId") Long userId);

    /** 나보다 승/패가 더 좋은(=나를 outrank하는) 활성 유저 수. RankingEntry.rank는 이 값 + 1이다. */
    @Query(
            value = """
                    SELECT COUNT(*) FROM (
                        SELECT gr.user_id,
                               SUM(gr.score) AS wins,
                               (COUNT(*) - SUM(gr.score)) AS losses
                        FROM game_results gr
                        JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                        WHERE gr.game_type = :gameType
                        GROUP BY gr.user_id
                        HAVING SUM(gr.score) > :myWins
                            OR (SUM(gr.score) = :myWins AND (COUNT(*) - SUM(gr.score)) < :myLosses)
                    ) ranked
                    """,
            nativeQuery = true)
    long countDuelUsersRankedAbove(
            @Param("gameType") String gameType, @Param("myWins") int myWins, @Param("myLosses") int myLosses);

    /** 솔로 상위 N명 — 유저별 최저 점수(공동 1등 가능)를 기준으로 오름차순 정렬한다. */
    @Query(
            value = """
                    SELECT gr.user_id AS userId, u.nickname AS nickname, MIN(gr.score) AS score
                    FROM game_results gr
                    JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                    WHERE gr.game_type = :gameType
                    GROUP BY gr.user_id, u.nickname
                    ORDER BY MIN(gr.score) ASC, gr.user_id ASC
                    """,
            nativeQuery = true)
    List<RankedRow> findSoloTopRanked(@Param("gameType") String gameType, Pageable pageable);

    @Query(
            value = """
                    SELECT gr.user_id AS userId, u.nickname AS nickname, MIN(gr.score) AS score
                    FROM game_results gr
                    JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                    WHERE gr.game_type = :gameType AND gr.user_id = :userId
                    GROUP BY gr.user_id, u.nickname
                    """,
            nativeQuery = true)
    Optional<RankedRow> findSoloSelf(@Param("gameType") String gameType, @Param("userId") Long userId);

    /** 나보다 점수가 더 낮은(=더 잘한) 활성 유저 수. 동률은 같은 순위를 공유하므로 세지 않는다. */
    @Query(
            value = """
                    SELECT COUNT(*) FROM (
                        SELECT gr.user_id, MIN(gr.score) AS best
                        FROM game_results gr
                        JOIN users u ON u.id = gr.user_id AND u.deleted_at IS NULL
                        WHERE gr.game_type = :gameType
                        GROUP BY gr.user_id
                        HAVING MIN(gr.score) < :myScore
                    ) ranked
                    """,
            nativeQuery = true)
    long countSoloUsersRankedAbove(@Param("gameType") String gameType, @Param("myScore") int myScore);
}
