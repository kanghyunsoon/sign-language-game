package backend.ssafy.suhwa.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 보안 필터 체인을 켠 채로 오류 응답 형식이 일관된지 검증한다(FR-025, STABLE-08-16).
 *
 * <p>컨트롤러 슬라이스 테스트는 필터를 끄고 돌기 때문에, 필터 단계에서 끝나는 오류(인증 실패)가
 * {@code ErrorResponse} 형식으로 나오는지 확인할 수 없다. 실제로 SecurityConfig가 진입점을
 * {@code HandlerExceptionResolver}에 위임하지 않으면 401이 Spring Security 기본 형식으로 나가
 * 다른 오류와 모양이 달라진다 — 그 회귀를 잡는 것이 이 테스트의 목적이다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class FilterChainIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private String bearerToken;

    @BeforeEach
    void setUp() {
        User user = userRepository.save(User.builder()
                .email("filter-chain-" + System.nanoTime() + "@test.com")
                .passwordHash("hash")
                .nickname("필터테스터")
                .build());
        bearerToken = "Bearer " + jwtTokenProvider.createAccessToken(user.getId());
    }

    @Test
    void noToken_returns401InErrorResponseFormat() throws Exception {
        mockMvc.perform(get("/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void malformedToken_returns401InErrorResponseFormat() throws Exception {
        mockMvc.perform(get("/users/me").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void validTokenButNonNumericSubject_returns401NotServerError() throws Exception {
        // 서명은 유효하지만 subject가 사용자 식별자로 해석되지 않는 토큰. 방어가 없으면
        // getUserId의 NumberFormatException이 필터에서 터져 500이 된다(FR-024).
        String token = jwtTokenProvider.createAccessToken(null);

        mockMvc.perform(get("/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void validTokenWithMissingRequiredParam_returns400InErrorResponseFormat() throws Exception {
        mockMvc.perform(get("/signs").header("Authorization", bearerToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void validTokenWithMalformedJsonBody_returns400InErrorResponseFormat() throws Exception {
        mockMvc.perform(post("/wrong-answers")
                        .header("Authorization", bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"signId\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }
}
