package backend.ssafy.suhwa.game.scheduler;

import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 서버 재시작 시 인메모리 실시간 상태(WebSocket 연결 등)는 모두 사라져 재시작 직전까지
 * WAITING/IN_PROGRESS였던 방은 더 이상 신뢰할 수 없다. 기동 직후 1회 일괄 CLOSED 처리한다
 * (FR-028, research.md #4). {@link GameRoomCleanupScheduler}의 주기적·보관기간 기준 정리와는
 * 트리거 조건이 달라 별개 클래스로 분리한다 — 재시작 정합화를 스케줄러 주기에 맡기면 재시작
 * 직후 최대 한 주기만큼 좀비 방이 노출되는 창이 생긴다.
 */
@Component
public class GameRoomStartupReconciler {

    private final GameRoomRepository gameRoomRepository;

    public GameRoomStartupReconciler(GameRoomRepository gameRoomRepository) {
        this.gameRoomRepository = gameRoomRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void reconcileOnStartup() {
        gameRoomRepository.closeAllActiveRooms();
    }
}
