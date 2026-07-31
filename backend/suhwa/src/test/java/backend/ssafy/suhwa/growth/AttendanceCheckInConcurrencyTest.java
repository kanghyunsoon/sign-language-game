package backend.ssafy.suhwa.growth;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.config.GrowthTimeConfig;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.growth.service.AttendanceService;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.time.LocalDate;
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
 * checkIn() 동시성 안전성 검증. AttendanceService는 (user_id, attendance_date) UNIQUE
 * 제약이 아니라, 맨 앞에서 호출하는 {@code growthRewardService.lockPet()}이 거는
 * {@code PESSIMISTIC_WRITE} 락(user_pets 행)에 사실상 얹혀서 같은 유저의 동시 체크인을
 * 순차화한다 — 이 테스트는 그 전제가 실제로 지켜지는지 확인한다: 동시에 두 번 체크인해도
 * 출석 행은 하나만 남고 경험치도 정확히 한 번만 지급돼야 한다.
 *
 * <p>스레드가 각자 트랜잭션을 커밋해 서로를 관측해야 하므로 {@code @Transactional}을 쓰지
 * 않는다. 커밋된 데이터는 {@link #cleanup()}에서 제거한다.
 */
@SpringBootTest
class AttendanceCheckInConcurrencyTest {

    @Autowired
    private AttendanceService attendanceService;

    @Autowired
    private AttendanceRepository attendanceRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserPetRepository userPetRepository;

    @Autowired
    private PetGrowthService petGrowthService;

    @Autowired
    private GrowthPolicyProperties policy;

    private final List<Long> createdUserIds = new ArrayList<>();

    @AfterEach
    void cleanup() {
        createdUserIds.forEach(id -> attendanceRepository.findByUserIdAndAttendanceDate(
                        id, LocalDate.now(GrowthTimeConfig.SERVICE_ZONE))
                .ifPresent(attendanceRepository::delete));
        createdUserIds.forEach(id -> userPetRepository.findByUserId(id)
                .ifPresent(userPetRepository::delete));
        createdUserIds.forEach(userRepository::deleteById);
    }

    @Test
    void concurrentCheckIn_recordsExactlyOneAttendanceAndOneReward() throws Exception {
        Long userId = newUser("cc-attendance");
        int baselineExp = petGrowthService.createInitialPet(userId).getExp();

        CountDownLatch startLine = new CountDownLatch(1);
        Callable<AttendanceCompletionResponse> task = () -> {
            startLine.await();
            return attendanceService.checkIn(userId);
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<AttendanceCompletionResponse> f1 = pool.submit(task);
            Future<AttendanceCompletionResponse> f2 = pool.submit(task);
            startLine.countDown();

            // 락 경합이 있어도 교착 없이 넉넉한 시한 안에 둘 다 끝나야 한다.
            AttendanceCompletionResponse r1 = f1.get(10, TimeUnit.SECONDS);
            AttendanceCompletionResponse r2 = f2.get(10, TimeUnit.SECONDS);

            // 둘 다 예외 없이 성공하되(fail-fast가 아니라 멱등), 그중 정확히 하나만 "새로 출석"이다.
            long newlyAttendedCount =
                    (r1.newlyAttended() ? 1 : 0) + (r2.newlyAttended() ? 1 : 0);
            assertThat(newlyAttendedCount).as("정확히 한 번만 새로 출석 처리돼야 한다").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        LocalDate today = LocalDate.now(GrowthTimeConfig.SERVICE_ZONE);
        assertThat(attendanceRepository.countByUserIdAndAttendanceDate(userId, today))
                .as("출석 행이 정확히 하나만 남아야 한다")
                .isEqualTo(1);

        UserPet pet = userPetRepository.findByUserId(userId).orElseThrow();
        assertThat(pet.getExp())
                .as("경험치는 정확히 한 번만 지급돼야 한다(중복 지급 방지)")
                .isEqualTo(baselineExp + policy.getAttendanceExp());
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
