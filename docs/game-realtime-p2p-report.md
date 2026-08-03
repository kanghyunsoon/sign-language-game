# 서버 중계 없는 실시간 1:1 대전 — 브라우저 호스트 권위 구조의 설계와 실패 기록

작성: 2026-08-03
대상: `frontend/src/game/block-stacking/battle`, `frontend/src/game/realtime`, `frontend/src/game/media`

## 이 문서의 성격과 근거의 한계

이 문서는 AI 모델 개선 보고서와 달리 **정확도 같은 단일 축의 수치가 없다.** 게임 파트에는 회차별 계측 로그가 없고, 성능 계측기(`RecognitionPerformanceMonitor`)는 런타임 수집만 하고 결과를 저장하지 않는다. 따라서 근거는 다음 세 가지다.

1. **코드에 남은 상수와 구조** — 파일 경로와 상수명을 명시한다
2. **회귀 테스트 케이스 이름** — 대부분 실사용에서 발견한 증상을 그대로 옮긴 것이다
3. **커밋 SHA** — 조치가 실제로 반영된 지점

수치 표기 규칙은 다음과 같다. 계측하지 않은 항목은 `미측정`, 코드에서 추론한 항목은 `코드 기반 추정`, 확인이 필요한 항목은 `확인 필요`로 표시한다. 서로 다른 조건의 결과를 성능 향상처럼 비교하지 않는다.

---

## 1. 제약과 문제 정의

### 1.1 백엔드가 게임 진행을 중계하지 않는다

배포된 백엔드가 제공하는 것은 다음뿐이다.

| 계층 | 제공 범위 |
| --- | --- |
| REST | 방 생성·참가·준비·시작, 결과 저장 |
| SSE | 로비 방 목록 스냅샷/갱신 |
| Room WebSocket | 참가 확인, presence(`PEER_DISCONNECTED`/`PEER_RECONNECTED`/`PEER_LEFT`/`PEER_READY_CHANGED`), `GAME_STARTED`, WebRTC `SIGNAL` 릴레이 |

Room WebSocket이 허용하는 클라이언트 송신 타입은 `SIGNAL` **하나뿐이다**(근거: `realtime/RoomRealtimeSocket.ts`의 `MESSAGE_TYPES` 화이트리스트, 테스트 `"connects with a fresh query ticket and sends only SIGNAL envelopes"`). 즉 블록 낙하, 목표 제시, 점수 판정 같은 게임 상태를 서버로 보낼 경로가 없다.

여기에 **백엔드 소스는 수정하지 않는다**는 팀 합의가 있었다. 백엔드 담당이 1명이고 인증·랭킹·펫 성장 등 다른 도메인 작업이 병행 중이었다. 게임이 백엔드 변경을 기다리면 양쪽이 모두 막힌다.

### 1.2 그래서 풀어야 했던 문제

두 브라우저가 서버 중재 없이 다음을 합의해야 한다.

- **공유 목표의 소유권** — 같은 글자를 두 사람에게 제시하고, 먼저 인식한 한 명의 보드에만 블록을 떨어뜨린다
- **두 물리 보드의 일관성** — 한쪽 화면의 상대 보드가 실제 상대 화면과 같아야 한다
- **승패 판정** — 서버는 결과를 저장할 뿐 판정하지 않는다
- **단절과 복구** — 새로고침, 뒤로가기, 네트워크 순단, 영구 이탈을 구분해야 한다

이 네 개가 각각 실패했고, 각 실패가 설계를 한 번씩 되돌렸다. 아래가 그 기록이다.

---

## 2. 전송 경계 설계

### 2.1 채널 분리

```
방 생성/참가/준비/시작        → REST                    (서버)
1회용 ticket 발급             → POST /auth/sse-ticket    (Bearer 헤더)
로비 목록                     → SSE (ticket query)       (서버)
SDP/ICE 교환                  → Room WebSocket (ticket query)
────────────── 여기까지만 서버 ──────────────
게임 명령/권위 이벤트/복구 스냅샷 → WebRTC DataChannel `GAME_P2P_V1`
```

### 2.2 SSE에 Bearer를 붙일 수 없다는 제약

`/game-rooms/subscribe` 구독을 설계할 때 처음에는 Bearer 헤더를 쓰려 했으나, 브라우저 `EventSource`는 임의 인증 헤더를 붙일 수 없다. 우회 방법을 만들지 않고 **티켓 발급(Bearer)과 구독(ticket query)을 분리**했다.

- `POST /auth/sse-ticket?userId=...`에 Bearer를 보내 `{ticket, expiresInSeconds}`를 받는다
- 실제 구독은 `?ticket=...` query로 한다
- 티켓은 1회용이므로 재연결마다 새로 발급한다

근거: `realtime/RealtimeTicketClient.ts`, `realtime/LobbySseClient.ts`. 응답 파싱은 safe integer와 양수 검증을 통과해야 하고 실패 시 `RealtimeTicketRequestError(status)`를 던진다.

### 2.3 봉투와 발신자 인증

DataChannel 메시지는 모두 봉투로 감싼다.

```ts
{ protocol: "GAME_P2P_V1", roomId, kind: "COMMAND" | "EVENT" | "SNAPSHOT", payload }
```

