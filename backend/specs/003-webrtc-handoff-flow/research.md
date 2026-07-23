# Research: 방 실시간 연결 자동화 및 영상 통화 전환 시 안전한 정리

spec.md Assumptions에서 "이 스펙에서 정하지 않으며 계획 단계에서 정한다"로 명시적으로 미뤄둔 결정 지점들과, Technical Context의 나머지 불확실한 지점을 정리한다. 대부분 002에서 이미 구축된 코드베이스(`RoomRealtimeNotifier`, `RoomParticipantRegistry`, `GameRoomService` 등)를 그대로 확장하는 결정이다.

## 1. "전환 신호"(WEBRTC_CONNECTED) 메시지 설계 (FR-003/004, US2)

- **Decision**: 클라이언트→서버 메시지 타입을 `WEBRTC_CONNECTED`로 신설한다(payload 없음, `{"type": "WEBRTC_CONNECTED"}`). `GameRoomWebSocketHandler.handleTextMessage`가 이 타입을 받으면 `RoomParticipantRegistry`의 해당 참가자(`ParticipantLiveState`)에 `expectingIntentionalClose = true`를 표시한다. `afterConnectionClosed`가 호출될 때 이 플래그가 켜져 있으면 유예 타이머(`leave-grace-seconds`)를 걸지 않고 참가자를 그대로 정상 상태로 남긴다(FR-004) — 반대로 플래그가 꺼진 채 종료되면 기존과 동일하게 유예 타이머를 건다(FR-005, 회귀 없음).
- **Rationale**: 기존 `SIGNAL` 타입과 동일한 위치(핸들러의 `handleTextMessage` 분기)에 추가하면 되고, 새 상태 필드 하나(`boolean`)만 있으면 되어 구현 비용이 가장 낮다. `RoomSocketMessage`(기존 `{"type", "payload"}` 구조)를 그대로 재사용할 수 있어 payload가 없는 메시지도 자연스럽게 표현된다.
- **Alternatives considered**: 별도 REST API(`POST /game-rooms/{roomId}/webrtc-connected`) — spec.md Assumptions가 이미 "이 신호는 WS가 열려있는 동안 그 연결을 통해 보낸다, 별도 REST 아님"이라고 명시적으로 확정해뒀으므로 채택하지 않음.

## 2. 준비 상태 변경 실시간 통보 — `PEER_READY_CHANGED` (FR-030/031, US10)

- **Decision**: 서버→클라이언트 메시지 타입을 `PEER_READY_CHANGED`로 신설한다(payload: `{"userId": number, "isReady": boolean}`). `GameRoomService.setReady()`가 커밋 직후(`afterCommit`, 기존 `leave()`/`start()`와 동일한 패턴) `RoomRealtimeNotifier.notifyReadyChanged(roomId, userId, isReady)`를 호출한다. `WebSocketRoomRealtimeNotifier` 구현은 기존 `sendToOthers`(요청자 본인 제외, 상대방에게만 전송)를 그대로 재사용한다.
- **Rationale**: 기존 `PEER_DISCONNECTED`/`PEER_RECONNECTED`가 이미 "상대방에게만, 본인 제외"라는 동일한 전송 패턴을 쓰고 있어 `sendToOthers` 헬퍼를 그대로 쓸 수 있다. `RoomRealtimeNotifier` 인터페이스에 메서드 하나만 추가하면 되고, `send()` 내부의 세션 없음/닫힘 방어 로직(FR-031, "통보 실패가 API 자체 실패로 이어지지 않음")이 이미 `try/catch`로 구현되어 있어 추가 방어 코드가 필요 없다.
- **Alternatives considered**: `GameRoomResponse`에 상대방 ready 상태를 실어 REST 응답에만 반영 — 이건 이미 되어 있는 것이고(001), 정작 문제는 "상대방이 바꾼 걸 내가 실시간으로 못 받는다"는 것이므로 해결이 안 됨(사용자가 대화 중 직접 지적한 문제).

## 3. 게임 종류 표현 — `GameType` enum과 `game_rooms` 확장 (FR-017/018/020, US6)

