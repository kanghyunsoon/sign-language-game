package backend.ssafy.suhwa.game;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * 같은 방 코드에 서로 다른 두 사용자가 동시에 join()하는 경쟁 검증(GAME-02-XX, `@Version`).
 *
 * <p>k6 부하 하니스(perf/)는 이 경쟁을 만들지 못한다 — 한 VU가 create→join→...→leave를
 * 순차적으로 독점하므로 같은 방 코드에 다른 참가자가 동시에 몰릴 일이 구조적으로 없다
 * (perf/PLAN.md, RESULTS.md §5 "낙관적 락 충돌이 0건인 이유"). 실제로 26,000회 이상의
 * 부하에서도 409가 한 건도 발생하지 않았다. 이 경쟁은 부하가 아니라 순수 타이밍 문제이므로
 * JUnit으로 직접 재현한다({@link ReportResultConcurrencyTest}와 같은 패턴).
 *
 * <p>기대 동작: 두 guest 후보 중 정확히 한 명만 배정되고, 나머지 한 명은 낙관적 락 충돌
 * 또는 ROOM_FULL 가드로 거부된다. 어느 쪽으로 거부되든 결과 상태(참가자 정확히 2명, 방 하나만
 * 배정)는 동일해야 한다 — 계약이 아니라 최종 일관성만 확인한다.
 *
 * <p>스레드가 각자 트랜잭션을 커밋해 서로를 관측해야 하므로 {@code @Transactional}을 쓰지
 * 않는다. 커밋된 데이터는 {@link #cleanup()}에서 제거한다.
 */
@SpringBootTest
class JoinConcurrencyTest {

    @Autowired
    private GameRoomService gameRoomService;

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private UserRepository userRepository;

    private final List<Long> createdUserIds = new ArrayList<>();
    private Long createdRoomId;

    @AfterEach
    void cleanup() {
        if (createdRoomId != null) {
            gameRoomRepository.deleteById(createdRoomId);
        }
        createdUserIds.forEach(userRepository::deleteById);
    }

    @Test
    void concurrentJoin_sameRoomCode_exactlyOneGuestAssigned() throws Exception {
        Long hostId = newUser("jc-host");
        Long guestAId = newUser("jc-guest-a");
        Long guestBId = newUser("jc-guest-b");

        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        createdRoomId = room.id();
        String roomCode = room.roomCode();

        // 두 후보가 같은 방 코드로 동시에 입장을 시도한다.
        CountDownLatch startLine = new CountDownLatch(1);

        Callable<Throwable> joinA = () -> {
            startLine.await();
            try {
                gameRoomService.join(roomCode, guestAId);
                return null; // 성공
            } catch (Throwable t) {
                return t; // 실패(낙관적 락 충돌 또는 ROOM_FULL)
            }
        };
        Callable<Throwable> joinB = () -> {
            startLine.await();
            try {
                gameRoomService.join(roomCode, guestBId);
                return null;
            } catch (Throwable t) {
                return t;
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Throwable resultA;
        Throwable resultB;
        try {
            Future<Throwable> futureA = pool.submit(joinA);
            Future<Throwable> futureB = pool.submit(joinB);
            startLine.countDown();

            // 교착이 없다면 넉넉한 시한 안에 둘 다 종료된다.
            resultA = futureA.get(10, TimeUnit.SECONDS);
            resultB = futureB.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        long successes = (resultA == null ? 1 : 0) + (resultB == null ? 1 : 0);
        assertThat(successes).as("정확히 한 명만 입장에 성공해야 한다").isEqualTo(1);

        // 실패한 쪽은 낙관적 락 충돌 또는 ROOM_FULL 가드 중 하나여야 한다 — 둘 다 "이미
        // 다른 사람이 들어갔다"는 같은 사실을 다른 시점에 감지한 것이므로 계약 위반이 아니다.
        Throwable failure = resultA != null ? resultA : resultB;
        assertThat(failure).satisfiesAnyOf(
                t -> assertThat(t).isInstanceOf(ObjectOptimisticLockingFailureException.class),
                t -> assertThat(t)
                        .isInstanceOf(BusinessException.class)
                        .extracting(e -> ((BusinessException) e).getCode())
                        .isEqualTo(ErrorCode.ROOM_FULL.name()));

        // 최종 상태: 방에는 host + 배정된 guest 한 명만 있어야 한다.
        GameRoom persisted = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(persisted.isFull()).as("방은 가득 차 있어야 한다").isTrue();
        assertThat(persisted.getGuestUserId()).isIn(guestAId, guestBId);

        Long assignedGuestId = persisted.getGuestUserId();
        Long rejectedGuestId = assignedGuestId.equals(guestAId) ? guestBId : guestAId;
        assertThat(persisted.isParticipant(assignedGuestId)).isTrue();
        assertThat(persisted.isParticipant(rejectedGuestId)).isFalse();
    }

    private Long newUser(String prefix) {
        Long id = userRepository.save(User.builder()
                        .email(prefix + "-" + System.nanoTime() + "@test.com")
                        .passwordHash("h").nickname(prefix).build())
                .getId();
        createdUserIds.add(id);
        return id;
    }
}
