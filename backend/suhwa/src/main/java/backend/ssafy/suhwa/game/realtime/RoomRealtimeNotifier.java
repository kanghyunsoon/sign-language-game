package backend.ssafy.suhwa.game.realtime;

/**
 * 방 내 실시간 메시지(contracts/realtime-websocket-messages.md) 발송을 담당한다.
 * {@code game/service}가 이 인터페이스에 의존해 커밋 직후 브로드캐스트를 트리거한다
 * (research.md #12 — ApplicationEventPublisher 대신 직접 인터페이스 주입 채택).
 */
public interface RoomRealtimeNotifier {

    /**
     * spec 004 FR-016 — 신규 참가자가 최초로 실시간 연결을 확정했을 때(재접속은 제외) 같은 방
     * 상대방에게. 재연결은 {@link #notifyPeerReconnected}가 담당한다.
     */
    void notifyPeerJoined(Long roomId, Long userId);

    /** FR-019 — 같은 방 상대방 연결이 끊겨 유예 시간이 시작될 때. */
    void notifyPeerDisconnected(Long roomId, Long userId);

    /** FR-019 — 유예 시간 안에 상대방이 재접속에 성공했을 때. */
    void notifyPeerReconnected(Long roomId, Long userId);

    /** FR-016, FR-018, FR-019, FR-029 — 어떤 경로로든 leave()가 호출된 결과. */
    void notifyPeerLeft(Long roomId, Long leftUserId, Long newHostUserId);

    /** FR-021 — 방장의 시작 요청이 성공해 방 상태가 IN_PROGRESS로 전환됐을 때. */
    void notifyGameStarted(Long roomId);

    /** FR-025, FR-026 — 영상 통화 연결 신호를 같은 방 상대방에게 가공 없이 그대로 전달. */
    void relaySignal(Long roomId, Long fromUserId, Object payload);

    /** FR-030 — 참가자의 준비 상태 변경을 같은 방 상대방에게(본인 제외) 즉시 통보. */
    void notifyReadyChanged(Long roomId, Long userId, boolean isReady);

    /**
     * 방의 생명주기가 끝났을 때 그 방에 남아 있는 실시간 상태를 폐기한다 — 예약 타이머 취소와
     * 레지스트리 엔트리 제거.
     *
     * <p>{@link #notifyPeerLeft}는 나간 당사자 하나만 정리하므로, 방이 {@code CLOSED}로 끝나거나
     * 행 자체가 삭제될 때 <b>남은 참가자의 상태가 힙에 계속 남는다</b>. 이 메서드가 그 잔여물을
     * 치운다.
     *
     * <p>WebSocket 세션은 닫지 않는다 — 끝난 방의 세션이 메시지를 보내면 ERROR를 받는 것이 정해진
     * 동작이다(FR-024). 자원 회수를 위해 그 계약을 바꾸지 않는다.
     *
     * <p>반드시 <b>커밋 후</b>에 호출해야 한다 — 롤백되면 방이 살아 있으므로 상태를 지우면 안 된다.
     */
    void disposeRoom(Long roomId);
}
