package backend.ssafy.suhwa.game.controller;

import backend.ssafy.suhwa.game.dto.GameResultRequest;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.dto.JoinRoomRequest;
import backend.ssafy.suhwa.game.dto.ReadyRequest;
import backend.ssafy.suhwa.game.service.GameRoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GameRoomController implements GameRoomApi {

    private final GameRoomService gameRoomService;

    @Override
    public ResponseEntity<GameRoomResponse> createRoom(Long userId) {
        GameRoomResponse response = GameRoomResponse.from(gameRoomService.create(userId));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Override
    public ResponseEntity<GameRoomResponse> joinRoom(Long userId, JoinRoomRequest request) {
        GameRoomResponse response = GameRoomResponse.from(gameRoomService.join(request.roomCode(), userId));
        return ResponseEntity.ok(response);
    }

    @Override
    public ResponseEntity<Void> leaveRoom(Long userId, Long roomId) {
        gameRoomService.leave(roomId, userId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<GameRoomResponse> setReady(Long userId, Long roomId, ReadyRequest request) {
        GameRoomResponse response =
                GameRoomResponse.from(gameRoomService.setReady(roomId, userId, request.isReady()));
        return ResponseEntity.ok(response);
    }

    @Override
    public ResponseEntity<GameRoomResponse> startGame(Long userId, Long roomId) {
        GameRoomResponse response = GameRoomResponse.from(gameRoomService.start(roomId, userId));
        return ResponseEntity.ok(response);
    }

    @Override
    public ResponseEntity<GameResultResponse> reportResult(Long userId, Long roomId, GameResultRequest request) {
        GameResultResponse response =
                gameRoomService.reportResult(roomId, userId, request.hostScore(), request.guestScore());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
