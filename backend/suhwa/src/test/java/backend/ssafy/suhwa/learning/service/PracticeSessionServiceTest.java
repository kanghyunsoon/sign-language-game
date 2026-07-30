package backend.ssafy.suhwa.learning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.learning.domain.PracticeSession;
import backend.ssafy.suhwa.learning.dto.ActivityCompletionResponse;
import backend.ssafy.suhwa.learning.repository.PracticeSessionRepository;
import backend.ssafy.suhwa.user.service.UserService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class PracticeSessionServiceTest {

    private PracticeSessionRepository repository;
    private GrowthRewardService growthRewardService;
    private PracticeSessionService service;
    private UserPet pet;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(PracticeSessionRepository.class);
        growthRewardService = Mockito.mock(GrowthRewardService.class);
        service = new PracticeSessionService(
                repository,
                growthRewardService,
                new GrowthPolicyProperties(),
                Clock.fixed(Instant.parse("2026-07-30T03:00:00Z"), ZoneId.of("Asia/Seoul")),
                Mockito.mock(UserService.class));
        pet = UserPet.builder().userId(1L).build();
        given(growthRewardService.lockPet(1L)).willReturn(pet);
    }

    @Test
    void firstCompletionRewardsTenExperience() {
        PracticeSession session = PracticeSession.builder().userId(1L).build();
        given(repository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        ActivityCompletionResponse result = service.complete(1L, 10L);

        assertThat(result.awardedExp()).isEqualTo(10);
        assertThat(session.isCompleted()).isTrue();
        verify(growthRewardService).rewardLocked(pet, 10);
    }

    @Test
    void repeatedCompletionDoesNotRewardAgain() {
        PracticeSession session = PracticeSession.builder().userId(1L).build();
        session.complete(java.time.LocalDateTime.of(2026, 7, 30, 12, 0));
        given(repository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        ActivityCompletionResponse result = service.complete(1L, 10L);

        assertThat(result.awardedExp()).isZero();
        verify(growthRewardService, never()).rewardLocked(pet, 10);
    }

    @Test
    void otherOwnersSessionIsForbidden() {
        PracticeSession session = PracticeSession.builder().userId(2L).build();
        given(repository.findByIdForUpdate(10L)).willReturn(Optional.of(session));

        assertThatThrownBy(() -> service.complete(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(ErrorCode.ACTIVITY_SESSION_ACCESS_DENIED.name()));
    }
}
