package backend.ssafy.suhwa.game.realtime.dto;

import backend.ssafy.suhwa.game.domain.GameRoom;
import java.util.List;

public record LobbyRoomList(List<LobbyRoomSummary> rooms) {

    public static LobbyRoomList from(List<GameRoom> rooms) {
        return new LobbyRoomList(rooms.stream().map(LobbyRoomSummary::from).toList());
    }
}
