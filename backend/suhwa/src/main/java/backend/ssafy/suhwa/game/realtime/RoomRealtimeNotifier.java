package backend.ssafy.suhwa.game.realtime;

/**
 * 방 내 실시간 메시지(contracts/realtime-websocket-messages.md) 발송을 담당한다.
 * {@code game/service}가 이 인터페이스에 의존해 커밋 직후 브로드캐스트를 트리거한다
 * (research.md #12 — ApplicationEventPublisher 대신 직접 인터페이스 주입 채택).
 */
public interface RoomRealtimeNotifier {

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
}
