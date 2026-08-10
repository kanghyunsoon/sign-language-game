package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 방 생명주기가 끝나면 실시간 상태가 레지스트리에 남지 않아야 한다.
 *
 * <p>{@code notifyPeerLeft}는 나간 당사자 하나만 제거하므로, IN_PROGRESS 중 한쪽이 나가 방이
 * CLOSED되면 <b>남은 참가자의 상태가 힙에 계속 남았다</b>. 방 수에 비례해 누적되는 누수이며,
 * 정리 스케줄러도 DB 행만 지우고 레지스트리는 건드리지 않았다.
 *
 * <p>클래스 수준 {@code @Transactional}을 쓰지 않는다 — 폐기는 커밋 후에만 실행되므로 실제 커밋
 * 경계가 있어야 검증이 성립한다.
 */
@SpringBootTest
class RoomDisposalIntegrationTest {

    @Autowired
    private GameRoomService gameRoomService;

    @Autowired
    private RoomParticipantRegistry registry;

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private UserRepository userRepository;

    private Long hostId;
    private Long guestId;

    @BeforeEach
    void setUp() {
        hostId = newUser("dispose-host");
        guestId = newUser("dispose-guest");
    }

    /** 진행 중 나가기는 방을 곧바로 CLOSED로 만든다(FR-021/023) — 남은 상대의 상태도 회수해야 한다. */
    @Test
    void leaveDuringGame_closesRoom_andDisposesRemainingParticipantState() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        gameRoomService.start(room.id(), hostId);
        assertThat(registry.getRoom(room.id()))
                .as("create/join이 확인 대기 타이머를 걸어 레지스트리에 상태가 있어야 한다")
                .isNotNull();

        gameRoomService.leave(room.id(), hostId);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(registry.getRoom(room.id()))
                .as("방이 CLOSED로 끝났으면 남은 참가자의 상태까지 사라져야 한다")
                .isNull();
    }

    /** 방장이 혼자 있는 방을 나가면 방이 CLOSED된다 — 이 경로도 폐기 대상이다. */
    @Test
    void hostLeavesEmptyRoom_closesRoom_andDisposesState() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        assertThat(registry.getRoom(room.id())).isNotNull();

        gameRoomService.leave(room.id(), hostId);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(registry.getRoom(room.id())).isNull();
    }

    /**
     * 이미 CLOSED인 방에 뒤늦게 도착한 leave()는 안전망으로 동작해야 한다 — 유예 타이머가 방이
     * 닫힌 뒤에 만료되는 경우가 이 경로다.
     */
    @Test
    void lateLeaveOnClosedRoom_disposesLeftoverState() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        gameRoomService.start(room.id(), hostId);
        gameRoomService.leave(room.id(), hostId);

        // 폐기 이후에 남은 참가자가 다시 나타난 상황을 만든다(뒤늦은 타이머가 참가자를 재생성하는 경로).
        registry.getOrCreateRoom(room.id()).getOrCreateParticipant(guestId);
        assertThat(registry.getRoom(room.id())).isNotNull();

        gameRoomService.leave(room.id(), guestId);

        assertThat(registry.getRoom(room.id()))
                .as("CLOSED 방에 대한 뒤늦은 나가기도 잔여물을 치워야 한다")
                .isNull();
    }

    private Long newUser(String prefix) {
        return userRepository.save(User.builder()
                        .email(prefix + "-" + UUID.randomUUID() + "@test.com")
                        .passwordHash("hashed")
                        .nickname("방폐기")
                        .build())
                .getId();
    }
}
