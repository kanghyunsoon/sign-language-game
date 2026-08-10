package backend.ssafy.suhwa.game.realtime.dto;

import backend.ssafy.suhwa.game.domain.GameRoom;
import java.util.List;
import java.util.function.Function;

public record LobbyRoomList(List<LobbyRoomSummary> rooms) {

    public static LobbyRoomList from(List<GameRoom> rooms, Function<Long, String> hostNameResolver) {
        return new LobbyRoomList(rooms.stream()
                .map(room -> LobbyRoomSummary.from(room, hostNameResolver.apply(room.getHostUserId())))
                .toList());
    }
}
