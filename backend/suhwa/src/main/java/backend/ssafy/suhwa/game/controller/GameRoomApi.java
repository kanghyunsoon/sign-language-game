package backend.ssafy.suhwa.game.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.game.dto.CreateRoomRequest;
import backend.ssafy.suhwa.game.dto.GameResultRequest;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.dto.JoinRoomRequest;
import backend.ssafy.suhwa.game.dto.ReadyRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "GameRooms")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface GameRoomApi {

    @Operation(summary = "게임방 생성 (변경 — gameType 필수, 응답에 realtimeTicket 포함)", description =
            "고유 참가 코드가 발급된 방 생성, 요청자가 방장이 됨. 게임 종류(FR-017/018)와 실시간 연결용 "
                    + "단기 티켓(FR-001)이 응답에 함께 포함되어, 별도 API 호출 없이 방 WebSocket을 즉시 연결할 수 있다(FR-002).")
    @ApiResponse(responseCode = "201", description = "방 생성 성공")
    @ApiResponse(responseCode = "400", description = "gameType 누락 (FR-017)")
    @PostMapping("/game-rooms")
    ResponseEntity<GameRoomResponse> createRoom(
            @LoginUser Long userId, @RequestBody @Valid CreateRoomRequest request);

    @Operation(summary = "참가 코드로 게임방 입장 (변경 — 응답에 realtimeTicket 포함)")
    @ApiResponse(responseCode = "200", description =
            "입장 성공, 현재 인원/정원/방 상태와 게임 종류·실시간 연결용 티켓 포함(FR-001/002/018). "
                    + "이미 참가 중인 방에 다시 입장해도 새 티켓이 발급된다(FR-016).")
    @ApiResponse(responseCode = "404", description = "존재하지 않는 참가 코드 (Edge Case)")
    @ApiResponse(responseCode = "409", description = "정원 초과 또는 이미 진행 중인 방 (FR-020)")
    @PostMapping("/game-rooms/join")
    ResponseEntity<GameRoomResponse> joinRoom(@LoginUser Long userId, @RequestBody @Valid JoinRoomRequest request);

    @Operation(summary = "게임방 나가기", description =
            "대기 중(WAITING)인 방이면 방장 위임(FR-022) 또는 마지막 인원 시 CLOSED 전환(FR-023). "
                    + "진행 중(IN_PROGRESS)인 방이면 위임 없이 즉시 CLOSED로 전환해 게임을 무효화한다(결과 미저장).")
    @ApiResponse(responseCode = "204", description = "즉시 퇴장 처리")
    @ApiResponse(responseCode = "403", description = "해당 방 참가자가 아님 (Edge Case)")
    @PostMapping("/game-rooms/{roomId}/leave")
    ResponseEntity<Void> leaveRoom(@LoginUser Long userId, @PathVariable Long roomId);

    @Operation(summary = "준비 상태 표시")
    @ApiResponse(responseCode = "200", description = "준비 상태 갱신 (FR-025)")
    @PostMapping("/game-rooms/{roomId}/ready")
    ResponseEntity<GameRoomResponse> setReady(
            @LoginUser Long userId, @PathVariable Long roomId, @RequestBody @Valid ReadyRequest request);

    @Operation(summary = "게임 시작 요청 (방장 전용)")
    @ApiResponse(responseCode = "200", description = "전원 준비 완료 시 방 상태 IN_PROGRESS로 전환 (FR-026)")
    @ApiResponse(responseCode = "409", description = "준비되지 않은 참가자 존재 (FR-026)")
    @PostMapping("/game-rooms/{roomId}/start")
    ResponseEntity<GameRoomResponse> startGame(@LoginUser Long userId, @PathVariable Long roomId);

    @Operation(summary = "게임 결과 보고 (변경 — 점수 대신 승자 정보만)", description =
            "001/002 계약을 대체한다. 점수는 더 이상 받지 않는다(FR-021). 승자는 역할이 아니라 사용자 ID로 "
                    + "직접 지정하며, 생략하거나 null이면 무승부로 처리되어 어느 쪽의 승패에도 반영되지 않는다(FR-033).")
    @ApiResponse(responseCode = "201", description =
            "winnerUserId가 있으면 승자에게 game_results score=1, 패자에게 score=0 행을 반영한다(FR-021/026). "
                    + "방은 CLOSED가 아니라 WAITING으로 복귀해 재대결이 가능해진다(FR-013).")
    @ApiResponse(responseCode = "400", description = "winnerUserId가 해당 방의 참가자(host/guest)가 아님")
    @ApiResponse(responseCode = "403", description = "해당 게임 참가자가 아님 (Edge Case)")
    @ApiResponse(responseCode = "409", description = "방이 이미 진행 중(IN_PROGRESS)이 아님 — 중복 보고 또는 무효화된 매치")
    @PostMapping("/game-rooms/{roomId}/results")
    ResponseEntity<GameResultResponse> reportResult(
            @LoginUser Long userId, @PathVariable Long roomId, @RequestBody @Valid GameResultRequest request);
}
