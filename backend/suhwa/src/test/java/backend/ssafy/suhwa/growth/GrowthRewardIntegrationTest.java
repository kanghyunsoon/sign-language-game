package backend.ssafy.suhwa.growth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.learning.dto.ActivityCompletionResponse;
import backend.ssafy.suhwa.learning.repository.PracticeSessionRepository;
import backend.ssafy.suhwa.learning.service.PracticeSessionService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
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
        PracticeSessionService.class,
        GrowthRewardService.class,
        PetGrowthService.class,
        GrowthRewardIntegrationTest.Config.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class GrowthRewardIntegrationTest {

    @Autowired
    private PracticeSessionService practiceSessionService;

    @Autowired
    private PracticeSessionRepository practiceSessionRepository;

    @Autowired
    private UserPetRepository userPetRepository;

    @MockitoBean
    private UserService userService;

    @AfterEach
    void cleanUp() {
        practiceSessionRepository.deleteAll();
        userPetRepository.deleteAll();
    }

    @Test
    void concurrentCompletionRewardsExactlyOnce() throws Exception {
        userPetRepository.save(UserPet.builder().userId(1L).build());
        Long sessionId = practiceSessionService.start(1L).getId();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<ActivityCompletionResponse>> futures = List.of(
                    executor.submit(() -> completeAtOnce(sessionId, ready, start)),
                    executor.submit(() -> completeAtOnce(sessionId, ready, start)));
            ready.await();
            start.countDown();

            List<Integer> rewards = List.of(
                    futures.get(0).get().awardedExp(),
                    futures.get(1).get().awardedExp());
            assertThat(rewards).containsExactlyInAnyOrder(10, 0);
            assertThat(userPetRepository.findByUserId(1L).orElseThrow().getExp()).isEqualTo(10);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void missingPetRollsBackActivityCompletion() {
        Long sessionId = practiceSessionService.start(2L).getId();

        assertThatThrownBy(() -> practiceSessionService.complete(2L, sessionId))
                .isInstanceOf(BusinessException.class);

        assertThat(practiceSessionRepository.findById(sessionId).orElseThrow().isCompleted())
                .isFalse();
    }

    private ActivityCompletionResponse completeAtOnce(
            Long sessionId, CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        return practiceSessionService.complete(1L, sessionId);
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
                    Instant.parse("2026-07-30T03:00:00Z"),
                    ZoneId.of("Asia/Seoul"));
        }
    }
}
