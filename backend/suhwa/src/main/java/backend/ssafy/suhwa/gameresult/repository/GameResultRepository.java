package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import org.springframework.data.jpa.repository.JpaRepository;

/** GameRoomService(대전 결과), SoloResultService(솔로 결과), RankingService(집계) 3곳이 공유한다(plan.md Structure Decision). */
public interface GameResultRepository extends JpaRepository<GameResult, Long> {
}
