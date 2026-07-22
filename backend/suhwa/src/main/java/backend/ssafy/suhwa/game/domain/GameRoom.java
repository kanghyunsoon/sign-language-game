package backend.ssafy.suhwa.game.domain;

import backend.ssafy.suhwa.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "game_rooms")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GameRoom extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_code", nullable = false, unique = true, length = 20)
    private String roomCode;

    @Column(name = "host_user_id", nullable = false)
    private Long hostUserId;

    @Column(name = "guest_user_id")
    private Long guestUserId;

    @Column(name = "host_ready", nullable = false)
    private boolean hostReady;

    @Column(name = "guest_ready", nullable = false)
    private boolean guestReady;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private GameRoomStatus status;

    @Version
    @Column(nullable = false)
    private Long version;

    @Builder
    public GameRoom(String roomCode, Long hostUserId) {
        this.roomCode = roomCode;
        this.hostUserId = hostUserId;
        this.hostReady = false;
        this.guestReady = false;
        this.status = GameRoomStatus.WAITING;
    }

    public boolean isHost(Long userId) {
        return hostUserId.equals(userId);
    }

    public boolean isParticipant(Long userId) {
        return isHost(userId) || userId.equals(guestUserId);
    }

    public boolean isFull() {
        return guestUserId != null;
    }

    public void assignGuest(Long userId) {
        this.guestUserId = userId;
        this.guestReady = false;
    }

    public void setReady(Long userId, boolean ready) {
        if (isHost(userId)) {
            this.hostReady = ready;
        } else {
            this.guestReady = ready;
        }
    }

    public boolean bothReady() {
        return hostReady && guestReady;
    }

    public void start() {
        this.status = GameRoomStatus.IN_PROGRESS;
    }

    public void close() {
        this.status = GameRoomStatus.CLOSED;
    }

    /** WAITING 상태에서 방장이 나가고 참가자가 남아있을 때, 방장 권한을 위임한다(FR-022). */
    public void delegateHostToGuest() {
        this.hostUserId = this.guestUserId;
        this.hostReady = this.guestReady;
        this.guestUserId = null;
        this.guestReady = false;
    }

    /** WAITING 상태에서 참가자(비방장)가 나갈 때 자리를 비운다. */
    public void removeGuest() {
        this.guestUserId = null;
        this.guestReady = false;
    }
}
