package backend.ssafy.suhwa.learning.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.TestSession;
import backend.ssafy.suhwa.learning.domain.PracticeSession;
import backend.ssafy.suhwa.learning.dto.ActivityCompletionResponse;
import backend.ssafy.suhwa.growth.domain.EvolutionStage;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.learning.dto.TetrisWeightResponse;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.dto.TestSessionResponse;
import backend.ssafy.suhwa.learning.service.SignService;
import backend.ssafy.suhwa.learning.service.PracticeSessionService;
import backend.ssafy.suhwa.learning.service.TestSessionService;
import backend.ssafy.suhwa.learning.service.WrongAnswerService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@WebMvcTest(LearningController.class)
@AutoConfigureMockMvc(addFilters = false)
class LearningControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private SignService signService;

    @MockitoBean
    private WrongAnswerService wrongAnswerService;

    @MockitoBean
    private TestSessionService testSessionService;

    @MockitoBean
    private PracticeSessionService practiceSessionService;

    @BeforeEach
    void setAuthenticatedUser() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listSigns_returns200() throws Exception {
        given(signService.getActiveSignsByCategory(any()))
                .willReturn(List.of(Sign.builder().category(SignCategory.CONSONANT).label("ㄱ").build()));

        mockMvc.perform(get("/signs").param("category", "CONSONANT"))
                .andExpect(status().isOk());
    }

    @Test
    void reportWrongAnswer_returns201() throws Exception {
        mockMvc.perform(post("/wrong-answers")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new WrongAnswerRequest(10L, 1L))))
                .andExpect(status().isCreated());

        verify(wrongAnswerService).reportWrongAnswer(1L, 10L, 1L);
    }

    @Test
    void reportWrongAnswer_unknownTestSession_returns404() throws Exception {
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.TEST_SESSION_NOT_FOUND))
                .when(wrongAnswerService).reportWrongAnswer(anyLong(), anyLong(), anyLong());

        mockMvc.perform(post("/wrong-answers")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new WrongAnswerRequest(999L, 1L))))
                .andExpect(status().isNotFound());
    }

    @Test
    void listWrongAnswers_returns200() throws Exception {
        given(wrongAnswerService.getRecentWrongAnswers(anyLong(), any())).willReturn(List.of());

        mockMvc.perform(get("/wrong-answers").param("category", "VOWEL"))
                .andExpect(status().isOk());
    }

    @Test
    void getTetrisWeights_returns200WithCalculatedWeights() throws Exception {
        given(wrongAnswerService.getTetrisWeightsFromRecentTests(1L))
                .willReturn(List.of(new TetrisWeightResponse(5L, 1.6)));

        mockMvc.perform(get("/wrong-answers/tetris-weights"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].signId").value(5))
                .andExpect(jsonPath("$[0].weight").value(1.6))
                .andExpect(jsonPath("$[0].wrongCount").doesNotExist());

        verify(wrongAnswerService).getTetrisWeightsFromRecentTests(1L);
    }

    @Test
    void startTestSession_returns201() throws Exception {
        given(testSessionService.startTest(1L))
                .willReturn(TestSession.builder().userId(1L).build());

        mockMvc.perform(post("/test-sessions"))
                .andExpect(status().isCreated());

        verify(testSessionService).startTest(1L);
    }

    @Test
    void startPracticeSession_returns201() throws Exception {
        given(practiceSessionService.start(1L))
                .willReturn(PracticeSession.builder().userId(1L).build());

        mockMvc.perform(post("/practice-sessions"))
                .andExpect(status().isCreated());

        verify(practiceSessionService).start(1L);
    }

    @Test
    void completePracticeSession_returnsRewardAndPet() throws Exception {
        PetStatusResponse pet =
                new PetStatusResponse(1, 10, 10, EvolutionStage.STAGE_1, 10);
        given(practiceSessionService.complete(1L, 20L))
                .willReturn(new ActivityCompletionResponse(true, 10, pet));

        mockMvc.perform(post("/practice-sessions/20/complete"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.awardedExp").value(10))
                .andExpect(jsonPath("$.pet.currentExp").value(10));
    }

    @Test
    void completeTestSession_returns200WithCompletedAt() throws Exception {
        TestSession completed = TestSession.builder().userId(1L).build();
        completed.complete(LocalDateTime.of(2026, 7, 29, 12, 0), 4, 5);
        given(testSessionService.completeTest(1L, 10L, 4, 5))
                .willReturn(TestSessionResponse.completed(completed, 7, null));

        mockMvc.perform(post("/test-sessions/10/complete")
                        .contentType("application/json")
                        .content("{\"correctCount\":4,\"totalCount\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completedAt").value("2026-07-29T12:00:00"))
                .andExpect(jsonPath("$.awardedExp").value(7));

        verify(testSessionService).completeTest(1L, 10L, 4, 5);
    }

    @Test
    void completeTestSession_unknownSession_returns404() throws Exception {
        given(testSessionService.completeTest(1L, 999L, 4, 5))
                .willThrow(new BusinessException(ErrorCode.TEST_SESSION_NOT_FOUND));

        mockMvc.perform(post("/test-sessions/999/complete")
                        .contentType("application/json")
                        .content("{\"correctCount\":4,\"totalCount\":5}"))
                .andExpect(status().isNotFound());
    }
}
