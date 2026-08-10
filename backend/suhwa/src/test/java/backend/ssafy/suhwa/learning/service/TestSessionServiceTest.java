package backend.ssafy.suhwa.learning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.learning.domain.TestSession;
import backend.ssafy.suhwa.learning.dto.TestSessionResponse;
import backend.ssafy.suhwa.learning.repository.TestSessionRepository;
import backend.ssafy.suhwa.user.service.UserService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class TestSessionServiceTest {

    private TestSessionRepository testSessionRepository;
    private GrowthRewardService growthRewardService;
    private TestSessionService testSessionService;
    private UserPet pet;

    @BeforeEach
    void setUp() {
        testSessionRepository = Mockito.mock(TestSessionRepository.class);
        growthRewardService = Mockito.mock(GrowthRewardService.class);
        GrowthPolicyProperties policy = new GrowthPolicyProperties();
        Clock clock = Clock.fixed(
                Instant.parse("2026-07-30T03:00:00Z"), ZoneId.of("Asia/Seoul"));
        testSessionService =
                new TestSessionService(
                        testSessionRepository,
                        growthRewardService,
                        policy,
                        clock,
                        Mockito.mock(UserService.class));
        pet = UserPet.builder().userId(1L).build();
        given(growthRewardService.lockPet(1L)).willReturn(pet);
    }

    @Test
    void startTest_savesSessionForUser() {
        given(testSessionRepository.save(any(TestSession.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        TestSession result = testSessionService.startTest(1L);

        assertThat(result.getUserId()).isEqualTo(1L);
        assertThat(result.isCompleted()).isFalse();
    }

    @Test
    void completeTest_atEightyPercent_rewardsSevenExperience() {
        TestSession session = TestSession.builder().userId(1L).build();
        given(testSessionRepository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        TestSessionResponse result = testSessionService.completeTest(1L, 10L, 4, 5);

        assertThat(result.passedRewardThreshold()).isTrue();
        assertThat(result.awardedExp()).isEqualTo(7);
        verify(growthRewardService).rewardLocked(pet, 7);
    }

    @Test
    void completeTest_belowEightyPercent_doesNotReward() {
        TestSession session = TestSession.builder().userId(1L).build();
        given(testSessionRepository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        TestSessionResponse result = testSessionService.completeTest(1L, 10L, 79, 100);

        assertThat(result.passedRewardThreshold()).isFalse();
        assertThat(result.awardedExp()).isZero();
        verify(growthRewardService).rewardLocked(pet, 0);
    }

    @Test
    void completeTest_samePayloadReplay_isIdempotent() {
        TestSession session = TestSession.builder().userId(1L).build();
        session.complete(java.time.LocalDateTime.of(2026, 7, 30, 12, 0), 8, 10);
        given(testSessionRepository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        TestSessionResponse result = testSessionService.completeTest(1L, 10L, 8, 10);

        assertThat(result.awardedExp()).isZero();
        verify(growthRewardService, never()).rewardLocked(any(), any(Integer.class));
    }

    @Test
    void completeTest_differentPayloadReplay_throwsConflict() {
        TestSession session = TestSession.builder().userId(1L).build();
        session.complete(java.time.LocalDateTime.of(2026, 7, 30, 12, 0), 8, 10);
        given(testSessionRepository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        assertThatThrownBy(() -> testSessionService.completeTest(1L, 10L, 9, 10))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(ErrorCode.ACTIVITY_COMPLETION_CONFLICT.name()));
    }

    @Test
    void completeTest_otherUsersSession_throwsForbidden() {
        TestSession session = TestSession.builder().userId(1L).build();
        given(testSessionRepository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        assertThatThrownBy(() -> testSessionService.completeTest(2L, 10L, 8, 10))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(ErrorCode.ACTIVITY_SESSION_ACCESS_DENIED.name()));
    }
}
