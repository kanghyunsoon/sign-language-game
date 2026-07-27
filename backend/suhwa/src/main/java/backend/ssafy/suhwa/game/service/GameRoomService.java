package backend.ssafy.suhwa.game.service;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.ParticipantLiveState;
import backend.ssafy.suhwa.game.realtime.RoomLiveState;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.concurrent.ScheduledFuture;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * roomId/userId 등 순수 도메인 파라미터만 받고 HttpServletRequest/DTO 등 HTTP 종속 타입은
 * 받지 않는다(research.md #9) — 향후 WebSocket 연결 해제 핸들러가 leave 등을 그대로 재사용할 수 있도록.
 */
@Service
@Transactional(readOnly = true)
public class GameRoomService {

    private static final int ROOM_CODE_LENGTH = 6;
    private static final int ROOM_CODE_MAX_RETRY = 10;
    private static final String ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final GameRoomRepository gameRoomRepository;
    private final GameResultService gameResultService;
    private final RoomRealtimeNotifier roomRealtimeNotifier;
    private final LobbyBroadcastService lobbyBroadcastService;
    private final RoomParticipantRegistry roomParticipantRegistry;
    private final RealtimeTicketService realtimeTicketService;
    private final TaskScheduler taskScheduler;
    private final long joinConfirmationSeconds;
    private final GameRoomService self;

    public GameRoomService(
            GameRoomRepository gameRoomRepository,
            GameResultService gameResultService,
            RoomRealtimeNotifier roomRealtimeNotifier,
            LobbyBroadcastService lobbyBroadcastService,
            RoomParticipantRegistry roomParticipantRegistry,
            RealtimeTicketService realtimeTicketService,
            TaskScheduler taskScheduler,
            @Value("${game.room.join-confirmation-seconds}") long joinConfirmationSeconds,
            @Lazy GameRoomService self) {
        this.gameRoomRepository = gameRoomRepository;
        this.gameResultService = gameResultService;
        this.roomRealtimeNotifier = roomRealtimeNotifier;
        this.lobbyBroadcastService = lobbyBroadcastService;
        this.roomParticipantRegistry = roomParticipantRegistry;
        this.realtimeTicketService = realtimeTicketService;
        this.taskScheduler = taskScheduler;
        this.joinConfirmationSeconds = joinConfirmationSeconds;
        // 예약된 확인 대기 타이머가 만료 시 leave()를 호출할 때 self-invocation(this.leave(...))으로
        // 부르면 @Transactional 프록시를 우회해 트랜잭션이 전혀 시작되지 않는다(afterCommit에서
        // TransactionSynchronizationManager 호출 시 "Transaction synchronization is not active"로
        // 실패). 프록시를 통해 호출되도록 지연 주입된 자기 자신을 거친다.
        this.self = self;
    }

    @Transactional
    public GameRoomResponse create(Long hostUserId, GameType gameType) {
        GameRoom room = GameRoom.builder()
                .roomCode(generateUniqueRoomCode())
                .hostUserId(hostUserId)
                .gameType(gameType)
                .build();
        GameRoom saved = gameRoomRepository.save(room);
        // 실시간 연결(방 WebSocket)용 티켓을 응답에 동봉해, 별도 API 호출 없이 즉시 연결할 수
        // 있게 한다(FR-001/002). 인메모리 발급이라 트랜잭션 커밋 여부와 무관하다.
        String ticket = realtimeTicketService.issue(hostUserId);
        GameRoomResponse response = GameRoomResponse.from(saved, ticket);
        Long roomId = saved.getId();
        // 새 방이 로비 목록에 나타나므로 커밋 후 구독자에게 알린다(FR-010, research.md #9-1).
        afterCommit(lobbyBroadcastService::broadcastUpdate);
        // 방장이 15초 안에 실시간 연결을 확립하지 않으면 방치된 것으로 간주해 자동 정리한다(FR-029/030).
        afterCommit(() -> registerPendingConfirmation(roomId, hostUserId));
        return response;
    }

    @Transactional
    public GameRoomResponse join(String roomCode, Long userId) {
        GameRoom room = getRoomByCode(roomCode);
        // 이미 이 방의 참가자인 재입장 요청은 인원수를 늘리지 않고 현재 상태를 그대로 반환한다
        // (FR-020, research.md #14-1 — 그렇지 않으면 guest 재입장이 ROOM_FULL로 오거부되거나
        // host 본인의 재호출이 host/guest를 같은 사람으로 만들어버리는 결함이 있었다). 인원수
        // 변화가 없으므로 로비 브로드캐스트도 하지 않는다. 재입장이라도 실시간 연결을 다시 맺어야
        // 하므로 새 티켓은 매번 발급한다(FR-016).
        if (room.isParticipant(userId)) {
            return GameRoomResponse.from(room, realtimeTicketService.issue(userId));
        }
        if (room.getStatus() != GameRoomStatus.WAITING) {
            throw new BusinessException(ErrorCode.ROOM_NOT_WAITING);
        }
        if (room.isFull()) {
            throw new BusinessException(ErrorCode.ROOM_FULL);
        }
        room.assignGuest(userId);
        GameRoomResponse response = GameRoomResponse.from(room, realtimeTicketService.issue(userId));
        Long roomId = room.getId();
        // 실제로 신규 참가자가 배정된 경로에서만 인원수가 바뀌므로 커밋 후 브로드캐스트한다.
        afterCommit(lobbyBroadcastService::broadcastUpdate);
        // 게스트도 호스트와 동일하게 15초 확인 대기 타이머 대상이다(FR-029/030). 재입장(위의 이른
        // 반환)은 이 경로를 타지 않으므로 타이머가 연장되지 않는다.
        afterCommit(() -> registerPendingConfirmation(roomId, userId));
        return response;
    }

    @Transactional
    public void leave(Long roomId, Long userId) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);
        // 이미 CLOSED된 방에 leave()가 또 호출되는 경우(결과 보고 후 중복 호출, 유예 타이머의
        // 뒤늦은 발동 등)는 아무 것도 바뀐 게 없으므로 조용히 무시한다 — 그렇지 않으면 끝난
        // 방의 host/guest를 계속 고쳐 쓰고, 실시간 알림도 매번 다시 나가게 된다.
        if (room.getStatus() == GameRoomStatus.CLOSED) {
            return;
        }

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
        // 상대방에게 이미 수립된 실시간 연결로 준비 상태 변경을 즉시 통보한다(FR-030). 통보 실패가
        // 이 API 자체를 실패시키지 않도록 커밋 후에만 실행한다(FR-031).
        afterCommit(() -> roomRealtimeNotifier.notifyReadyChanged(roomId, userId, isReady));
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
        GameRoomResponse response = GameRoomResponse.from(room);
        // 방이 IN_PROGRESS로 전환되며 로비의 WAITING 목록에서 사라지므로 커밋 후 브로드캐스트하고,
        // 동시에 참가자들에게 GAME_STARTED를 방 WebSocket으로 알린다(FR-021). leave()와 같은 이유로
        // 트랜잭션이 실제로 커밋된 이후에만 두 알림 모두 실행되도록 등록한다.
        afterCommit(lobbyBroadcastService::broadcastUpdate);
        afterCommit(() -> roomRealtimeNotifier.notifyGameStarted(roomId));
        return response;
    }

    @Transactional
    public GameResultResponse reportResult(Long roomId, Long userId, Long winnerUserId) {
        GameRoom room = getRoom(roomId);
        requireParticipant(room, userId);

        // 이미 CLOSED된 방(결과 중복 보고 또는 진행 중 나가기로 무효화된 매치 모두 포함)은
        // 사유를 구분하지 않고 동일하게 거부한다 — 서버는 게임 중 실시간 이탈을 감지하지 않으므로
        // (FR-007), 상대방이 결과 보고 전 명시적으로 나간 경우도 이 규칙 하나로 함께 처리된다(FR-014).
        if (room.getStatus() != GameRoomStatus.IN_PROGRESS) {
            throw new BusinessException(ErrorCode.ROOM_NOT_IN_PROGRESS);
        }
        if (winnerUserId != null && !room.isParticipant(winnerUserId)) {
            throw new BusinessException(ErrorCode.INVALID_WINNER);
        }

        recordGameResult(room, winnerUserId);
        // CLOSED 대신 WAITING으로 복귀시켜 재대결이 가능하게 한다(FR-013). IN_PROGRESS는 항상
        // host/guest 둘 다 남아있는 상태에서만 도달하므로 별도 인원 확인 없이 그대로 적용한다.
        room.returnToWaiting();
        // 방이 다시 WAITING으로 로비 목록에 나타나므로 커밋 후 구독자에게 알린다(FR-015).
        afterCommit(lobbyBroadcastService::broadcastUpdate);

        return new GameResultResponse(winnerUserId);
    }

    /**
     * 대전 결과를 기록한다. 무승부는 기록하지 않는다(FR-033). 승패를 어떤 형태로 남기는지는
     * gameresult 모듈이 정하므로(FR-026 동률 처리에 패수가 필요), 여기서는 승자/패자만 가려낸다.
     */
    private void recordGameResult(GameRoom room, Long winnerUserId) {
        if (winnerUserId == null) {
            return;
        }
        Long loserUserId = winnerUserId.equals(room.getHostUserId()) ? room.getGuestUserId() : room.getHostUserId();
        gameResultService.recordDuel(
                winnerUserId, loserUserId, GameResultType.valueOf(room.getGameType().name()));
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
        throw new BusinessException(ErrorCode.ROOM_CODE_GENERATION_FAILED);
    }

    private String randomRoomCode() {
        StringBuilder sb = new StringBuilder(ROOM_CODE_LENGTH);
        for (int i = 0; i < ROOM_CODE_LENGTH; i++) {
            sb.append(ROOM_CODE_CHARS.charAt(RANDOM.nextInt(ROOM_CODE_CHARS.length())));
        }
        return sb.toString();
    }

    /**
     * create()/join()의 신규 배정 경로에서 참가자를 confirmed=false로 등록하고, 확인 대기 시간
     * 안에 WebSocket 핸드셰이크가 오지 않으면 leave()를 호출하는 타이머를 예약한다(FR-029,
     * US15/T066, research.md #14). 핸드셰이크 성공 시 GameRoomWebSocketHandler가 이 타이머를
     * 취소하고 confirmed=true로 전환한다.
     */
    private void registerPendingConfirmation(Long roomId, Long userId) {
        RoomLiveState room = roomParticipantRegistry.getOrCreateRoom(roomId);
        ParticipantLiveState participant = room.getOrCreateParticipant(userId);
        Instant deadline = Instant.now().plusSeconds(joinConfirmationSeconds);
        ScheduledFuture<?> task = taskScheduler.schedule(() -> self.leave(roomId, userId), deadline);
        participant.schedulePending(deadline, task);
    }

    /**
     * 트랜잭션이 실제로 커밋된 후에만 action을 실행한다 — 커밋 전에 실시간 알림을 보내면,
     * 알림을 받은 클라이언트가 곧바로 상태를 재조회했을 때 아직 반영되지 않은 값을 읽는
     * 경쟁 조건이 생긴다.
     */
    private void afterCommit(Runnable action) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
