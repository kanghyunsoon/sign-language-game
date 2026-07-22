package backend.ssafy.suhwa.game.realtime.dto;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;

public record LobbyRoomSummary(
        Long id,
        String roomCode,
        GameRoomStatus status,
        int participantCount,
        int capacity) {

    private static final int CAPACITY = 2;

    public static LobbyRoomSummary from(GameRoom room) {
        int participantCount = room.getGuestUserId() != null ? 2 : 1;
        return new LobbyRoomSummary(
                room.getId(), room.getRoomCode(), room.getStatus(), participantCount, CAPACITY);
    }
}
