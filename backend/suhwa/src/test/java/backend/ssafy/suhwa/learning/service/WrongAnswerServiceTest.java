package backend.ssafy.suhwa.learning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.TestSession;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import backend.ssafy.suhwa.learning.dto.TetrisWeightResponse;
import backend.ssafy.suhwa.learning.dto.WrongAnswerCount;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import backend.ssafy.suhwa.learning.repository.TestSessionRepository;
import backend.ssafy.suhwa.learning.repository.WrongAnswerLogRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.data.domain.Pageable;

class WrongAnswerServiceTest {

    private WrongAnswerLogRepository wrongAnswerLogRepository;
    private SignRepository signRepository;
    private TestSessionRepository testSessionRepository;
    private WrongAnswerService wrongAnswerService;

    @BeforeEach
    void setUp() {
        wrongAnswerLogRepository = Mockito.mock(WrongAnswerLogRepository.class);
        signRepository = Mockito.mock(SignRepository.class);
        testSessionRepository = Mockito.mock(TestSessionRepository.class);
        wrongAnswerService =
                new WrongAnswerService(wrongAnswerLogRepository, signRepository, testSessionRepository);
    }

    @Test
    void reportWrongAnswer_savesOwnedTestSessionId() {
        TestSession testSession = TestSession.builder().userId(1L).build();
        Sign sign = Mockito.mock(Sign.class);
        given(sign.getId()).willReturn(5L);
        given(testSessionRepository.findByIdAndUserId(10L, 1L)).willReturn(Optional.of(testSession));
        given(signRepository.findById(5L)).willReturn(Optional.of(sign));

        wrongAnswerService.reportWrongAnswer(1L, 10L, 5L);

        ArgumentCaptor<WrongAnswerLog> captor = ArgumentCaptor.forClass(WrongAnswerLog.class);
        verify(wrongAnswerLogRepository).save(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
        assertThat(captor.getValue().getSignId()).isEqualTo(5L);
        assertThat(captor.getValue().getTestSessionId()).isEqualTo(10L);
    }

    @Test
    void reportWrongAnswer_otherUsersSession_throwsNotFoundBeforeSaving() {
        given(testSessionRepository.findByIdAndUserId(10L, 2L)).willReturn(Optional.empty());

        assertThatThrownBy(() -> wrongAnswerService.reportWrongAnswer(2L, 10L, 5L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(ErrorCode.TEST_SESSION_NOT_FOUND.name()));

        verify(signRepository, never()).findById(any());
        verify(wrongAnswerLogRepository, never()).save(any());
    }

    @Test
    void getTetrisWeightsFromRecentTests_calculatesWeightsFromLatestCompletedSessions() {
        TestSession first = Mockito.mock(TestSession.class);
        TestSession second = Mockito.mock(TestSession.class);
        Sign firstSign = Mockito.mock(Sign.class);
        Sign secondSign = Mockito.mock(Sign.class);
        Sign defaultWeightSign = Mockito.mock(Sign.class);
        given(first.getId()).willReturn(10L);
        given(second.getId()).willReturn(11L);
        given(firstSign.getId()).willReturn(5L);
        given(secondSign.getId()).willReturn(6L);
        given(defaultWeightSign.getId()).willReturn(7L);
        given(signRepository.findByCategoryInAndActiveTrueOrderByIdAsc(
                List.of(SignCategory.CONSONANT, SignCategory.VOWEL)))
                .willReturn(List.of(firstSign, secondSign, defaultWeightSign));
        given(testSessionRepository.findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(
                Mockito.eq(1L), any(Pageable.class)))
                .willReturn(List.of(first, second));
        List<WrongAnswerCount> counts = List.of(
                new WrongAnswerCount(5L, 2L),
                new WrongAnswerCount(6L, 5L));
        given(wrongAnswerLogRepository.countByUserIdAndTestSessionIdsAndCategories(
                1L,
                List.of(10L, 11L),
                List.of(SignCategory.CONSONANT, SignCategory.VOWEL)))
                .willReturn(counts);

        assertThat(wrongAnswerService.getTetrisWeightsFromRecentTests(1L))
                .containsExactly(
                        new TetrisWeightResponse(5L, 1.4),
                        new TetrisWeightResponse(6L, 2.0),
                        new TetrisWeightResponse(7L, 1.0));
    }

    @Test
    void getTetrisWeightsFromRecentTests_withoutCompletedSessions_returnsAllSignsWithDefaultWeight() {
        Sign firstSign = Mockito.mock(Sign.class);
        Sign secondSign = Mockito.mock(Sign.class);
        given(firstSign.getId()).willReturn(5L);
        given(secondSign.getId()).willReturn(6L);
        given(signRepository.findByCategoryInAndActiveTrueOrderByIdAsc(
                List.of(SignCategory.CONSONANT, SignCategory.VOWEL)))
                .willReturn(List.of(firstSign, secondSign));
        given(testSessionRepository.findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(
                Mockito.eq(1L), any(Pageable.class)))
                .willReturn(List.of());

        assertThat(wrongAnswerService.getTetrisWeightsFromRecentTests(1L))
                .containsExactly(
                        new TetrisWeightResponse(5L, 1.0),
                        new TetrisWeightResponse(6L, 1.0));
        verify(wrongAnswerLogRepository, never())
                .countByUserIdAndTestSessionIdsAndCategories(any(), any(), any());
    }
}
