package backend.ssafy.suhwa.game.dto;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;

public record GameRoomResponse(
        Long id,
        String roomCode,
        Long hostUserId,
        Long guestUserId,
        boolean hostReady,
        boolean guestReady,
        GameRoomStatus status,
        int participantCount,
        int capacity) {

    private static final int CAPACITY = 2;

    public static GameRoomResponse from(GameRoom room) {
        int participantCount = room.getGuestUserId() != null ? 2 : 1;
        return new GameRoomResponse(
                room.getId(),
                room.getRoomCode(),
                room.getHostUserId(),
                room.getGuestUserId(),
                room.isHostReady(),
                room.isGuestReady(),
                room.getStatus(),
                participantCount,
                CAPACITY);
    }
}
