package backend.ssafy.suhwa.game.realtime.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Tag(name = "GameRooms")
public interface LobbySseApi {

    @Operation(summary = "대기 중인 게임방 목록 실시간 구독 (SSE, 변경 — title/hostName/symbolRange 포함)", description =
            "EventSource는 커스텀 헤더를 보낼 수 없어 인증은 ticket 쿼리 파라미터(단기 1회용 티켓)로 검증한다(FR-022).")
    @ApiResponse(responseCode = "200", description =
            "text/event-stream. 최초 연결 시 event: snapshot으로 전체 목록, 이후 event: update로 변경분 전송 (FR-009~FR-012). "
                    + "각 방 항목은 title(방 제목), hostName(현재 방장 닉네임), symbolRange, gameType, 인원/정원, 상태를 포함하며, "
                    + "방장이 위임되면 update 이벤트의 hostName이 새 방장 닉네임으로 갱신되어 전송된다.")
    @ApiResponse(responseCode = "401", description = "유효하지 않거나 이미 소비된/만료된 티켓 (FR-022)")
    @GetMapping("/game-rooms/subscribe")
    SseEmitter subscribe(@RequestParam(required = false) String ticket, HttpServletResponse response);
}
