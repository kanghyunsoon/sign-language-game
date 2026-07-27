package backend.ssafy.suhwa.common.config;

import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 프론트엔드가 별도 오리진(다른 도메인/포트)에 배포되므로, 환경변수로 허용 Origin을
 * 주입한다(FR-007, research.md #7). Spring Security 6+에서 CORS는 SecurityFilterChain에
 * 명시적으로 연결해야 반영되므로 {@link SecurityConfig}에서 이 빈을 사용한다.
 *
 * <p><b>미설정 시 정책(FR-019, research.md #5)</b>: {@code CORS_ALLOWED_ORIGINS}가 비어 있으면
 * <b>허용 오리진 없음 = 전면 차단</b>(fail-closed)이다. 지라 STABLE-08-10 원안은 "미설정 시 전체
 * 허용"이었으나, 설정 누락이 곧 무제한 개방으로 이어지는 편이 훨씬 위험하므로 반대로 정한다.
 * 대신 설정 누락을 조용히 넘기지 않도록 기동 시 경고 로그를 남긴다. 실시간 WebSocket 핸드셰이크의
 * Origin 검사도 같은 값을 써서 동일하게 동작한다({@code RealtimeWebSocketConfig}).
 */
@Configuration
public class CorsConfig {

    private static final Logger log = LoggerFactory.getLogger(CorsConfig.class);

    private final List<String> allowedOrigins;

    public CorsConfig(@Value("${cors.allowed-origins:}") String allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
        if (this.allowedOrigins.isEmpty()) {
            log.warn("CORS 허용 오리진이 설정되지 않았습니다(CORS_ALLOWED_ORIGINS). "
                    + "브라우저에서 오는 교차 출처 요청과 실시간 WebSocket 연결이 모두 차단됩니다. "
                    + "프론트엔드를 붙이려면 이 환경변수를 반드시 지정하세요.");
        }
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
