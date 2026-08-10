package backend.ssafy.suhwa.webrtc.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.webrtc.dto.IceServerListResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "WebRTC")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface IceServerApi {

    @Operation(summary = "STUN/TURN 접속 정보 조회", description =
            "방 소속 여부와 무관한 정적 인프라 설정값이라 일반 로그인 인증만 요구한다(FR-027).")
    @ApiResponse(responseCode = "200", description = "영상 통화 연결에 사용할 STUN/TURN 서버 목록")
    @GetMapping("/webrtc/ice-servers")
    ResponseEntity<IceServerListResponse> getIceServers();
}
