package backend.ssafy.suhwa.common.config;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.common.security.JwtAuthenticationFilter;
import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.servlet.HandlerExceptionResolver;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String[] PERMIT_ALL_PATHS = {
            "/auth/signup", "/auth/login", "/auth/refresh",
            "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**",
            "/actuator/health",
            // 브라우저 표준 EventSource/WebSocket은 커스텀 Authorization 헤더를 보낼 수 없어 JWT
            // 인증이 불가능하다. 대신 ticket 쿼리 파라미터로 접근을 제어한다(FR-022/024, research.md #8).
            "/game-rooms/subscribe", "/ws/game-rooms/**",
            // SSE 등 비동기 응답이 끊긴 뒤 컨테이너가 에러 처리를 위해 /error로 다시 디스패치할 때도
            // 보안 필터 체인이 ASYNC/ERROR 디스패치 타입에 대해 다시 실행된다(버그픽스). 이 시점엔
            // 원래 요청의 인증 컨텍스트가 없어 /error가 허용 목록에 없으면 매번
            // AuthorizationDeniedException이 나고, 이미 스트리밍이 시작된 응답이라 그 예외조차
            // 정상 처리할 수 없어 로그만 오염시킨다.
            "/error"
    };

    private final JwtTokenProvider jwtTokenProvider;

    public SecurityConfig(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver,
            CorsConfigurationSource corsConfigurationSource) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(PERMIT_ALL_PATHS).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(exception -> exception
                        // httpBasic/formLogin을 비활성화하면 Spring Security 기본 진입점이 없어 401/403이
                        // GlobalExceptionHandler를 거치지 않고 응답돼버린다. HandlerExceptionResolver에 위임해
                        // GlobalExceptionHandler가 다른 모든 API 오류와 동일한 ErrorResponse 형식으로 처리하게 한다.
                        .authenticationEntryPoint((request, response, authException) ->
                                resolver.resolveException(request, response, null,
                                        new BusinessException(ErrorCode.UNAUTHENTICATED)))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                resolver.resolveException(request, response, null,
                                        new BusinessException(ErrorCode.ACCESS_DENIED))))
                .addFilterBefore(
                        new JwtAuthenticationFilter(jwtTokenProvider),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