`roomId` 불일치나 프로토콜 불일치는 폐기한다(`realtime/WebRtcDataChannelTransport.ts`). 중요한 점은 **커맨드 발신자를 애플리케이션 필드가 아니라 WebRTC peer로 식별한다**는 것이다. `subscribeCommands(listener(command, remoteUserId))`가 호스트에게 peer 단위로 전달하므로 게스트가 `userId`를 위조해도 소용이 없다.

DataChannel 오픈 대기는 15초 데드라인 / 25ms 폴링이다. PeerConnection이 `connected`가 된 직후에도 채널은 아직 열리는 중일 수 있어서, "연결됨"과 "전송 가능"을 구분해야 했다.

### 2.4 폴백을 만들지 않은 결정

WebSocket 폴백을 두지 않았다(코드 주석에 명시). 두 경로를 유지하면 어느 경로로 도착한 이벤트인지에 따라 권위 판단이 갈리고, 그 조합을 테스트할 수 없다. 대신 **재연결 예산을 명확히** 두는 쪽을 선택했다.

`RoomRealtimeSocket`의 재연결 정책:

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 절대 예산 | `DEFAULT_RECONNECT_BUDGET_MS = 8000` | 백엔드의 10초 disconnect grace보다 먼저 끝나야 `PEER_RECONNECTED`로 등록된다 |
| 재시도 간격 | `[0, 300, 600, 1000, 1500, 2000, 2500]ms` | |
| 시도마다 | 새 ticket 발급 | 1회용이므로 재사용 불가 |
| 401/403 | 즉시 중단 | 신원이 거부된 것이므로 재시도는 ticket만 낭비한다 |

관련 테스트: `"requires a new ticket for a signaling reconnect"`, `"does not retry a rejected identity or one-time ticket"`, `"stops transient retries at the absolute reconnect deadline"`.

---

## 3. 실패 1 — 낙관적 로컬 spawn이 글자를 두 개 만들었다

### 문제

공유 목표는 **단일 경쟁 자원**이다. 처음에는 각 브라우저가 자기 인식 결과로 즉시 블록을 생성했다. 로컬 반응성이 가장 좋은 방식이기 때문이다.

증상: 두 사람이 거의 동시에 인식하면 글자가 두 개 생기거나, 두 보드의 상태가 어긋났다.

### 원인 재정의

각 브라우저는 자기 인식 시각만 알고 상대의 인식 시각은 모른다. 로컬 인식 결과는 서로 다른 시점에 도착하므로 **어느 브라우저도 독자적으로 "내가 이겼다"를 판단할 수 없다.** 이것은 지연을 줄여서 해결할 문제가 아니고, 판정 주체가 없다는 구조 문제였다.

### 조치 — 브라우저 호스트 권위

방장 브라우저가 권위 서버 역할을 한다. 게스트는 커맨드를 보내고 호스트가 검증해 이벤트를 발행한다.

```
게스트 → CLAIM_SHARED_TARGET (COMMAND)
호스트   첫 유효 claim만 승인
호스트 → SHARED_TARGET_CLAIMED (EVENT, 양쪽)
호스트 → SPAWN_LETTER (EVENT, 승자 보드만)
```

- 공유 목표 모드에서는 **로컬 낙관적 spawn을 비활성화**한다
- 다음 목표는 claim이 해소된 뒤에만 발행한다(`NEXT_TARGET_DELAY_MS = 1150`, `CLAIM_EFFECT_DURATION_MS`와 동일). 목표 세대가 겹치면 어느 목표에 대한 claim인지 모호해진다
- 중복 커맨드는 `MAX_PROCESSED_COMMANDS = 256` LRU로 멱등 처리한다

근거: `block-stacking/battle/transport/P2pBattleTransport.ts`. 커맨드 11종 / 이벤트 20종의 목록은 `battleTransportTypes.ts`에 있다.

테스트: `"shares one target and drops it only for the first player who claims it"`, `"claims the shared target without spawning optimistically"`, `"waits for the shared claim effect before spawning the winner letter"`, `"removes only after server acceptance and uses official score"`.

### 부작용과 그 처리

권위 판정으로 옮기자 **정답자가 아닌 브라우저에서는 아무 피드백이 없었다.** 상대가 가져갔다는 사실을 알 수 없었다.

연출과 상태를 분리해 해결했다. 양쪽이 같은 권위 claim 이벤트를 렌더링하고(공유 종이의 black-hole 연출), 실제 spawn만 승자 보드에 지연 적용한다. 화면에는 "누가 먼저 가져갔다"가 양쪽에 보이고 게임 상태는 권위만 바꾼다.

### 왜 이 방식이 가벼운가

영상이나 두 번째 물리 시뮬레이션을 스트리밍하지 않는다. target/claim/spawn 이벤트 스트림만 교환하고 각 보드는 로컬에서 렌더한다. 권위 spawn 명령만 게임 상태를 결정한다.

---

## 4. 두 보드 동기화 — 무엇을 보내고 무엇을 보내지 않는가

### 4.1 설정값

`block-stacking/battle/sync/InterpolationConfig.ts`의 `DEFAULT_BATTLE_SYNC_CONFIG`:

