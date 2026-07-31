import * as api from './api.js';
import { countExpected, lifecycleDuration, lifecycleOk } from './metrics.js';

/**
 * 한 VU 가 두 플레이어를 모두 연기하는 방 생명주기 1회.
 *
 * k6 의 VU 는 서로 격리돼 setup() 반환값 외에 런타임 생성물을 공유할 수 없다 —
 * "A가 만든 방 코드를 B가 받는" 조율이 불가능하다. 서버는 요청이 몇 개 클라이언트에서
 * 오는지 신경 쓰지 않으므로 한 VU 가 둘을 연기해도 부하 특성은 같고 조율 코드가 사라진다.
 *
 * 반드시 leave 까지 간다. 중간에 그만두면 방이 WAITING 으로 쌓여 팬아웃 비용 축(배경 WAITING
 * 방 수)이 실행 중에 커지고 곡선의 x축이 오염된다. 서버는 create/join 시점에 15초 확인 대기
 * 타이머를 걸어 두므로(GameRoomService.registerPendingConfirmation) 실패로 남은 방도 결국
 * 정리되지만, 그 정리는 15초 뒤 스케줄러 스레드에서 실행되는 지연된 배경 부하다.
 *
 * @returns {boolean} 끝까지 통과했는지
 */
export function runRoomLifecycle(host, guest, gameType = 'SIGN_DUEL') {
  const started = Date.now();
  let roomId = null;
  let ok = false;

  try {
    const created = api.createRoom(host.accessToken, gameType);
    if (created.status !== 201) {
      countExpected(created, 'create');
      return false;
    }
    const room = created.json();
    roomId = room.id;

    const joined = api.joinRoom(guest.accessToken, room.roomCode);
    if (joined.status !== 200) {
      countExpected(joined, 'join');
      return false;
    }

    const r1 = api.setReady(host.accessToken, roomId, true);
    if (r1.status !== 200) { countExpected(r1, 'ready_host'); return false; }
    const r2 = api.setReady(guest.accessToken, roomId, true);
    if (r2.status !== 200) { countExpected(r2, 'ready_guest'); return false; }

    const startRes = api.startGame(host.accessToken, roomId);
    if (startRes.status !== 200) { countExpected(startRes, 'start'); return false; }

    // 승자를 지정한다 — 무승부는 game_results 에 아무것도 쓰지 않으므로(FR-033)
    // 쓰기 경로를 재려면 승패가 있어야 한다.
    const result = api.reportResult(host.accessToken, roomId, host.userId);
    if (result.status !== 201) { countExpected(result, 'results'); return false; }

    ok = true;
    return true;
  } finally {
    // 방을 반드시 회수한다. guest 먼저 나가면 호스트 위임이 일어나지 않고, 이어서 host 가
    // 나가면 방이 CLOSED 로 전환돼 5분 뒤 정리 배치의 대상이 된다.
    if (roomId !== null) {
      api.leaveRoom(guest.accessToken, roomId);
      api.leaveRoom(host.accessToken, roomId);
    }
    lifecycleOk.add(ok);
    if (ok) {
      lifecycleDuration.add(Date.now() - started);
    }
  }
}
