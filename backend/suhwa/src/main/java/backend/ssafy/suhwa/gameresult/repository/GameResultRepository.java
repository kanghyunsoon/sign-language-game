package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.dto.SoloBestScore;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** GameRoomService(대전 결과), SoloResultService(솔로 결과), RankingService(집계) 3곳이 공유한다(plan.md Structure Decision). */
public interface GameResultRepository extends JpaRepository<GameResult, Long> {

    /** 랭킹 집계 원본 — 게임 종류별 전체 기록. 교육 프로젝트 규모라 집계는 서비스 계층에서 처리한다. */
    List<GameResult> findByGameType(GameResultType gameType);

    @Query("""
            select result.userId as userId, min(result.score) as score
            from GameResult result
            where result.gameType = :gameType
            group by result.userId
            """)
    List<SoloBestScore> findBestScoresByGameType(
            @Param("gameType") GameResultType gameType);
}
