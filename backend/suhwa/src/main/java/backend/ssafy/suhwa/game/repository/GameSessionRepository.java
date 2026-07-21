package backend.ssafy.suhwa.game.repository;

import backend.ssafy.suhwa.game.domain.GameSession;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameSessionRepository extends JpaRepository<GameSession, Long> {
}
