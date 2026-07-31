package backend.ssafy.suhwa.game.repository;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GameRoomRepository extends JpaRepository<GameRoom, Long> {

    Optional<GameRoom> findByRoomCode(String roomCode);

    boolean existsByRoomCode(String roomCode);

    List<GameRoom> findByStatusAndUpdatedAtBefore(GameRoomStatus status, LocalDateTime threshold);

    List<GameRoom> findByStatus(GameRoomStatus status);

    /**
     * 한 유저가 동시에 활성 방(WAITING/IN_PROGRESS, 즉 CLOSED가 아닌)을 두 개 이상 갖지 못하게
     * create() 앞에서 확인하는 용도(버그픽스). host든 guest든 이미 참여 중인 활성 방이 있으면
     * 새 방을 만들 수 없다.
     */
    @Query("SELECT COUNT(g) > 0 FROM GameRoom g "
            + "WHERE g.status <> backend.ssafy.suhwa.game.domain.GameRoomStatus.CLOSED "
            + "AND (g.hostUserId = :userId OR g.guestUserId = :userId)")
    boolean existsActiveRoomForUser(@Param("userId") Long userId);

    /**
     * 서버 재시작 시 인메모리 실시간 상태가 모두 사라져 신뢰할 수 없는 WAITING/IN_PROGRESS 방을
     * 일괄 CLOSED로 전환한다(FR-028, research.md #4).
     */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE GameRoom g SET g.status = backend.ssafy.suhwa.game.domain.GameRoomStatus.CLOSED "
            + "WHERE g.status IN (backend.ssafy.suhwa.game.domain.GameRoomStatus.WAITING, "
            + "backend.ssafy.suhwa.game.domain.GameRoomStatus.IN_PROGRESS)")
    int closeAllActiveRooms();

    /**
     * 방치 방 정리(FR-013)를 개별 DELETE(N+1) 대신 단일 벌크 DELETE로 수행한다. 벌크 DML은
     * 영속성 컨텍스트를 우회하므로, 삭제된 엔티티가 1차 캐시에 남아 이후 조회에 노출되지 않도록
     * {@code clearAutomatically = true}로 컨텍스트를 비운다. 또한 대상 조회와 삭제 사이에 방이
     * IN_PROGRESS로 전환될 수 있고 id만으로 지우면 그 방까지 삭제되므로(엔티티 삭제와 달리 벌크
     * DML은 {@code @Version} 검사도 하지 않는다), 삭제문 자체에서 IN_PROGRESS를 제외한다.
     */
    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM GameRoom g WHERE g.id IN :ids "
            + "AND g.status <> backend.ssafy.suhwa.game.domain.GameRoomStatus.IN_PROGRESS")
    void deleteAllByIdIn(@Param("ids") Collection<Long> ids);
}
