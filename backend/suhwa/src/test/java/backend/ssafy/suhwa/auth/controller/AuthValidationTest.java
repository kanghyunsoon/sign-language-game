package backend.ssafy.suhwa.auth.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.auth.dto.LoginRequest;
import backend.ssafy.suhwa.auth.dto.SignupRequest;
import backend.ssafy.suhwa.auth.service.AuthService;
import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.user.service.UserService;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 인증 요청 입력 검증 가드레일(spec 004 FR-005, AUTH-05). 비밀번호 길이 상한을 넘기면
 * 컨트롤러 진입 전 @Valid 단계에서 400으로 거절되는지 확인한다.
 */
@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthValidationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private UserService userService;

    @MockitoBean
    private RealtimeTicketService realtimeTicketService;

    private static final String OVER_64 = "a".repeat(65);

    @Test
    void signup_passwordOverMaxLength_returns400() throws Exception {
        mockMvc.perform(post("/auth/signup")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest("a@a.com", OVER_64, "nick"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void login_passwordOverMaxLength_returns400() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new LoginRequest("a@a.com", OVER_64))))
                .andExpect(status().isBadRequest());
    }
}