| 항목 | 값 | 판단 근거 |
| --- | --- | --- |
| `transformPublishIntervalMs` | `1000/30` (30Hz) | 이동 중인 바디만 전송 |
| `interpolationDelayMs` | 140 | 이 시점을 렌더 타깃으로 두 샘플 사이를 보간 |
| `maxExtrapolationMs` | 70 | 패킷 지연 시 마지막 FALLING 변환을 등속 예측. 그 이상은 권위와 멀어져 금지 |
| `snapshotPublishIntervalMs` | 5000 | 정착·제거·구조 변경 시에는 즉시 전송 |
| `snapDistanceThreshold` | 2 | 넘으면 보간 대신 순간이동 |
| `snapAngleThreshold` | `Math.PI` | |
| `maxBufferedSnapshots` | 6 | 초과 시 앞에서 잘라낸다 |
| `maxWebSocketBufferedAmount` | 12000 | `bufferedAmount` 초과 시 그 프레임 전송을 건너뛴다(백프레셔) |

### 4.2 정착 바디만 권위로 고정한 이유

`MatterPhysicsWorld.synchronizeSettledLetter()`는 **정착한 바디에만** 원격 권위 좌표를 적용한다. 이동 중인 바디는 로컬 시뮬레이션을 유지한다.

이동 중 바디까지 권위 좌표로 덮으면 네트워크 지터가 낙하 애니메이션 지터로 그대로 보인다. 30Hz 전송과 60Hz 렌더 사이의 불일치가 눈에 보이는 떨림이 된다. 반대로 정착 바디를 로컬 시뮬레이션에 맡기면 두 브라우저의 최종 더미 모양이 서로 달라진다. 그래서 **낙하 중에는 로컬 부드러움, 정착 후에는 권위 일치**로 나눴다.

### 4.3 해상도 독립

좌표를 `x/width`, `y/height`로 정규화해 전송하고 `[-0.25, 1.25]`로 클램프한다(`BoardSnapshotSerializer.ts`). 두 사람의 창 크기가 달라도 같은 위치가 된다. 클램프 범위를 1을 넘겨 잡은 것은 보드 위쪽에서 생성되는 블록(`spawnY = -70`)을 표현해야 하기 때문이다.

### 4.4 각도 보간의 경계 문제

각도를 단순 선형 보간하면 `+π`에서 `-π`로 넘어갈 때 블록이 한 바퀴 돈다. `atan2(sin, cos)`로 최단 경로를 구한다. 테스트 `"interpolates the shortest angle"`.

### 4.5 무결성 검사 — 체크섬

보드 상태를 id 정렬 후 `id|symbol|round(x*100000)|...|state`로 직렬화해 **FNV-1a 32bit** 해시를 만든다(`BoardStateChecksum.ts`, `0x811c9dc5` 초기값, `Math.imul(hash, 0x01000193)`). 스냅샷과 함께 보내고 수신 측에서 재계산해 비교한다. 불일치하면 스냅샷을 폐기하고 무결성 실패를 기록한다.

좌표를 양자화한 이유는 JSON 직렬화 포맷 차이(부동소수 표기)로 인한 오탐을 막기 위한 것이다. 정렬을 넣은 이유는 배열 순서가 달라도 같은 상태여야 하기 때문이고, 이건 테스트 `"is independent of body array order"`로 고정했다.

### 4.6 늦게 온 패킷이 죽은 블록을 부활시키는 문제

제거된 블록에 대한 변환 패킷이 뒤늦게 도착하면 사라진 블록이 다시 나타났다. 제거 이력(툼스톤)을 유지해 무시하도록 했는데, 이력이 게임 종료까지 무한 증가해 장시간 플레이에서 메모리와 순회 비용을 키웠다.

`MAX_REMOVED_HISTORY = 128`로 상한을 뒀다. 테스트 두 개가 양쪽을 고정한다 — `"ignores transforms after removal"`(기능)과 `"bounds removed-letter tombstones"`(상한).

### 4.7 시계 오프셋

두 브라우저의 `Date.now()`는 일치하지 않는다. 첫 패킷의 `receivedAt - sentAt`을 송신자 시계 오프셋으로 **고정**하고, 이후 모든 `sentAt`을 `sentAt + offset`으로 로컬 타임라인에 매핑한다(`RemoteBoardReplica.toLocalTimeline()`). 매 패킷마다 오프셋을 재계산하면 오프셋 자체가 지터가 되어 보간이 흔들린다.

---

## 5. 실패 2 — 복구 스냅샷이 살아 있던 플레이어의 보드를 되감았다

### 문제

한쪽이 새로고침하면 다음이 동시에 일어났다.

- 새로고침한 쪽: 모든 연결 상태가 DISCONNECTED, 보드가 빈 상태
- **반대쪽**: 이미 떨어진 블록·공유 목표·낙하가 사라지거나 처음 카운트다운으로 되돌아감
- 나가기 시 `POST /api/game-rooms/{roomId}/leave`가 403
- 게임판이 흰색 WebGL 캔버스로 공유 배경을 덮음

증상이 네 개였지만 원인은 서로 달랐다.

### 원인 5개