- **Decision**: `GameType` enum(`SIGN_DUEL`, `TETRIS_DUEL`)을 `game/domain`에 신설하고, `GameRoom`에 `@Enumerated(EnumType.STRING) private GameType gameType` 필드를 추가한다. `game_rooms.game_type` 컬럼은 `VARCHAR` + `NOT NULL DEFAULT 'SIGN_DUEL'`(기존 데이터 백필, spec.md Assumptions). 정원은 여전히 `GameRoomResponse.CAPACITY = 2` 상수 그대로 — 두 게임 종류 모두 대전 모드라 정원이 갈리지 않는다(FR-020). 로비 실시간 목록에도 게임 종류가 노출되어야 하므로(FR-018), `game/realtime/dto/LobbyRoomSummary.java`에도 동일한 `gameType` 필드를 추가한다 — `GameRoomResponse`와는 별개의 record라 각자 따로 필드를 추가해야 하며 자동으로 동기화되지 않는다(`LobbyBroadcastService`가 `GameRoomResponse`가 아니라 `LobbyRoomSummary`를 직접 조립해 쓰기 때문, data-model.md 참고).
- **Rationale**: `EnumType.STRING`은 `EnumType.ORDINAL`과 달리 나중에 세 번째 대전 종류가 추가되어도 기존 행의 의미가 바뀌지 않는다(정수 순서 의존 없음) — 이 프로젝트가 이미 `GameRoomStatus`, `Sign.category` 등에서 일관되게 쓰는 패턴이라 그대로 따른다. `TETRIS_DUEL`이라는 이름은 spec.md의 "테트리스 대전"을 그대로 옮긴 것이며, 솔로는 `GameType`에 포함하지 않는다 — 솔로는 `game_rooms`를 아예 쓰지 않으므로(FR-027) 이 enum에 넣을 이유가 없다(넣으면 "솔로도 game_rooms를 거칠 수 있다"는 잘못된 인상을 준다).
- **Alternatives considered**: 세 종류(솔로 포함) 모두를 하나의 `GameType`으로 묶어 `game_rooms`와 `game_results`에서 공유 — 앞선 대화에서 실제로 이 방향으로 갔다가(spec.md 히스토리) "솔로는 게임방 개념을 안 쓴다"는 결정으로 되돌아온 바 있다. `game_results` 쪽은 세 종류를 다 표현해야 하므로 별도 enum(#5 참고)이 필요하다 — `game_rooms.game_type`과 `game_results.game_type`은 값 집합이 다르므로(전자는 2종, 후자는 3종) 같은 Java enum을 공유하지 않는다.

## 4. 대전 모드 결과 보고 — 승자 정보만, 무승부 포함 (FR-021/033, US4)

- **Decision**: `GameResultRequest`를 `record GameResultRequest(Long winnerUserId)`로 교체한다(`@Nullable`, 검증 없음 — null이면 무승부). 서버는 `winnerUserId`가 null이 아니면 그 값이 실제로 해당 방의 참가자(host 또는 guest)인지 검증하고(아니면 400), null이면 무승부로 처리해 `game_results`에 아무 것도 기록하지 않는다(#5). 승자가 있으면 승자에게 `score=1`, 패자에게 `score=0` 행을 각각 `game_results`에 기록한다(#5 — `COUNT(*) - SUM(score)` 동률 정렬에 패자 행이 반드시 필요함, FR-026).
- **Rationale**: 기존 계약(`game-rooms-api.yaml`)의 "점수는 역할(host/guest) 기준" 방식은 점수 자체가 없어지므로 더 이상 적용 대상이 아니다. 승자를 `userId`로 직접 받으면(역할 라벨이 아니라) 클라이언트가 실수로 host/guest를 헷갈릴 여지가 원천적으로 없다 — 기존 계약이 "역할 매핑 실수를 막기 위해 점수를 역할 기준으로 받는다"고 명시했던 것과 같은 목적을, userId 직접 지정으로 더 확실하게 달성한다.
- **Alternatives considered**: `winnerRole: "HOST" | "GUEST" | null` 같은 역할 기반 필드 — 기존 계약이 이미 이 방식의 위험(역할 매핑 실수)을 지적한 바 있어 userId 직접 지정이 더 안전하다고 판단해 채택하지 않음.

## 5. 세 게임 종류 공통 저장 구조 — `game_results` 테이블 (FR-025/026/029/032, US9)

- **Decision**: 신규 테이블 `game_results(id, user_id, game_type, score, recorded_at)`을 만든다. `game_type`은 `SIGN_DUEL`/`TETRIS_DUEL`/`TETRIS_SOLO` 3종(별도 Java enum, `gameresult/domain/GameResultType.java` — `game_rooms.game_type`의 `GameType`과는 다른 enum, #3 참고). 기록 규칙: 대전 모드 승리 시 승자에게 `score=1` 행, **패자에게 `score=0` 행도 함께** 기록(무승부는 둘 다 기록 없음, FR-033). 솔로는 보고할 때마다 `score=<실제 점수>` 행 하나(매번, 중복 제한 없음). 랭킹 조회는 대전 모드 `SUM(score) DESC`(승수) 후 동률이면 `(COUNT(*) - SUM(score)) ASC`(패수, `#8` 참고)로, 솔로는 `MAX(score) DESC`(최고 점수)로 `game_type` 필터링해 계산한다.
- **Rationale**: spec.md Assumptions가 이 구조("게임 종류 + 점수" 공통 저장, SUM/MAX 집계)를 확정해뒀다. 패자도 반드시 기록해야 하는 이유는 YAGNI가 아니라 **기존 001 `RankingService`(`findTop5ByDeletedAtIsNullOrderByWinCountDescLossCountAsc`)가 이미 승수 동률 시 패수 오름차순으로 정렬하는 동작을 갖고 있고**(회귀 없이 보존해야 함, FR-026), 패수를 구하려면 패배 행 자체가 있어야 하기 때문이다(승자 행만으로는 `COUNT(*) - SUM(score)`를 계산할 수 없다 — 애초에 패배 이벤트가 몇 번 있었는지 알 방법이 없다). 처음에는 "승자만 기록"으로 정했었으나(패배 행을 YAGNI로 판단), 이 동률 규칙을 다시 확인하는 과정에서 패자 기록이 실제로는 필수 요구사항이었음이 드러나 정정했다.
- **Alternatives considered**: 승자만 기록(초기안) — 랭킹이 승수(SUM)만 요구한다고 잘못 판단했던 결과였고, 실제로는 FR-026의 동률 규칙 때문에 패수도 필요해 폐기. 별도의 "패배 횟수" 카운터 컬럼을 `users`에 유지 — `game_results` 하나로 승/패를 다 표현할 수 있는데 굳이 별도 컬럼을 병행 유지할 이유가 없어 채택하지 않음.

## 6. 기존 `users.win_count`/`loss_count` 마이그레이션 (FR-032)

- **Decision**: `win_count > 0` 또는 `loss_count > 0`인 사용자마다 `game_results`에 승수만큼 `score=1` 행을, 패수만큼 `score=0` 행을 **각각 반복해서 여러 개** 삽입한다(예: 37승 10패라면 1점짜리 37행, 0점짜리 10행). 백필 후 `users.win_count`/`loss_count` 컬럼을 완전히 제거한다.
- **Rationale**: `COUNT(*) - SUM(score)` 공식으로 패수를 계산하려면 승리/패배 횟수와 테이블의 행(row) 개수가 1:1로 일치해야 한다. 만약 37승을 `score=37`인 단일 행으로 백필하면 `COUNT(*) = 1`, `SUM(score) = 37`이 되어 패수가 `-36`으로 계산되는 치명적인 수학적 오류가 발생한다. 또한 기존 랭킹의 동률 산정 기준을 유지하려면 패배 기록(`loss_count`)도 반드시 백필해야 한다.
- **Alternatives considered**: 단일 스냅샷(`score=win_count`) 1행으로 백필(초기안) — 앞서 언급한 집계 공식 오류 및 `loss_count` 소실 문제로 인해 폐기. DB 쿼리(CTE)를 통해 행을 N개 늘려주는 방식으로 해결한다.

## 7. `win_count`/`loss_count` 참조 코드 조사 결과

- **Decision**: 저장소 전체를 검색한 결과 `win_count`/`loss_count`(또는 `getWinCount()`/`getLossCount()`)를 직접 참조하는 곳은 `RankingService`(`findTop5ByDeletedAtIsNullOrderByWinCountDescLossCountAsc`, `countHigherRanked`)와 `RankingEntry.of(...)` 두 곳뿐이다. `GameRoomService.updateUserRecords`(기존 `reportResult`가 승패를 반영하던 지점)도 이 컬럼을 직접 증감시키고 있었으나, 이번 변경으로 그 메서드 자체가 `game_results` INSERT로 대체된다(#5). 그 외(프로필 조회 응답 `UserProfileResponse` 등)는 이 컬럼을 노출하지 않는 것으로 확인됨 — 마이그레이션 영향 범위가 예상보다 좁다.
- **Rationale**: `RankingService`는 이번 스펙에서 어차피 게임 종류별 분리 집계로 전면 재작성되므로(#5) 자연스럽게 새 쿼리로 교체된다. 별도의 광범위한 리팩터링이 필요 없다.
- **Alternatives considered**: 해당 없음(조사 결과 자체가 결정 사항).

## 8. `game_sessions` 테이블 완전 제거 (GAME-02-19-T03)

- **Decision**: `game_sessions`(및 대응 엔티티 `GameSession`/`GameSessionRepository`)를 컬럼만 줄이는 게 아니라 **테이블 자체를 제거**한다. 대전 모드 랭킹에 필요한 승/패 집계는 이제 `game_results`(#5, 승자 `score=1`/패자 `score=0` 행)만으로 완전히 계산 가능하다 — `SUM(score)`가 승수, `COUNT(*) - SUM(score)`가 패수(FR-026 동률 처리에 사용).
- **Rationale**: 저장소 전수 조사 결과 `GameSessionRepository`는 `JpaRepository`만 상속하고 커스텀 쿼리 메서드가 하나도 없으며, `GameRoomService.reportResult()`의 `save()` 호출 외에 이 엔티티를 **읽는 코드가 어디에도 없다**(001부터 지금까지 write-only). 애초에 "누가 누구와 언제 붙었는지"(대진 페어링, `player1_id`/`player2_id`/`started_at`/`ended_at`)를 보여주는 기능 자체가 스펙 어디에도 없으므로, 컬럼만 줄여 테이블을 유지하는 것은 죽은 테이블을 계속 끌고 가는 것과 같다(YAGNI를 #5의 "패자 기록"에는 적용하면서 정작 테이블 자체엔 적용하지 않았던 게 이번에 드러난 불일치). `game_results`가 승/패 집계를 이미 전부 커버하므로 매치마다 두 테이블에 중복으로 쓸 이유도 없다.
- **Alternatives considered**: 점수 컬럼만 제거하고 테이블 유지(이전 결정) — `game_results`가 패자 기록까지 갖게 되면서(#5) `game_sessions`가 제공하던 유일한 잠재 가치(승/패 판정 근거)마저 완전히 중복이 되어 폐기. 페어링 정보(상대가 누구였는지)가 나중에 필요해지면, 그때 별도 스펙에서 `match_id` 같은 연결 키를 가진 테이블을 새로 설계하는 편이 지금 안 쓰는 컬럼을 남겨두는 것보다 낫다고 판단.

## 9. 솔로 결과 API 설계 — 완전히 독립된 엔드포인트 (FR-027/028, US8)

- **Decision**: `POST /solo-results`(게임방 경로 `/game-rooms/...` 와 완전히 분리된 최상위 경로)를 신설한다. 요청 `SoloResultRequest(Integer score)`, 인증은 기존 JWT `bearerAuth` 그대로 재사용(점수를 "누구의 것으로" 기록할지는 로그인된 사용자로 식별해야 하므로 — 이건 매 API가 이미 따르는 표준 패턴이라 별도 논의 대상이 아님). `SoloResultService.report(userId, score)`가 검증·중복 방지 없이 곧바로 `GameResultRepository.save(new GameResult(userId, TETRIS_SOLO, score))`만 호출한다. 이 서비스가 속한 Java 패키지는 `gameresult`(URL 경로 `/solo-results`와는 별개 — 패키지명은 세 게임 종류가 공유하는 저장 구조를 반영해 정했고, API 경로명은 FR-027의 "솔로 전용" 의도를 반영해 정했다, #3/#5 참고).
- **Rationale**: FR-027이 "게임방 API와 완전히 별개의 새 API"를 명시적으로 요구했다. 인증을 요구하는 이유는 랭킹에 귀속시킬 사용자를 알아야 하기 때문이며, 이건 스펙의 다른 논의 대상이 아니라 이 프로젝트의 모든 인증 필요 엔드포인트가 따르는 기존 규칙(JWT)을 그대로 적용하는 것뿐이다.
- **Alternatives considered**: `POST /game-rooms/solo-results`처럼 `game-rooms` 하위 경로에 배치 — URL 경로만 봐도 "게임방 리소스의 일부"처럼 보여 FR-027의 "완전히 별도" 의도와 어긋나므로 채택하지 않음.

## 10. 랭킹 API — 게임 종류 필수 파라미터 + `me` nullable (FR-025/026/029, US9)

- **Decision**: `GET /rankings?gameType=SIGN_DUEL|TETRIS_DUEL|TETRIS_SOLO`(필수 쿼리 파라미터, 누락 시 400). `RankingResponse.me`를 `nullable`로 바꾼다 — 요청자가 해당 게임 종류를 한 번도 플레이하지 않았으면(=`game_results`에 해당 `user_id`+`game_type` 행이 없으면) `me: null`을 반환한다(US9 AC4). `top`(Top 5)은 대전 모드는 `SUM(score) DESC`, 솔로는 `MAX(score) DESC` 정렬.
- **Rationale**: spec.md가 "세 게임 종류가 완전히 분리되고 통합 랭킹은 없다"(FR-025)고 명시했으므로 게임 종류를 지정하지 않고는 애초에 랭킹을 조회할 방법이 없어야 한다 — 필수 파라미터가 자연스럽다. `me`가 기존처럼 항상 존재하는 값이면 "플레이한 적 없어도 0승 0패로 랭킹에 잡힌다"는 기존 001 동작이 재현되는데, spec.md AC4가 명시적으로 "그 랭킹에 나타나지 않는다"고 요구하므로 아예 `null`로 없음을 표현한다.
- **Alternatives considered**: 기본값(예: `gameType` 생략 시 `SIGN_DUEL`) — 기존 클라이언트 호환을 위해 고려했으나, 그러면 "파라미터를 깜빡한 요청"과 "의도적으로 지문자 대전을 본 요청"을 서버가 구분할 수 없어 버그를 숨기게 된다. 프론트가 어차피 새로 게임 종류 선택 UI를 만들어야 하므로(spec 003 전체가 그 전제 위에 있음) 필수로 강제하는 쪽이 안전하다고 판단.

## 11. 대전 모드 방 생성 API — `gameType` 요청 방식 (FR-017)

- **Decision**: `POST /game-rooms` 요청 바디에 `CreateRoomRequest(GameType gameType)`(필수)를 신설한다 — 지금은 이 엔드포인트가 요청 바디 없이 호출된다(`GameRoomController.createRoom`이 `@LoginUser Long userId`만 받음).
- **Rationale**: 다른 방법(예: 쿼리 파라미터, 경로 분리 `/game-rooms/sign-duel` vs `/game-rooms/tetris-duel`)보다 요청 바디에 명시적 필드로 두는 게 이 프로젝트의 기존 관례(`JoinRoomRequest`, `ReadyRequest` 등 다른 쓰기 요청도 전부 바디 필드)와 일관된다.
- **Alternatives considered**: 경로 분리(`POST /game-rooms/{gameType}`) — 게임 종류가 늘어날 때마다 라우팅 규칙이 늘어나고, 컨트롤러 메서드도 늘어나 관리 비용이 커진다고 판단해 제외.

