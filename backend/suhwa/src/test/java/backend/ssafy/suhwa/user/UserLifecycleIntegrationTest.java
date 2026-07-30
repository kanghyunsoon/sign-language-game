package backend.ssafy.suhwa.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.auth.dto.LoginRequest;
import backend.ssafy.suhwa.auth.dto.RefreshRequest;
import backend.ssafy.suhwa.auth.dto.SignupRequest;
import backend.ssafy.suhwa.auth.dto.TokenResponse;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.user.dto.UpdateProfileRequest;
import tools.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:user-lifecycle;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.transaction.default-timeout=30s",
        "jwt.secret=0123456789012345678901234567890123456789012345678901234567890123"
})
class UserLifecycleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserPetRepository userPetRepository;

    @Test
    void fullLifecycle_signup_login_refresh_logout_withdraw_resignup() throws Exception {
        String email = "lifecycle-" + UUID.randomUUID() + "@test.com";

        MvcResult signupResult = mockMvc.perform(post("/auth/signup")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", "닉네임"))))
                .andExpect(status().isCreated())
                .andReturn();
        Long signedUpUserId = objectMapper.readTree(signupResult.getResponse().getContentAsString())
                .get("id").asLong();
        org.assertj.core.api.Assertions.assertThat(userPetRepository.findByUserId(signedUpUserId))
                .isPresent()
                .get()
                .satisfies(pet -> {
                    org.assertj.core.api.Assertions.assertThat(pet.getLevel()).isEqualTo(1);
                    org.assertj.core.api.Assertions.assertThat(pet.getExp()).isZero();
                });

        TokenResponse tokens = login(email, "password1");

        mockMvc.perform(get("/users/me").header("Authorization", "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));

        mockMvc.perform(patch("/users/me")
                        .header("Authorization", "Bearer " + tokens.accessToken())
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new UpdateProfileRequest("새닉네임", null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("새닉네임"));

        MvcResult refreshResult = mockMvc.perform(post("/auth/refresh")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new RefreshRequest(tokens.refreshToken()))))
                .andExpect(status().isOk())
                .andReturn();
        TokenResponse refreshedTokens = objectMapper.readValue(
                refreshResult.getResponse().getContentAsString(), TokenResponse.class);

        // 회전된 옛 refresh token 재사용 불가
        mockMvc.perform(post("/auth/refresh")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new RefreshRequest(tokens.refreshToken()))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/auth/logout")
                        .header("Authorization", "Bearer " + refreshedTokens.accessToken()))
                .andExpect(status().isNoContent());

        // 로그아웃된 refresh token 재사용 불가
        mockMvc.perform(post("/auth/refresh")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new RefreshRequest(refreshedTokens.refreshToken()))))
                .andExpect(status().isUnauthorized());

        TokenResponse reLoginTokens = login(email, "password1");

        mockMvc.perform(delete("/users/me")
                        .header("Authorization", "Bearer " + reLoginTokens.accessToken()))
                .andExpect(status().isNoContent());

        // 탈퇴 계정 로그인 차단
        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest(email, "password1"))))
                .andExpect(status().isUnauthorized());

        // 탈퇴 시 이메일이 변형되므로 원본 이메일로 재가입 가능
        mockMvc.perform(post("/auth/signup")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password2", "새회원"))))
                .andExpect(status().isCreated());
    }

    private TokenResponse login(String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest(email, password))))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), TokenResponse.class);
    }
}