1. **RTC 일시 단절이 물리 보드를 파괴했다.** 단절이 `mediaReady=false`로 전파되면 `BattleGamePage`의 controller effect cleanup이 실행되어 로컬 물리 보드가 dispose됐다. React effect 의존성이 게임 수명과 미디어 수명을 묶고 있었다.
2. **provider가 인증보다 먼저 mount됐다.** 저장된 방 세션을 초기화 시점에 읽지 못해 play route가 재입장 정보를 잃었다.
3. **stale leave 403은 정상 동작이었다.** 서버가 새로고침으로 참가자를 이미 제거한 뒤 브라우저가 다시 leave를 호출하면 403이 나는 게 맞다.
4. **Pixi 캔버스가 불투명 배경을 유지했다.** 일부 WebGL 드라이버에서 투명 클리어 버퍼가 흰색으로 표시됐다.
5. **복구 스냅샷을 양쪽에 무조건 적용했다.** 이게 가장 컸다. 재접속 스냅샷은 P2P 채널로 브로드캐스트되므로 살아 있던 플레이어도 받는다. 그걸 적용하면 진행 중인 Matter 보드가 과거 상태로 되감긴다. 반대로 재접속한 쪽이 자기 스냅샷을 받기 전에 물리를 재시작하면 빈 보드나 새 카운트다운으로 보인다.

### 조치

| 문제 | 조치 | 커밋 |
| --- | --- | --- |
| 흰 배경 | board WebGL canvas가 공유 scenery를 덮지 않도록 처리 | `a815e23` |
| 카운트다운 재시작 | `MATCH_STARTED.resume` 플래그로 재접속과 신규 매치 구분, board/player 스냅샷 복원 | `53ef953` |
| 보드 dispose | 최초 RTC 성공 뒤 `mediaReady`를 latch해 controller 유지 | `c8c9090` |
| 세션 유실 | userId별 sessionStorage + localStorage 저장, auth hydrate 후 재읽기 | `c8c9090` |
| stale leave 403 | 세션 없는 play route는 remote leave 생략, 이미 종료된 응답에도 로컬 정리 계속 | `c8c9090` |
| 살아 있는 보드 덮어쓰기 | `BoardSnapshotEvent.restoreForPlayerId`로 요청한 플레이어만 적용 | 확인 필요 |
| 복귀 중 빈 보드 미전송 | 빈 보드도 `BOARD_SNAPSHOT`으로 전송, 양쪽 payload 동봉 | 확인 필요 |
| 복귀 시 낙하 위치 불일치 | 스냅샷 뒤 `RECONNECT_SNAPSHOT_SETTLE_MS = 240` 창에서 남은 peer의 `PEER_BOARD_VIEW` 최신 위치 적용 | 확인 필요 |
| 단순 RTC 재연결에 새 매치 시작 | transport의 `hasConnected`로 최초 연결과 재연결 구분 | 확인 필요 |
| 복귀 후 로컬 낙하 미전달 | `BattleController`가 `LocalBoardPublisher`를 새 runtime에 재부착 | 확인 필요 |

> 커밋 SHA가 `확인 필요`인 항목은 조치 내용은 코드로 확인했으나 대응 커밋을 특정하지 못했다.

### 핵심 불변식

여기서 얻은 규칙이 하나 있다. **자기 보드의 권위 스냅샷이 도착하기 전까지 `PLAYING`으로 가지 않는다.** `BattleController`의 `awaitingResumeOwnBoard` 플래그가 이걸 강제한다. 그러지 않으면 재접속한 쪽이 빈 보드로 게임을 시작한다.

이 불변식을 테스트 4개로 고정했다.

- `"restores a running match only after its own authoritative board arrives"`
- `"does not rewind the player who stayed connected with another player's recovery snapshots"`
- `"waits for the reconnecting player's own field when the opponent field arrives first"`
- `"restores the current shared target atomically with a running match"`

마지막 것도 별도의 실패에서 나왔다. 재접속 스냅샷에 공유 목표를 함께 담지 않으면, 복귀한 플레이어가 현재 종이 위 글자를 모르는 상태로 게임에 들어간다. 매치 상태와 공유 목표를 **원자적으로** 함께 보내야 했다.

### 호스트 새로고침

호스트가 새로고침하면 권위 자체가 사라진다. `P2pBattleTransport`가 권위 상태를 localStorage에 직렬화한다(`AUTHORITY_STORAGE_PREFIX = "sudal:block-battle:authority:"`). 저장 필드는 sequence, spawnIndex, targetIndex, symbolBag, sharedTarget, players, playerProfiles, letters, boards, boardUpdatedAt이고 `restoreAuthority()`로 복원한다.

`symbolBag`까지 저장하는 이유는 출제 순서의 연속성이다. 복원 후 백을 새로 만들면 이미 나온 글자가 즉시 반복될 수 있다.

---

## 6. 실패 3 — 자동 몰수패가 양쪽을 승자로 만들 수 있었다

### 시도한 방식

상대 DataChannel이나 PeerConnection이 끊기면 남은 사람을 승자로 처리하는 방식. 구현이 단순하고 즉각적이다.

### 왜 폐기했는가

**네트워크 분할 시 양쪽이 모두 자신을 생존자로 판단한다.** A와 B 사이 경로만 끊기고 두 브라우저가 모두 살아 있으면, 각자 "상대가 끊겼다"를 관측하고 각자 승리를 서버에 보고한다. 서버는 먼저 온 요청을 저장하고 두 번째를 409로 거절하므로, 결과가 **네트워크 순서에 따라 결정된다.** 게임 규칙이 아니라 경합으로 승자가 정해지는 구조다.

