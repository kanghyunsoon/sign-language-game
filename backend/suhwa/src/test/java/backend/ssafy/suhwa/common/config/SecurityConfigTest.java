package backend.ssafy.suhwa.common.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Spring Security 필터 체인에서 발생하는 401/403이 GlobalExceptionHandler와
 * 동일한 ErrorResponse 형식으로 응답되는지 검증한다(FR-001).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(SecurityConfigTest.ForbiddenProbeController.class)
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    /** {@code @Import}로 명시적으로 등록하는 테스트 전용 컨트롤러 — accessDeniedHandler 경로를 강제로 태우기 위함. */
    @RestController
    static class ForbiddenProbeController {
        @GetMapping("/test-support/forbidden")
        public void alwaysForbidden() {
            throw new AccessDeniedException("테스트용 강제 거부");
        }
    }

    @Test
    void unauthenticatedRequest_returnsUnifiedErrorFormat() throws Exception {
        mockMvc.perform(get("/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void accessDeniedException_returnsUnifiedErrorFormat() throws Exception {
        String token = jwtTokenProvider.createAccessToken(1L);

        mockMvc.perform(get("/test-support/forbidden").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"))
                .andExpect(jsonPath("$.message").exists());
    }
}
