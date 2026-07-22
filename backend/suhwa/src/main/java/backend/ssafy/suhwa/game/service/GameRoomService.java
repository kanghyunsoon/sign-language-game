package backend.ssafy.suhwa.game.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameSession;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.repository.GameSessionRepository;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    @Transactional
    public GameRoom create(Long hostUserId) {
        GameRoom room = GameRoom.builder()
                .roomCode(generateUniqueRoomCode())
                .hostUserId(hostUserId)
                .build();
        return gameRoomRepository.save(room);
    }

    @Transactional
    public GameRoom join(String roomCode, Long userId) {
        GameRoom room = getRoomByCode(roomCode);
        if (room.getStatus() != GameRoomStatus.WAITING) {
            throw new BusinessException(ErrorCode.ROOM_NOT_WAITING);
        }
        if (room.isFull()) {
            throw new BusinessException(ErrorCode.ROOM_FULL);
        }
        room.assignGuest(userId);
        return room;
    }

    @Transactional
    public void leave(Long roomId, Long userId) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);

        if (room.getStatus() == GameRoomStatus.IN_PROGRESS) {
            // 진행 중 나가기는 위임 없이 즉시 CLOSED, 결과는 저장하지 않음(FR-021/023)
            room.close();
            return;
        }

        if (room.isHost(userId)) {
            if (room.getGuestUserId() != null) {
                room.delegateHostToGuest();
            } else {
                room.close();
            }
        } else {
            room.removeGuest();
        }
    }

    @Transactional
    public GameRoom setReady(Long roomId, Long userId, boolean isReady) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);
        if (room.getStatus() != GameRoomStatus.WAITING) {
            throw new BusinessException(ErrorCode.ROOM_NOT_WAITING);
        }
        room.setReady(userId, isReady);
        return room;
    }

    @Transactional
    public GameRoom start(Long roomId, Long userId) {
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
        return room;
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
