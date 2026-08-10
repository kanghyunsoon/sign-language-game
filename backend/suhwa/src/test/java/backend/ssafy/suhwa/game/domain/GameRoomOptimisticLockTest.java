package backend.ssafy.suhwa.game.domain;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.common.config.JpaAuditingConfig;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.common.exception.ErrorResponse;
import backend.ssafy.suhwa.common.exception.GlobalExceptionHandler;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.TestPropertySource;

/**
 * GameRoom에 도입한 @Version 낙관적 락(CORR-1, FR-002)이 실제로 동작하는지,
 * 그 충돌이 GlobalExceptionHandler에서 409(CONCURRENT_UPDATE_CONFLICT)로 매핑되는지 검증한다.
 *
 * 실제 동시 HTTP 요청(스레드 경합)을 그대로 재현하는 대신, ORM을 우회한 네이티브 쿼리로
 * "다른 트랜잭션이 이미 이 방을 갱신해 버전을 올려놓은 상황"을 결정적으로(non-flaky) 만든 뒤,
 * 여전히 옛 버전을 들고 있는 detached 엔티티로 저장을 시도해 충돌을 재현한다.
 */
@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import(JpaAuditingConfig.class)
class GameRoomOptimisticLockTest {

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void staleSave_throwsOptimisticLockingFailureException() {
        GameRoom saved = entityManager.persistFlushFind(
                GameRoom.builder().roomCode("OPT001").hostUserId(1L).build());
        Long roomId = saved.getId();
        entityManager.detach(saved);

        entityManager.getEntityManager()
                .createNativeQuery("UPDATE game_rooms SET version = version + 1 WHERE id = :id")
                .setParameter("id", roomId)
                .executeUpdate();

        saved.setReady(1L, true);
        assertThatThrownBy(() -> gameRoomRepository.saveAndFlush(saved))
                .isInstanceOf(OptimisticLockingFailureException.class);
    }

    @Test
    void globalExceptionHandler_mapsOptimisticLockingFailureTo409() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<ErrorResponse> response = handler.handleOptimisticLockingFailure(
                new ObjectOptimisticLockingFailureException(GameRoom.class, 1L));

        Assertions.assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        Assertions.assertThat(response.getBody().code()).isEqualTo(ErrorCode.CONCURRENT_UPDATE_CONFLICT.name());
    }
}
