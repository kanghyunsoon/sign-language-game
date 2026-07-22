package backend.ssafy.suhwa.game.repository;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface GameRoomRepository extends JpaRepository<GameRoom, Long> {

    Optional<GameRoom> findByRoomCode(String roomCode);

    boolean existsByRoomCode(String roomCode);

    List<GameRoom> findByStatusAndUpdatedAtBefore(GameRoomStatus status, LocalDateTime threshold);

    List<GameRoom> findByStatus(GameRoomStatus status);

    /**
     * 서버 재시작 시 인메모리 실시간 상태가 모두 사라져 신뢰할 수 없는 WAITING/IN_PROGRESS 방을
     * 일괄 CLOSED로 전환한다(FR-028, research.md #4).
     */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE GameRoom g SET g.status = backend.ssafy.suhwa.game.domain.GameRoomStatus.CLOSED "
            + "WHERE g.status IN (backend.ssafy.suhwa.game.domain.GameRoomStatus.WAITING, "
            + "backend.ssafy.suhwa.game.domain.GameRoomStatus.IN_PROGRESS)")
    int closeAllActiveRooms();
}
