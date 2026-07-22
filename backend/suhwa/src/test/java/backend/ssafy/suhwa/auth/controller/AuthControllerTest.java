package backend.ssafy.suhwa.auth.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.auth.service.AuthService;
import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.service.UserService;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

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

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void signup_returns201() throws Exception {
        given(userService.signup(any(), any(), any()))
                .willReturn(User.builder().email("a@a.com").passwordHash("hash").nickname("nick").build());

        mockMvc.perform(post("/auth/signup")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new backend.ssafy.suhwa.auth.dto.SignupRequest("a@a.com", "password1", "nick"))))
                .andExpect(status().isCreated());
    }

    @Test
    void signup_duplicateEmail_returns409() throws Exception {
        given(userService.signup(any(), any(), any()))
                .willThrow(new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS));

        mockMvc.perform(post("/auth/signup")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new backend.ssafy.suhwa.auth.dto.SignupRequest("a@a.com", "password1", "nick"))))
                .andExpect(status().isConflict());
    }

    @Test
    void login_invalidCredentials_returns401() throws Exception {
        given(authService.login(any(), any())).willThrow(new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new backend.ssafy.suhwa.auth.dto.LoginRequest("a@a.com", "wrong"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refresh_invalidToken_returns401() throws Exception {
        given(authService.refresh(any())).willThrow(new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN));

        mockMvc.perform(post("/auth/refresh")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new backend.ssafy.suhwa.auth.dto.RefreshRequest("bad-token"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logout_returns204() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, java.util.List.of()));

        mockMvc.perform(post("/auth/logout"))
                .andExpect(status().isNoContent());

        verify(authService).logout(anyLong());
    }

    @Test
    void issueRealtimeTicket_returns201() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, java.util.List.of()));
        given(realtimeTicketService.issue(anyLong())).willReturn("opaque-ticket");
        given(realtimeTicketService.ticketTtlSeconds()).willReturn(30L);

        mockMvc.perform(post("/auth/sse-ticket"))
                .andExpect(status().isCreated())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.ticket").value("opaque-ticket"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.expiresInSeconds").value(30));
    }
}
