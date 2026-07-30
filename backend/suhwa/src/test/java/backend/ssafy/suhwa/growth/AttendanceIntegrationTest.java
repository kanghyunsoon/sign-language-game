package backend.ssafy.suhwa.growth;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.growth.service.AttendanceService;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import backend.ssafy.suhwa.user.service.UserService;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import({
        AttendanceService.class,
        GrowthRewardService.class,
        PetGrowthService.class,
        AttendanceIntegrationTest.Config.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AttendanceIntegrationTest {

    @Autowired
    private AttendanceService attendanceService;

    @Autowired
    private AttendanceRepository attendanceRepository;

    @Autowired
    private UserPetRepository userPetRepository;

    @MockitoBean
    private UserService userService;

    @AfterEach
    void cleanUp() {
        attendanceRepository.deleteAll();
        userPetRepository.deleteAll();
    }

    @Test
    void concurrentCheckInsCreateOneAttendanceAndOneReward() throws Exception {
        userPetRepository.save(UserPet.builder().userId(1L).build());
        int requestCount = 6;
        ExecutorService executor = Executors.newFixedThreadPool(requestCount);
        CountDownLatch ready = new CountDownLatch(requestCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<AttendanceCompletionResponse>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < requestCount; i++) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    return attendanceService.checkIn(1L);
                }));
            }
            ready.await();
            start.countDown();

            List<AttendanceCompletionResponse> responses = new ArrayList<>();
            for (Future<AttendanceCompletionResponse> future : futures) {
                responses.add(future.get());
            }

            assertThat(responses).filteredOn(AttendanceCompletionResponse::newlyAttended).hasSize(1);
            assertThat(attendanceRepository.count()).isEqualTo(1);
            UserPet pet = userPetRepository.findByUserId(1L).orElseThrow();
            assertThat(pet.getLevel()).isEqualTo(1);
            assertThat(pet.getExp()).isEqualTo(3);
        } finally {
            executor.shutdownNow();
        }
    }

    @TestConfiguration
    static class Config {

        @Bean
        GrowthPolicyProperties growthPolicyProperties() {
            return new GrowthPolicyProperties();
        }

        @Bean
        Clock growthClock() {
            return Clock.fixed(
                    Instant.parse("2026-07-29T15:00:00Z"),
                    ZoneId.of("Asia/Seoul"));
        }
    }
}
