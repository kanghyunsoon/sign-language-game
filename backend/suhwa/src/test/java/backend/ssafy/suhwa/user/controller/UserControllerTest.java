package backend.ssafy.suhwa.user.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.dto.UpdateProfileRequest;
import backend.ssafy.suhwa.user.service.UserService;
import tools.jackson.databind.ObjectMapper;
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

@WebMvcTest(UserController.class)
@AutoConfigureMockMvc(addFilters = false)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private UserService userService;

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
    void getMyProfile_returns200() throws Exception {
        given(userService.getActiveUser(anyLong()))
                .willReturn(User.builder().email("a@a.com").passwordHash("hash").nickname("nick").build());

        mockMvc.perform(get("/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profileImageUrl").doesNotExist());
    }

    @Test
    void updateMyProfile_returns200() throws Exception {
        given(userService.updateProfile(anyLong(), any()))
                .willReturn(User.builder().email("a@a.com").passwordHash("hash").nickname("new-nick").build());

        mockMvc.perform(patch("/users/me")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new UpdateProfileRequest("new-nick"))))
                .andExpect(status().isOk());
    }

    @Test
    void updateMyProfile_nicknameUnderMinLength_returns400() throws Exception {
        mockMvc.perform(patch("/users/me")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new UpdateProfileRequest("a", null))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateMyProfile_nicknameOverMaxLength_returns400() throws Exception {
        mockMvc.perform(patch("/users/me")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new UpdateProfileRequest("a".repeat(11), null))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void withdraw_returns204() throws Exception {
        mockMvc.perform(delete("/users/me"))
                .andExpect(status().isNoContent());

        verify(userService).withdraw(anyLong());
    }
}
