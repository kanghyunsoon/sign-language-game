package backend.ssafy.suhwa.game.dto;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;

public record GameRoomResponse(
        Long id,
        String roomCode,
        Long hostUserId,
        Long guestUserId,
        boolean hostReady,
        boolean guestReady,
        GameRoomStatus status,
        int participantCount,
        int capacity,
        GameType gameType,
        String realtimeTicket) {

    private static final int CAPACITY = 2;

    /** 티켓이 필요 없는 응답(준비 상태 변경, 시작 등)에 사용한다. */
    public static GameRoomResponse from(GameRoom room) {
        return from(room, null);
    }

    /** 생성/입장/재입장 응답처럼 실시간 연결용 티켓을 함께 내려줘야 할 때 사용한다(FR-001/002/016). */
    public static GameRoomResponse from(GameRoom room, String realtimeTicket) {
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
                CAPACITY,
                room.getGameType(),
                realtimeTicket);
    }
}
