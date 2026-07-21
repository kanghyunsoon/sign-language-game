package backend.ssafy.suhwa.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.tags.Tag;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    public static final String BEARER_SCHEME_NAME = "bearerAuth";

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("한컴수화연습 API")
                        .description("백엔드 CRUD API 1차 구축 (WebSocket/SSE 제외)")
                        .version("v1"))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME_NAME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .tags(List.of(
                        new Tag().name("Auth").description("회원가입/로그인/토큰 재발급/로그아웃"),
                        new Tag().name("Users").description("회원 프로필 조회/수정/탈퇴"),
                        new Tag().name("Learning").description("학습 콘텐츠/오답노트/테스트 결과"),
                        new Tag().name("GameRooms").description("게임방 생성/입장/진행/결과"),
                        new Tag().name("Ranking").description("랭킹 조회")));
    }
}
