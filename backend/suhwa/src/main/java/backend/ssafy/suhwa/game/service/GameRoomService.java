package backend.ssafy.suhwa.game.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameSession;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.repository.GameSessionRepository;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * roomId/userId 등 순수 도메인 파라미터만 받고 HttpServletRequest/DTO 등 HTTP 종속 타입은
 * 받지 않는다(research.md #9) — 향후 WebSocket 연결 해제 핸들러가 leave 등을 그대로 재사용할 수 있도록.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameRoomService {

    private static final int ROOM_CODE_LENGTH = 6;
    private static final int ROOM_CODE_MAX_RETRY = 10;
    private static final String ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final GameRoomRepository gameRoomRepository;
    private final GameSessionRepository gameSessionRepository;
    private final UserRepository userRepository;
    private final RoomRealtimeNotifier roomRealtimeNotifier;
    private final LobbyBroadcastService lobbyBroadcastService;

    @Transactional
    public GameRoomResponse create(Long hostUserId) {
        GameRoom room = GameRoom.builder()
                .roomCode(generateUniqueRoomCode())
                .hostUserId(hostUserId)
                .build();
        return GameRoomResponse.from(gameRoomRepository.save(room));
    }

    @Transactional
    public GameRoomResponse join(String roomCode, Long userId) {
        GameRoom room = getRoomByCode(roomCode);
        // 이미 이 방의 참가자인 재입장 요청은 인원수를 늘리지 않고 현재 상태를 그대로 반환한다
        // (FR-020, research.md #14-1 — 그렇지 않으면 guest 재입장이 ROOM_FULL로 오거부되거나
        // host 본인의 재호출이 host/guest를 같은 사람으로 만들어버리는 결함이 있었다).
        if (room.isParticipant(userId)) {
            return GameRoomResponse.from(room);
        }
        if (room.getStatus() != GameRoomStatus.WAITING) {
            throw new BusinessException(ErrorCode.ROOM_NOT_WAITING);
        }
        if (room.isFull()) {
            throw new BusinessException(ErrorCode.ROOM_FULL);
        }
        room.assignGuest(userId);
        return GameRoomResponse.from(room);
    }

    @Transactional
    public void leave(Long roomId, Long userId) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);

        Long newHostUserId = null;
        if (room.getStatus() == GameRoomStatus.IN_PROGRESS) {
            // 진행 중 나가기는 위임 없이 즉시 CLOSED, 결과는 저장하지 않음(FR-021/023)
            room.close();
        } else if (room.isHost(userId)) {
            if (room.getGuestUserId() != null) {
                room.delegateHostToGuest();
                newHostUserId = room.getHostUserId();
            } else {
                room.close();
            }
        } else {
            room.removeGuest();
        }

        // leave()는 REST 명시적 나가기와 WebSocket 유예/확인대기 타이머 만료 양쪽 모두에서
        // 호출되는 단일 진입점이다 — 브로드캐스트를 이 안에 두면 두 호출자 모두에서 자동으로
        // 동작한다(research.md #12). 커밋 전에 브로드캐스트하면 알림을 받은 클라이언트가 곧바로
        // 방 상태를 재조회했을 때 아직 반영되지 않은 값을 읽는 경쟁 조건이 생기므로, 트랜잭션이
        // 실제로 커밋된 이후에만 호출되도록 등록한다.
        Long finalNewHostUserId = newHostUserId;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                roomRealtimeNotifier.notifyPeerLeft(roomId, userId, finalNewHostUserId);
                lobbyBroadcastService.broadcastUpdate();
            }
        });
    }

    @Transactional
    public GameRoomResponse setReady(Long roomId, Long userId, boolean isReady) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);
        if (room.getStatus() != GameRoomStatus.WAITING) {
            throw new BusinessException(ErrorCode.ROOM_NOT_WAITING);
        }
        room.setReady(userId, isReady);
        return GameRoomResponse.from(room);
    }

    @Transactional
    public GameRoomResponse start(Long roomId, Long userId) {
        GameRoom room = getRoom(roomId);
        if (!room.isHost(userId)) {
            throw new BusinessException(ErrorCode.NOT_ROOM_HOST);
        }
        if (room.getStatus() != GameRoomStatus.WAITING) {
            throw new BusinessException(ErrorCode.ROOM_NOT_WAITING);
        }
        if (!room.bothReady()) {
            throw new BusinessException(ErrorCode.NOT_ALL_READY);
        }
        room.start();
        return GameRoomResponse.from(room);
    }

    @Transactional
    public GameResultResponse reportResult(Long roomId, Long userId, int hostScore, int guestScore) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);

        // 이미 CLOSED된 방(결과 중복 보고 또는 진행 중 나가기로 무효화된 매치 모두 포함)은
        // 사유를 구분하지 않고 동일하게 거부한다(FR-028, data-model.md GameSession 검증 규칙).
        if (room.getStatus() != GameRoomStatus.IN_PROGRESS) {
            throw new BusinessException(ErrorCode.ROOM_NOT_IN_PROGRESS);
        }

        Long winnerId = computeWinner(room, hostScore, guestScore);
        LocalDateTime startedAt = room.getUpdatedAt();

        GameSession session = gameSessionRepository.save(GameSession.builder()
                .player1Id(room.getHostUserId())
                .player2Id(room.getGuestUserId())
                .player1Score(hostScore)
                .player2Score(guestScore)
                .winnerId(winnerId)
                .startedAt(startedAt)
                .endedAt(LocalDateTime.now())
                .build());

        updateUserRecords(room.getHostUserId(), room.getGuestUserId(), winnerId);
        room.close();

        return new GameResultResponse(session.getId(), winnerId, hostScore, guestScore);
    }

    private void updateUserRecords(Long hostUserId, Long guestUserId, Long winnerId) {
        if (winnerId == null) {
            return; // 무승부는 승/패 기록에 반영하지 않음
        }
        User host = userRepository.findById(hostUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        User guest = userRepository.findById(guestUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (winnerId.equals(hostUserId)) {
            host.recordWin();
            guest.recordLoss();
        } else {
            guest.recordWin();
            host.recordLoss();
        }
    }

    private Long computeWinner(GameRoom room, int hostScore, int guestScore) {
        if (hostScore > guestScore) {
            return room.getHostUserId();
        }
        if (guestScore > hostScore) {
            return room.getGuestUserId();
        }
        return null;
    }

    private void requireParticipant(GameRoom room, Long userId) {
        if (!room.isParticipant(userId)) {
            throw new BusinessException(ErrorCode.NOT_ROOM_PARTICIPANT);
        }
    }

    private GameRoom getRoom(Long roomId) {
        return gameRoomRepository.findById(roomId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROOM_NOT_FOUND));
    }

    private GameRoom getRoomByCode(String roomCode) {
        return gameRoomRepository.findByRoomCode(roomCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROOM_NOT_FOUND));
    }

    private String generateUniqueRoomCode() {
        for (int attempt = 0; attempt < ROOM_CODE_MAX_RETRY; attempt++) {
            String candidate = randomRoomCode();
            if (!gameRoomRepository.existsByRoomCode(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("고유한 방 코드 생성에 반복적으로 실패했습니다.");
    }

    private String randomRoomCode() {
        StringBuilder sb = new StringBuilder(ROOM_CODE_LENGTH);
        for (int i = 0; i < ROOM_CODE_LENGTH; i++) {
            sb.append(ROOM_CODE_CHARS.charAt(RANDOM.nextInt(ROOM_CODE_CHARS.length())));
        }
        return sb.toString();
    }
}
