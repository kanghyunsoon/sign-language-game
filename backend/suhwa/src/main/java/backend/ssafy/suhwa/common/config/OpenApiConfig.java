package backend.ssafy.suhwa.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.tags.Tag;
import java.util.ArrayList;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    public static final String BEARER_SCHEME_NAME = "bearerAuth";

    private static final String WS_TAG = "GameRooms-WebSocket";
    private static final String WS_PATH = "/ws/game-rooms/{roomId}";

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("한컴수화연습 API")
                        .description("백엔드 CRUD API + 실시간 계층(SSE, WebSocket 시그널링). "
                                + "WebSocket(" + WS_PATH + ")은 실제 엔드포인트가 아니라 문서화 목적으로 끼워넣은 항목(\""
                                + WS_TAG + "\" 태그)이므로 Try it out으로 호출되지 않는다.")
                        .version("v1"))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME_NAME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .tags(new ArrayList<>(List.of(
                        new Tag().name("Auth").description("회원가입/로그인/토큰 재발급/로그아웃"),
                        new Tag().name("Users").description("회원 프로필 조회/수정/탈퇴"),
                        new Tag().name("Learning").description("학습 콘텐츠/오답노트/테스트 결과"),
                        new Tag().name("GameRooms").description("게임방 생성/입장/진행/결과"),
                        new Tag().name("Ranking").description("랭킹 조회"))));
    }

    /**
     * OpenAPI 3.0은 WebSocket을 표현할 수 없다. 실제 HTTP 엔드포인트가 아닌 문서 전용
     * PathItem을 수동으로 끼워넣어, 별도 문서/도구 없이 Swagger UI 한 화면에서
     * 방 내 실시간 연결 계약(핸드셰이크 파라미터, 메시지 타입별 스키마)을 확인할 수 있게 한다.
     * 상세 서술(재접속 유예, 연결 종료 등)은 contracts/realtime-websocket-messages.md 참고.
     */
    @Bean
    public OpenApiCustomizer webSocketDocsCustomizer() {
        return openApi -> {
            openApi.getTags().add(new Tag()
                    .name(WS_TAG)
                    .description("방 내 실시간 연결. 문서 전용 항목이며 Swagger의 \"Try it out\"으로 호출할 수 없다"
                            + "(WebSocket 업그레이드 요청이라 일반 HTTP 호출로 표현 불가)."));

            registerMessageSchemas(openApi);
            openApi.getPaths().addPathItem(WS_PATH, new PathItem().get(webSocketOperation()));
        };
    }

    private Operation webSocketOperation() {
        Parameter roomIdParam = new Parameter()
                .name("roomId")
                .in("path")
                .required(true)
                .description("게임방 ID")
                .schema(new Schema<>().type("integer").format("int64"));
        Parameter ticketParam = new Parameter()
                .name("ticket")
                .in("query")
                .required(true)
                .description("POST /auth/sse-ticket으로 발급받은 1회용 단기 티켓. 로비 SSE와 별개로 매 연결마다 새로 발급받아야 한다(재사용 불가).")
                .schema(new Schema<>().type("string"));

        return new Operation()
                .addTagsItem(WS_TAG)
                .summary("게임방 실시간 WebSocket 연결 (문서 전용, 실제 HTTP GET 아님)")
                .description(
                        "핸드셰이크 성공 시 해당 방 참가자로 확정 처리된다(FR-020, FR-029). "
                                + "이후 서버→클라이언트는 PEER_DISCONNECTED / PEER_RECONNECTED / PEER_LEFT / "
                                + "GAME_STARTED / SIGNAL / ERROR 타입 메시지를, 클라이언트→서버는 SIGNAL 타입만 "
                                + "전송한다. 모든 메시지는 `{\"type\": \"...\", \"payload\": {...}}` 형태이며 "
                                + "아래 101 응답의 스키마 목록 참고.")
                .addParametersItem(roomIdParam)
                .addParametersItem(ticketParam)
                .responses(new ApiResponses()
                        .addApiResponse("101", new ApiResponse()
                                .description("Switching Protocols. 연결 이후 오가는 메시지는 아래 스키마 중 하나(SIGNAL은 양방향).")
                                .content(new Content()
                                        .addMediaType("application/json", new MediaType()
                                                .schema(new Schema<>().oneOf(List.of(
                                                        new Schema<>().$ref("#/components/schemas/PeerDisconnectedMessage"),
                                                        new Schema<>().$ref("#/components/schemas/PeerReconnectedMessage"),
                                                        new Schema<>().$ref("#/components/schemas/PeerLeftMessage"),
                                                        new Schema<>().$ref("#/components/schemas/GameStartedMessage"),
                                                        new Schema<>().$ref("#/components/schemas/SignalMessage"),
                                                        new Schema<>().$ref("#/components/schemas/ErrorMessage")))))))
                        .addApiResponse("403", new ApiResponse()
                                .description("티켓이 무효/만료/이미 소비됨, 또는 해당 방 참가자가 아니어서 핸드셰이크 거부 (FR-024)")));
    }

    private void registerMessageSchemas(OpenAPI openApi) {
        Components components = openApi.getComponents();

        components.addSchemas("PeerDisconnectedMessage", messageSchema("PEER_DISCONNECTED",
                new Schema<>().type("object")
                        .description("같은 방 상대방의 연결이 끊겨 재접속 유예 시간이 시작될 때 (FR-019)")
                        .addProperty("userId", int64Schema())
                        .required(List.of("userId"))));

        components.addSchemas("PeerReconnectedMessage", messageSchema("PEER_RECONNECTED",
                new Schema<>().type("object")
                        .description("유예 시간 안에 상대방이 재접속에 성공했을 때 (FR-019)")
                        .addProperty("userId", int64Schema())
                        .required(List.of("userId"))));

        components.addSchemas("PeerLeftMessage", messageSchema("PEER_LEFT",
                new Schema<>().type("object")
                        .description("재접속 유예 만료, 명시적 나가기, 최초 연결 확인 대기 만료 중 하나로 확정 퇴장했을 때 "
                                + "(FR-016, FR-018, FR-019, FR-029)")
                        .addProperty("userId", int64Schema())
                        .addProperty("newHostUserId", int64Schema().nullable(true)
                                .description("방장 위임이 발생한 경우에만 값이 채워짐"))
                        .required(List.of("userId", "newHostUserId"))));

        components.addSchemas("GameStartedMessage", messageSchema("GAME_STARTED",
                new Schema<>().type("object")
                        .description("방장의 시작 요청이 성공해 방 상태가 IN_PROGRESS로 전환됐을 때 (FR-021)")
                        .addProperty("roomId", int64Schema())
                        .required(List.of("roomId"))));

        components.addSchemas("SignalMessage", messageSchema("SIGNAL",
                new Schema<>().type("object")
                        .description("WebRTC 시그널(offer/answer/ICE candidate). 서버는 payload를 검증/가공하지 않고 "
                                + "그대로 중계한다. 클라이언트→서버(중계 요청)와 서버→클라이언트(중계 결과) 양방향에 "
                                + "동일한 형태로 쓰인다 (FR-025, FR-026)")));

        components.addSchemas("ErrorMessage", messageSchema("ERROR",
                new Schema<>().type("object")
                        .description("방 소속이 아니게 된 이후에도 메시지를 보내는 등 검증 실패 시 (FR-024)")
                        .addProperty("code", new Schema<>().type("string"))
                        .addProperty("message", new Schema<>().type("string"))
                        .required(List.of("code", "message"))));
    }

    private Schema<Object> messageSchema(String typeConst, Schema<?> payloadSchema) {
        return new Schema<>()
                .type("object")
                .addProperty("type", new Schema<>().type("string").example(typeConst))
                .addProperty("payload", payloadSchema)
                .required(List.of("type", "payload"));
    }

    private Schema<Object> int64Schema() {
        return new Schema<>().type("integer").format("int64");
    }
}