이건 지연이나 재시도로 보완할 수 있는 문제가 아니다. 분할 상황에서 두 노드가 각자 관측만으로 배타적 결론에 도달하는 것이 원리적으로 불가능하기 때문이다.

### 채택한 방식 — 보수적 유예

| 상황 | 처리 |
| --- | --- |
| 상대 단절 직후 | 현재 보드를 유지하고 10초 재접속 유예 시작(`PeerDisconnectForfeit`의 `graceMs = 10000`) |
| 유예 안에 스냅샷/resume 도착 | timeout 취소하고 계속 진행 |
| 유예 만료 | 남은 참가자가 `RECONNECT_TIMEOUT` 사유의 승자, 보드 정지 |
| 명시적 나가기 | 기존 forfeit/leave로 즉시 방 종료, 남은 참가자 승리 |
| 그 외 | **판정하지 않는다** |

그리고 **10초 이후 자동 몰수패를 아예 활성화하지 않았다.** 서버가 인증된 `PEER_DISCONNECTED`/`PEER_RECONNECTED`를 권위 근거로 제공하는 정책이 확정되기 전까지 보류한다고 코드 주석과 문서에 남겼다.

`PeerDisconnectForfeit`의 주석에 "룸 WebSocket은 이 판단에 쓰지 않는다"고 명시했다. presence 이벤트를 근거로 쓰면 서버 관측과 P2P 관측이 섞여 어느 쪽이 권위인지 모호해진다.

관련 테스트:

- `"does not invent a winner from an ambiguous local transport drop"` — 모호한 끊김에서 승자를 만들지 않는다
- `"awards the remaining player after an identified opponent disconnect exceeds grace"` — 식별된 단절 + 유예 초과에서만 판정한다
- `"keeps the match running when the opponent reconnects within grace"`
- `"cancels the leave timeout when the same match resumes"`

### 방장 영구 이탈에도 권위를 이전하지 않는다

남은 참가자에게 host authority를 넘기면 그 브라우저가 독자적으로 다음 공유 목표를 생성한다. 원래 방장이 돌아오면 두 권위가 서로 다른 목표를 발행하는 split-brain이 된다. 서버 판정은 "방장 혼자면 방 삭제, 2명이면 남은 참가자에게 방장 위임"인데, **프런트가 이걸 선행 추측하지 않고** 서버 응답과 SSE를 권위 상태로 사용하도록 했다.

---

## 7. 실패 4 — 방 생명주기의 경합

### 7.1 뒤로가기 후 "재입장", 새 방 생성 시 "이미 참여 중인 방"

실제 경쟁 순서를 추적해보니 이랬다.

1. 대기실 mount의 멱등 `join`이 진행 중
2. 사용자가 뒤로가기를 눌러 `leave` 시작
3. 늦게 완료된 `join` 응답이 로컬 세션을 **다시 기록**하거나, `leave` 완료 전에 `create`가 전송됨

증상은 "재입장 화면이 뜬다"였지만 원인은 요청 순서가 보장되지 않은 것이었다.

### 7.2 조치

- **gateway의 create/join/leave를 단일 Promise 큐로 직렬화**했다(`SwaggerBattleRoomGateway`의 `membershipMutation` 체인, `enqueueMembershipMutation`)
- 대기실 leave는 `leavePromiseRef`로 한 번만 실행한다
- leave 시작 플래그가 켜진 뒤 도착한 join 응답은 무시한다
- 퇴장 중에는 `rememberRoom`을 차단해 늦게 온 join·주기 확인·SSE 응답이 세션을 다시 기록하지 못하게 한다
- 화면 이동 전에 로컬 세션을 먼저 비우고, 원격 leave 완료 뒤 다시 비운다. 원격 오류가 나도 사용자가 나가기로 결정한 세션은 복원하지 않는다
- `popstate`와 버튼 퇴장이 **동일한 cleanup 함수**를 쓴다

### 7.3 저장된 세션을 신뢰하지 않는다

새 방을 만들 때 저장된 세션만 보고 생성을 막지 않는다. 저장된 `roomCode`로 멱등 `join`을 먼저 호출해 서버 상태를 확인하고,

- `401/403/404/410` → stale 세션 폐기 후 **같은 제출에서** 방 생성 계속
- 정상 응답 → "이미 참여 중인 방" 안내
- 네트워크 오류나 `5xx` → 방이 없다고 추측하지 않고 생성도 중단 (중복 방 생성 방지)

재입장 재시도 백오프는 `REJOIN_DELAYS_MS = [0, 350, 700, 1200, 1700, 2200, 2700]`이고, 409/5xx/네트워크 오류만 재시도한다. `isMissingOrForbiddenRoom()`(401/403/404/410)은 즉시 종료한다(`BattleRoomRecovery.ts`).

### 7.4 새로고침 감지를 추측하지 않는다

"세션이 있는데 페이지가 새로 로드됨 = 새로고침"으로 추론하면 첫 진입과 구분되지 않는다. Navigation Timing API로 직접 판정한다.

```ts
performance.getEntriesByType("navigation")[0].type === "reload"
```

