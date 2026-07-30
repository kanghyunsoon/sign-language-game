package backend.ssafy.suhwa.game;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
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

/**
 * 동시 결과 보고 안전성 검증(spec 004 FR-012, GAME-02-13).
 *
 * <p>현행 `reportResult`는 User 행 갱신 없이 `game_results` INSERT + `game_rooms` 상태
 * 전이(@Version 낙관적 락)뿐이라, 원안(win_count 파생캐시)의 데드락 구조가 존재하지 않는다.
 * 두 참가자가 같은 매치 결과를 동시에 보고해도 (1) 교착 없이 모두 종료되고, (2) 낙관적 락 충돌
 * 또는 상태 가드(ROOM_NOT_IN_PROGRESS)로 정확히 한 번만 기록됨을 확인한다.
 *
 * <p>스레드가 각자 트랜잭션을 커밋해 서로를 관측해야 하므로 이 테스트는 {@code @Transactional}을
 * 쓰지 않는다. 커밋된 데이터는 {@link #cleanup()}에서 제거해 공유 컨텍스트를 오염시키지 않는다.
 */
@SpringBootTest
class ReportResultConcurrencyTest {

    @Autowired
    private GameRoomService gameRoomService;

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private GameResultRepository gameResultRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserPetRepository userPetRepository;

    private final List<Long> createdUserIds = new ArrayList<>();
    private Long createdRoomId;

    @AfterEach
    void cleanup() {
        gameResultRepository.deleteAll(gameResultRepository.findAll().stream()
                .filter(r -> createdUserIds.contains(r.getUserId())).toList());
        if (createdRoomId != null) {
            gameRoomRepository.deleteById(createdRoomId);
        }
        createdUserIds.forEach(id -> userPetRepository.findByUserId(id)
                .ifPresent(userPetRepository::delete));
        createdUserIds.forEach(userRepository::deleteById);
    }

    private long resultCountFor(Long... userIds) {
        List<Long> ids = List.of(userIds);
        return gameResultRepository.findAll().stream()
                .filter(r -> ids.contains(r.getUserId())).count();
    }

    @Test
    void concurrentReportResult_noDeadlock_recordsExactlyOnce() throws Exception {
        Long hostId = newUser("cc-host");
        Long guestId = newUser("cc-guest");

        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        createdRoomId = room.id();
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        gameRoomService.start(room.id(), hostId);

        // 두 참가자가 승자를 host로 동시에 보고한다.
        CountDownLatch startLine = new CountDownLatch(1);
        Callable<Throwable> task = () -> {
            startLine.await();
            try {
                gameRoomService.reportResult(room.id(), hostId, hostId);
                return null; // 성공
            } catch (Throwable t) {
                return t; // 실패(낙관적 락 충돌 또는 상태 가드)
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> f1 = pool.submit(task);
            Future<Throwable> f2 = pool.submit(task);
            startLine.countDown();

            // 교착이 없다면 넉넉한 시한 안에 둘 다 종료된다.
            Throwable r1 = f1.get(10, TimeUnit.SECONDS);
            Throwable r2 = f2.get(10, TimeUnit.SECONDS);

            long successes = (r1 == null ? 1 : 0) + (r2 == null ? 1 : 0);
            assertThat(successes).as("정확히 한 번만 성공해야 한다").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        // 결과는 승자 1행 + 패자 1행, 총 2행만 기록되어야 한다(중복 보고분은 무효).
        assertThat(resultCountFor(hostId, guestId)).isEqualTo(2);
    }

    private Long newUser(String prefix) {
        Long id = userRepository.save(User.builder()
                        .email(prefix + "-" + System.nanoTime() + "@test.com")
                        .passwordHash("h").nickname(prefix).build())
                .getId();
        createdUserIds.add(id);
        userPetRepository.save(UserPet.builder().userId(id).build());
        return id;
    }
}
