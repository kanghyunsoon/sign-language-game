package backend.ssafy.suhwa.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * CORS 허용 오리진을 지정하지 않았을 때의 동작을 고정한다(FR-019, STABLE-08-10-T04).
 *
 * <p>지라 원안은 "미설정 시 전체 허용"이었으나, 설정 누락이 곧 무제한 개방이 되는 편이 훨씬
 * 위험하므로 <b>전면 차단</b>(fail-closed)으로 정했다({@link CorsConfig} 참조). 나중에 누군가
 * "편의상 비면 전체 허용"으로 되돌리지 못하도록 테스트로 못 박는다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "cors.allowed-origins=")
class CorsConfigUnsetTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CorsConfigurationSource corsConfigurationSource;

    @Test
    void unsetOrigins_blocksEveryCrossOriginRequest() throws Exception {
        mockMvc.perform(get("/actuator/health").header("Origin", "http://any.example.com"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void unsetOrigins_doesNotFallBackToWildcard() {
        CorsConfiguration configuration = ((org.springframework.web.cors.UrlBasedCorsConfigurationSource)
                corsConfigurationSource).getCorsConfigurations().get("/**");

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins())
                .as("빈 목록이어야 한다 — null이거나 '*'이면 미설정이 전체 허용으로 뒤집힌다")
                .isEmpty();
        assertThat(configuration.getAllowedOriginPatterns()).isNullOrEmpty();
    }
}