마커는 sessionStorage 키 `"sudal:battle-refresh-exit"`에 두고 `BATTLE_REFRESH_MARKER_MAX_AGE_MS = 30000`으로 만료시킨다(`BattleRefreshExit.ts`). 오래된 마커가 다음 세션에 영향을 주지 않게 하기 위한 것이다.

### 7.5 퇴장 순서 보장

`BattleExitCoordinator`가 순서를 고정한다.

```
roomGateway.leaveRoom() → mediaSession.disconnect() → cameraSession.stop() → clearRoomSession() → navigate()
```

순서가 중요하다. 카메라를 먼저 끄면 WebRTC sender가 죽은 track을 참조하고, 세션을 먼저 지우면 leave 요청이 방 정보를 잃는다. 원격 leave 실패는 warn만 남기고 로컬 정리는 끝까지 수행한다. `shouldLeaveRemotely()`로 하드 리프레시 후의 stale leave를 건너뛴다.

### 7.6 한 사용자가 두 탭에서 호스트가 되는 문제

방 세션을 sessionStorage와 localStorage에 **동시 기록**하고 `window`의 `storage` 이벤트를 구독한다(`app/GameServiceProvider.tsx`, 키 `"sudal:block-battle:room:" + userId`). 한 탭에서 방에 들어가면 다른 탭이 알 수 있다. sessionStorage만 쓰면 탭 간 공유가 안 되고, localStorage만 쓰면 탭을 닫아도 남는다.

---

## 8. React 생명주기와의 충돌

실시간 자원(소켓, PeerConnection, 카메라)을 React effect로 관리하면서 겪은 문제 세 개.

### 8.1 StrictMode의 setup → cleanup → setup

개발 모드에서 React가 effect를 두 번 실행한다. 첫 setup의 비동기 connect가 늦게 완료되며 두 번째 setup이 만든 새 연결을 덮어썼다.

`connectionGeneration` / `connectionAttempt` 세대 카운터로 해결했다. 비동기 작업이 완료될 때 자기 세대가 현재 세대인지 확인하고, 아니면 결과를 버리고 자원을 즉시 닫는다. 같은 패턴을 `SharedGameCameraSession`, `RoomRealtimeSocket`, `WebRtcDataChannelTransport`에 모두 적용했다.

### 8.2 프로브에서 실제 dispose를 하면 안 된다

Provider의 싱글턴 자원(카메라 세션, mesh 세션, transport)을 StrictMode 프로브에서 진짜로 닫으면 두 번째 setup이 이미 닫힌 자원을 받는다. `cleanupGenerationRef` + `queueMicrotask`로 dispose를 한 틱 미뤄, 같은 틱에 재설정이 오면 실제로 닫지 않게 했다.

### 8.3 Fast Refresh

`ActivePlayerSession`에 `reactivate()`를 둬서 Fast Refresh로 모듈이 교체돼도 등록된 사용자 세션을 잃지 않게 했다.

> 이 세 항목은 실시간 코드를 React에 붙일 때의 비용이다. 게임 루프를 React 밖의 클래스로 두고 effect는 **연결과 정리만** 담당하게 분리한 것이 근본 대응이었다.

---

## 9. 검증 방법

### 9.1 시간을 기다리지 않는 테스트

10초 유예, 240ms 정착 창, 8초 재연결 예산을 실제로 기다리면 테스트가 느리고 불안정해진다. 설계 단계에서 다음을 전부 주입 가능하게 만들었다.

`now`, `setTimer` / `clearTimer`, `requestFrame` / `cancelFrame`, `createId` / `createEventId`, `createWebSocket`, `createEventSource`, `getUserMedia`, `wait`, `fetcher`

덕분에 유예 만료, 패킷 지연, 시퀀스 역행, 세션 회전을 **결정적으로** 검증한다.

### 9.2 테스트 규모

| 파일 | 케이스 수 | 검증 대상 |
| --- | ---: | --- |
| `BattleController.test.ts` | 37 | 권위 판정, 재접속 복구, 승패, 콤보, 망치 공격 |
| `MeshWebRtcMediaSession.test.ts` | 16 | peer 상한, offer 결정성, ICE 버퍼, 공유 track 소유권 |
| `P2pBattleTransport.test.ts` | 11 | 목표 claim 경합, 재접속 복구, 3연속 공격, 결과 ACK |
| `RemoteTransformBuffer.test.ts` | 8 | 보간·외삽·상한 |
| `RoomRealtimeSocket.test.ts` | 7 | ticket 정책, 재연결 예산 |

게임 모듈 전체 테스트 파일은 141개다(비테스트 소스 373개, 약 1:2.6).

### 9.3 로컬 2인 실사용 검증 도구

브라우저 두 개로 실제 P2P를 검증할 수단이 필요했다. `scripts/p2p-e2e-relay.mjs`로 REST/SSE/ticket/native WebSocket 시그널링 계약을 로컬에서 재현하는 릴레이를 만들었다. 운영 백엔드 대체물이 아니라 검증 도구다.

- 카메라 권한 제약을 피하려고 `VITE_P2P_E2E=true`일 때만 합성 video track(canvas 640×360 `captureStream(5)`)을 주입한다
- RTCPeerConnection과 DataChannel은 실제 브라우저 구현을 그대로 쓴다

