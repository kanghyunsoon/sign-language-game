package backend.ssafy.suhwa.game.realtime.dto;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.domain.SymbolRange;

public record LobbyRoomSummary(
        Long id,
        String roomCode,
        String title,
        String hostName,
        GameRoomStatus status,
        int participantCount,
        int capacity,
        GameType gameType,
        SymbolRange symbolRange) {

    private static final int CAPACITY = 2;

    public static LobbyRoomSummary from(GameRoom room, String hostName) {
        int participantCount = room.getGuestUserId() != null ? 2 : 1;
        return new LobbyRoomSummary(
                room.getId(),
                room.getRoomCode(),
                room.getRoomTitle(),
                hostName,
                room.getStatus(),
                participantCount,
                CAPACITY,
                room.getGameType(),
                room.getSymbolRange());
    }
}
