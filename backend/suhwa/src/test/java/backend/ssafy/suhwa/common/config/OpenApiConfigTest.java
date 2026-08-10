package backend.ssafy.suhwa.common.config;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class OpenApiConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void apiDocsIncludesBearerAuthSchemeAndDomainTags() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.type").value("http"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"))
                .andExpect(jsonPath("$.tags[*].name", hasItems(
                        "Auth", "Users", "Learning", "Growth", "SoloResults",
                        "GameRooms", "Ranking", "GameRooms-WebSocket")))
                .andExpect(jsonPath("$.tags[*].name", not(hasItem("SoloSessions"))));
    }

    @Test
    void apiDocsExposesOnlySupportedGrowthAndRewardContracts() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/growth/attendance'].get").exists())
                .andExpect(jsonPath("$.paths['/growth/attendance'].post").exists())
                .andExpect(jsonPath("$.paths['/growth/pet'].get").exists())
                .andExpect(jsonPath("$.paths['/test-sessions/{testSessionId}/complete'].post").exists())
                .andExpect(jsonPath("$.paths['/solo-results'].post").exists())
                .andExpect(jsonPath("$.paths['/game-rooms/{roomId}/results'].post").exists())
                .andExpect(jsonPath("$.paths['/rankings'].get").exists())
                .andExpect(jsonPath("$.paths['/practice-sessions']").doesNotExist())
                .andExpect(jsonPath("$.paths['/practice-sessions/{practiceSessionId}/complete']").doesNotExist())
                .andExpect(jsonPath("$.paths['/game/solo/sessions']").doesNotExist())
                .andExpect(jsonPath("$.paths['/game/solo/sessions/{soloSessionId}/complete']").doesNotExist())
                .andExpect(jsonPath("$.paths['/game/solo/results']").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.SoloResultRequest.properties.score.description")
                        .value(containsString("초")))
                .andExpect(jsonPath("$.components.schemas.RankingEntry.properties.playDurationMs").doesNotExist());
    }

    @Test
    void apiDocsIncludesDocumentationOnlyWebSocketPathAndMessageSchemas() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/ws/game-rooms/{roomId}'].get").exists())
                .andExpect(jsonPath("$.components.schemas.PeerLeftMessage").exists())
                .andExpect(jsonPath("$.components.schemas.GameStartedMessage").exists())
                .andExpect(jsonPath("$.components.schemas.SignalMessage").exists())
                .andExpect(jsonPath("$.components.schemas.ErrorMessage").exists());
    }

    @Test
    void apiDocsDoesNotExposeRemovedUserProfileImage() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.SignupRequest.properties.profileImageUrl")
                        .doesNotExist())
                .andExpect(jsonPath("$.components.schemas.UpdateProfileRequest.properties.profileImageUrl")
                        .doesNotExist())
                .andExpect(jsonPath("$.components.schemas.UserProfileResponse.properties.profileImageUrl")
                        .doesNotExist());
    }

    /**
     * 운영 nginx가 /api/ 하위 요청만 백엔드로 넘기고 X-Forwarded-Prefix: /api 를 보내는 구조라,
     * 백엔드가 이 헤더를 반영해 자기참조 URL에 /api를 붙이지 않으면 swagger-ui가 그 다음 요청을
     * prefix 없이 보내 nginx의 location / (404)에 걸린다. server.forward-headers-strategy=framework
     * 설정이 실제로 이 헤더를 반영하는지 검증한다.
     */
    @Test
    void swaggerConfigUrlsRespectForwardedPrefixFromReverseProxy() throws Exception {
        mockMvc.perform(get("/v3/api-docs/swagger-config").header("X-Forwarded-Prefix", "/api"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configUrl").value("/api/v3/api-docs/swagger-config"))
                .andExpect(jsonPath("$.url").value("/api/v3/api-docs"));
    }
}