### 9.4 계측하지 않은 것 (한계)

| 항목 | 상태 |
| --- | --- |
| 실제 DataChannel RTT / 패킷 손실률 | 미측정 |
| 보간 지연 140ms의 최적성 | 미측정 (체감 기준으로 선택) |
| TURN relay 경유 시 성능 | 미측정 (연결 성공만 확인) |
| 서로 다른 네트워크·기기 조합에서의 동기화 오차 | 미측정 |
| 장시간 플레이의 heap / DOM node / GPU memory 추이 | 수동 관찰만, 수치 기록 없음 |

**따라서 이 문서의 설계 판단들은 "왜 그렇게 했는가"에 대한 근거는 있으나 "그 값이 최적인가"에 대한 근거는 없다.** 보간 지연, 전송 주기, 유예 시간은 실측으로 재조정할 여지가 있다.

---

## 10. 최종 구조

```
BattleGamePage (React)
  │
  ├─ BattleController ── BattleStateMachine (8상태, 전이 화이트리스트)
  │    │                  IDLE → CONNECTING → WAITING_START → COUNTDOWN
  │    │                  → PLAYING ⇄ RECONNECTING → FINISHED / ERROR
  │    │
  │    ├─ BattleLocalBoardRuntime  ── MatterPhysicsWorld (60Hz 고정 스텝, 최대 4스텝 캐치업)
  │    │                              정착 시 100ms(10Hz)로 다운시프트
  │    │                              DANGER_CONFIRMATION_MS 1200
  │    │
  │    ├─ LocalBoardPublisher  ─30Hz→ ┐
  │    ├─ RemoteBoardReplica   ←──────┤ P2pBattleTransport (호스트 권위)
  │    └─ RemoteTransformBuffer       │   커맨드 11종 / 이벤트 20종
  │         140ms 지연 보간            │   localStorage 권위 직렬화
  │         70ms 외삽                  │
  │                                   └─ WebRtcDataChannelTransport (GAME_P2P_V1)
  │
  ├─ BattleExitCoordinator (퇴장 순서 보장)
  ├─ BattleRoomRecovery (재입장 백오프)
  └─ BattleRefreshExit (Navigation Timing 기반 새로고침 판정)

MeshBattleMediaSession ── RoomRealtimeSocket (ticket, SIGNAL 전용)
                       └─ SharedGameCameraSession (track 단일 소유)
```

### 상태 머신을 클래스로 분리한 이유

`BattleStateMachine`은 정의되지 않은 전이에서 예외를 던진다. 실시간 코드에서 가장 비싼 버그가 "어떻게 이 상태에 왔는지 모르는 상태"이기 때문이다. `FINISHED → IDLE | COUNTDOWN | PLAYING`만 허용해 재대결 경로를 명시하고, 그 외의 우회 진입은 테스트에서 터진다.

---

## 11. 판단과 배운 점

인과관계로 정리하면 이렇다.

1. **백엔드가 게임을 중계하지 않는 제약**을 우회 대상이 아니라 설계 입력으로 받았다 → 브라우저 호스트 권위 구조가 나왔다. 남을 기다리지 않고 게임을 완성할 수 있었다.

2. **낙관적 로컬 판정은 경쟁 자원에서 성립하지 않는다.** 지연을 줄여 해결할 문제가 아니라 판정 주체가 없는 구조 문제였다. → claim 중재로 재설계하고, 잃어버린 반응성은 *연출과 상태를 분리*해 회복했다.

3. **브로드캐스트 채널에서 복구 스냅샷은 수신자를 한정해야 한다.** P2P는 대상 지정이 없으므로 페이로드에 `restoreForPlayerId`를 넣어 적용 대상을 명시해야 했다. → "자기 권위 보드가 오기 전까지 PLAYING으로 가지 않는다"는 불변식으로 정리했다.

4. **분할 상황에서 두 노드가 관측만으로 배타적 결론에 도달할 수 없다.** 자동 몰수패를 구현하는 대신 **기능을 보류했다.** 이 프로젝트에서 가장 의식적으로 내린 판단이다. 구현할 수 있는 것과 구현해야 하는 것이 다르다.

5. **비동기 요청은 순서를 보장하지 않으면 상태를 되살린다.** create/join/leave 직렬화, 세대 카운터, 퇴장 중 기록 차단이 모두 같은 문제의 다른 얼굴이었다.

6. **애매할 때 조용히 추측하지 않게 만들었다.** 체크섬이 어긋나면 스냅샷을 폐기하고, 모호한 끊김에서는 승자를 만들지 않고, 5xx에서는 방이 없다고 추측하지 않는다. 실시간 시스템에서 잘못된 값을 통과시키는 비용이 한 프레임을 놓치는 비용보다 훨씬 크다.

### 남은 과제

- **몰수패 정책**: 서버가 인증된 peer 연결 상태를 권위 근거로 제공하면 활성화 가능
- **방 메타데이터**: create/response/SSE에 `title`, `hostNickname`, `symbolRange`, `createdAt`이 영속화되면 브라우저 보완 로직 제거 가능
- **설정값 실측**: 보간 지연 140ms, 전송 30Hz, 외삽 70ms, 유예 10초는 모두 체감 기준으로 정했다. 실제 RTT·손실률 분포를 측정해 재조정해야 한다
- **다중 네트워크 검증**: TURN relay 경유 시 동기화 오차가 미측정이다

