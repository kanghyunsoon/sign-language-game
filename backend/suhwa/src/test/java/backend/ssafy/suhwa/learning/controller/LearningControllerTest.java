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
import backend.ssafy.suhwa.learning.dto.TestSessionResponse;
import backend.ssafy.suhwa.learning.dto.TetrisWeightResponse;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.service.SignService;
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

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @MockitoBean private SignService signService;
    @MockitoBean private WrongAnswerService wrongAnswerService;
    @MockitoBean private TestSessionService testSessionService;

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
                .willReturn(List.of(Sign.builder()
                        .category(SignCategory.CONSONANT)
                        .label("기역")
                        .build()));
        mockMvc.perform(get("/signs").param("category", "CONSONANT")).andExpect(status().isOk());
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
                .when(wrongAnswerService)
                .reportWrongAnswer(anyLong(), anyLong(), anyLong());
        mockMvc.perform(post("/wrong-answers")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new WrongAnswerRequest(999L, 1L))))
                .andExpect(status().isNotFound());
    }

    @Test
    void getTetrisWeights_returnsCalculatedWeights() throws Exception {
        given(wrongAnswerService.getTetrisWeightsFromRecentTests(1L))
                .willReturn(List.of(new TetrisWeightResponse(5L, 1.6)));
        mockMvc.perform(get("/wrong-answers/tetris-weights"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].signId").value(5))
                .andExpect(jsonPath("$[0].weight").value(1.6));
    }

    @Test
    void startTestSession_returns201() throws Exception {
        given(testSessionService.startTest(1L))
                .willReturn(TestSession.builder().userId(1L).build());
        mockMvc.perform(post("/test-sessions")).andExpect(status().isCreated());
    }

    @Test
    void completeTestSession_returnsCompletion() throws Exception {
        TestSession completed = TestSession.builder().userId(1L).build();
        completed.complete(LocalDateTime.of(2026, 7, 29, 12, 0), 4, 5);
        given(testSessionService.completeTest(1L, 10L, 4, 5))
                .willReturn(TestSessionResponse.completed(completed, 7, null));
        mockMvc.perform(post("/test-sessions/10/complete")
                        .contentType("application/json")
                        .content("{\"correctCount\":4,\"totalCount\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.awardedExp").value(7));
    }
}
