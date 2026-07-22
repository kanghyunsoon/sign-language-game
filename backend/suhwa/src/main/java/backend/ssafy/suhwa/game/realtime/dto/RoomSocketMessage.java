package backend.ssafy.suhwa.game.realtime.dto;

/** 방 내 WebSocket 메시지 공통 봉투(contracts/realtime-websocket-messages.md). */
public record RoomSocketMessage(String type, Object payload) {
}