---

## 근거 자료

### 전송·권위

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/battle/transport/P2pBattleTransport.ts` | 호스트 권위, claim 중재, `CLAIM_EFFECT_DURATION_MS 1150`, `MAX_PROCESSED_COMMANDS 256`, `MATCH_COUNTDOWN_MS 3000`, `HAMMER_COMBO_TARGET 3`, `RECONNECT_SNAPSHOT_SETTLE_MS 240`, localStorage 권위 직렬화 |
| `block-stacking/battle/transport/battleTransportTypes.ts` | 커맨드 11종 / 이벤트 20종 정의 |
| `block-stacking/battle/transport/battleMessageParser.ts` | 필드 단위 타입 가드, `BattleMessageParseError` |
| `realtime/WebRtcDataChannelTransport.ts` | `GAME_P2P_V1` 봉투, 15초 오픈 대기, peer 기반 발신자 식별, 폴백 없음 |

### 실시간 채널

| 파일 | 확인한 내용 |
| --- | --- |
| `realtime/RealtimeTicketClient.ts` | 1회용 ticket 발급, 엄격 파싱 |
| `realtime/LobbySseClient.ts` | ticket query 구독, `snapshot`/`update` 이벤트, 필드 검증 |
| `realtime/RoomRealtimeSocket.ts` | 서버 메시지 7종 화이트리스트, `SIGNAL`만 송신, `DEFAULT_RECONNECT_BUDGET_MS 8000`, `RETRY_DELAYS_MS`, 401/403 즉시 중단 |
| `realtime/NativeRoomWebRtcSignalingTransport.ts` | 백엔드 `SIGNAL` ↔ 시그널링 포트 어댑팅 |
| `realtime/PeerDisconnectForfeit.ts` | `graceMs 10000`, 룸 WebSocket 미사용 주석 |

### 동기화

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/battle/sync/InterpolationConfig.ts` | 동기화 상수 전체 |
| `block-stacking/battle/sync/LocalBoardPublisher.ts` | 30Hz 전송, 정착 시 즉시 스냅샷, `bufferedAmount` 백프레셔 |
| `block-stacking/battle/sync/RemoteTransformBuffer.ts` | 140ms 지연 보간, 70ms 외삽, 최단 각도, `MAX_REMOVED_HISTORY 128` |
| `block-stacking/battle/sync/RemoteBoardReplica.ts` | 체크섬 검증, 시계 오프셋 고정, 미지 id 무시 |
| `block-stacking/battle/sync/BoardStateChecksum.ts` | FNV-1a 32bit, 좌표 양자화, 정렬 |
| `block-stacking/battle/sync/BoardSnapshotSerializer.ts` | 좌표 정규화와 `[-0.25, 1.25]` 클램프 |

### 생명주기

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/battle/core/BattleStateMachine.ts` | 8상태 전이 화이트리스트 |
| `block-stacking/battle/core/BattleController.ts` | `awaitingResumeOwnBoard`, `startAt` 기준 카운트다운, `gameOverReported`, 타이머 분리 관리 |
| `block-stacking/battle/core/BattleLocalBoardRuntime.ts` | `FIXED_PHYSICS_STEP_MS`, `MAX_CATCH_UP_STEPS 4`, `DANGER_CONFIRMATION_MS 1200`, `SETTLED_BOARD_FRAME_INTERVAL_MS 100` |
| `block-stacking/battle/core/BattleExitCoordinator.ts` | 퇴장 순서, `shouldLeaveRemotely()` |
| `block-stacking/battle/core/BattleRoomRecovery.ts` | `REJOIN_DELAYS_MS`, 재시도/중단 분류 |
| `block-stacking/battle/core/BattleRefreshExit.ts` | Navigation Timing 기반 판정, 마커 만료 30초 |
| `block-stacking/battle/room/SwaggerBattleRoomGateway.ts` | `membershipMutation` 직렬화, SSE 재연결 |
| `app/GameServiceProvider.tsx` | 세션 이중 저장, `storage` 이벤트, 세대 기반 cleanup 유예 |

### 미디어

| 파일 | 확인한 내용 |
| --- | --- |
| `media/camera/SharedGameCameraSession.ts` | track 단일 소유, in-flight 공유, generation 취소 |
| `media/mesh/MeshWebRtcMediaSession.ts` | `MAX_ROOM_PARTICIPANTS 4`, peer 3개 상한 |
| `media/mesh/PeerOfferPolicy.ts` | `localeCompare` 기반 결정적 offer 배분 |
| `media/mesh/IceCandidateBuffer.ts` | remote description 이전 candidate 버퍼링 |

### 테스트

`BattleController.test.ts`(37), `P2pBattleTransport.test.ts`(11), `RemoteTransformBuffer.test.ts`(8), `RoomRealtimeSocket.test.ts`(7), `MeshWebRtcMediaSession.test.ts`(16), `BoardStateChecksum.test.ts`, `BattleBotPracticeRuntime.integration.test.ts`

### 문서

`frontend/src/game/docs/game-troubleshooting.md`(3장·4장), `battle-ui-room-status-2026-08-02.md`, `backend-contract-alignment-2026-07-23.md`
