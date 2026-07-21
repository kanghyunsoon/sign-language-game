package backend.ssafy.suhwa.learning.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.dto.TestResultRequest;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.service.SignService;
import backend.ssafy.suhwa.learning.service.TestResultService;
import backend.ssafy.suhwa.learning.service.WrongAnswerService;
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
    private TestResultService testResultService;

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
                        .content(objectMapper.writeValueAsString(new WrongAnswerRequest(1L))))
                .andExpect(status().isCreated());
    }

    @Test
    void reportWrongAnswer_unknownSign_returns404() throws Exception {
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.SIGN_NOT_FOUND))
                .when(wrongAnswerService).reportWrongAnswer(anyLong(), any());

        mockMvc.perform(post("/wrong-answers")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new WrongAnswerRequest(999L))))
                .andExpect(status().isNotFound());
    }

    @Test
    void listWrongAnswers_returns200() throws Exception {
        given(wrongAnswerService.getRecentWrongAnswers(anyLong(), any())).willReturn(List.of());

        mockMvc.perform(get("/wrong-answers").param("category", "VOWEL"))
                .andExpect(status().isOk());
    }

    @Test
    void reportTestResult_returns201() throws Exception {
        mockMvc.perform(post("/test-results")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new TestResultRequest(SignCategory.WORD, 10, 7))))
                .andExpect(status().isCreated());
    }
}
