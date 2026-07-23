# Data Model: 방 실시간 연결 자동화 및 영상 통화 전환 시 안전한 정리

001/002 스펙에서 정의된 `GameRoom`/`User`는 그대로 유지하며(별도 언급 없는 필드는 변경 없음), 이번 스펙이 추가/변경/제거하는 **델타**와 신규 엔티티, 인메모리 확장분만 정리한다. `GameSession`은 유지가 아니라 이번 스펙에서 완전히 제거되는 대상이다(아래 참고). 모든 스키마 변경은 스키마 변경 SQL 스크립트로 관리한다.

## 기존 테이블 변경분

### GameRoom (`game_rooms`) — `game_type` 컬럼 추가 (FR-017/018/020, research.md #3)

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| **game_type** | **VARCHAR(20)** | **NOT NULL DEFAULT 'SIGN_DUEL'** | **(신규)** `SIGN_DUEL`(지문자 1:1 대전) \| `TETRIS_DUEL`(테트리스 대전). 대전 모드 전용 — 솔로는 이 테이블 자체를 쓰지 않는다(FR-027). 생성 시 한 번 정해지며 이후 변경 불가(spec.md Assumptions). |

```sql
ALTER TABLE game_rooms ADD COLUMN game_type VARCHAR(20) NOT NULL DEFAULT 'SIGN_DUEL';
```

정원은 두 게임 종류 모두 2명으로 동일해 별도 컬럼을 두지 않는다(`GameRoomResponse.CAPACITY` 상수 그대로, FR-020).

### LobbyRoomSummary — `gameType` 필드 추가 (FR-018, research.md #3)

로비 실시간 목록(SSE)이 응답에 쓰는 `game/realtime/dto/LobbyRoomSummary.java`(`id, roomCode, status, participantCount, capacity`)는 `GameRoomResponse`와는 별개의 record다 — `LobbyBroadcastService`가 `GameRoomRepository.findByStatus` 결과로 이 record를 직접 조립하며 `GameRoomResponse`를 재사용하지 않는다. 따라서 `GameRoomResponse`에 `gameType`을 추가한 것과 별도로, `LobbyRoomSummary`에도 `gameType` 필드를 추가해야 FR-018("방 정보 — 생성/입장 응답, 로비 실시간 목록 — 에 게임 종류를 포함")이 로비 목록 쪽까지 충족된다.

| 필드 | 타입 | 설명 |
|---|---|---|
| **gameType** | **GameType** | **(신규)** `game_rooms.game_type`을 그대로 반영. 직렬화 시 `SIGN_DUEL`/`TETRIS_DUEL` 문자열. |

### GameSession (`game_sessions`) — 테이블 완전 제거 (research.md #8)

`game_sessions` 테이블과 대응 엔티티(`GameSession`/`GameSessionRepository`)를 삭제한다. 대전 모드 승/패 집계는 이제 `game_results`(아래, 승자 `score=1`/패자 `score=0` 행)만으로 완전히 계산되며, `game_sessions`는 어떤 코드에서도 읽힌 적이 없는 write-only 테이블이었다(research.md #8).

```sql
DROP TABLE game_sessions;
```

**순서 주의**: 이 DDL은 `game_results` 테이블 생성 및 관련 애플리케이션 코드 배포 이후에 실행되어야 한다(구버전 코드가 여전히 `game_sessions`에 쓰고 있는 상태에서 먼저 드롭하면 안 됨).

### User (`users`) — 승패 카운터 컬럼 제거 (FR-032, research.md #6/#7)

| 필드 | 변경 |
|---|---|
| **win_count** | **제거**(마이그레이션 후) — `game_results`(아래)의 SUM 집계로 대체 |
| **loss_count** | **제거**(마이그레이션 후) — 패수 역시 동률 정렬에 필요하므로 `game_results`에 `score=0` 행으로 백필 |

```sql
-- (마이그레이션 스크립트, research.md #6 — 사용자당 누적 승/패수만큼 반복해서 개별 행으로 백필)
-- MySQL 8.0+ CTE 기능을 사용하여 승수(win_count)만큼 score=1 레코드를, 패수(loss_count)만큼 score=0 레코드를 생성합니다.
INSERT INTO game_results (user_id, game_type, score, recorded_at)
WITH RECURSIVE NumberSequence AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM NumberSequence WHERE n < 10000 -- 적절한 최대 승/패수 상한선
)
SELECT u.id, 'SIGN_DUEL', 1, NOW()
FROM users u
JOIN NumberSequence ns ON ns.n <= u.win_count
UNION ALL
SELECT u.id, 'SIGN_DUEL', 0, NOW()
FROM users u
JOIN NumberSequence ns ON ns.n <= u.loss_count;

ALTER TABLE users DROP COLUMN win_count, DROP COLUMN loss_count;
```

**순서 주의**: 이 DDL은 반드시 `game_results` 테이블 생성(아래) **이후**에 실행되는 별도 스크립트여야 한다.

## 신규 테이블

### GameResult (`game_results`) — 세 게임 종류 공통 저장 구조 (FR-025/026/029/032, research.md #5)

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | NOT NULL, FK → `users.id` | 이 기록의 귀속 사용자 |
| game_type | VARCHAR(20) | NOT NULL | `SIGN_DUEL` \| `TETRIS_DUEL` \| `TETRIS_SOLO` — `game_rooms.game_type`과는 값 집합이 다른 별도 개념(솔로 포함 3종) |
| score | INT | NOT NULL | 대전 모드: 승리 시 `1`, 패배 시 `0`(무승부는 행 자체가 없음). 솔로: 실제 게임 점수 |
| recorded_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

```sql
CREATE TABLE game_results (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    game_type   VARCHAR(20) NOT NULL,
    score       INT NOT NULL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_game_result_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_game_result_user_type (user_id, game_type),
    INDEX idx_game_result_type_score (game_type, score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='세 게임 종류(지문자 1:1 대전/테트리스 대전/테트리스 솔로) 공통 결과 기록 — 랭킹 집계 원본';
```

**기록 규칙** (research.md #5):
- 대전 모드(`SIGN_DUEL`/`TETRIS_DUEL`) 승리 시: 승자에게 `score=1` 행 1개, **패자에게 `score=0` 행 1개**(같은 매치에서 두 행이 함께 저장됨). 무승부는 둘 다 기록하지 않는다(FR-033).
- 솔로(`TETRIS_SOLO`): 결과 보고 API 호출마다 `score=<실제 점수>` 행 1개. 중복 제출 방지 없음(spec.md Assumptions, 의도적).

**집계 규칙**:
- `SIGN_DUEL`/`TETRIS_DUEL` 랭킹: `SUM(score) GROUP BY user_id WHERE game_type = ?` → 승수. 동률이면 `COUNT(*) - SUM(score)`(패수) 오름차순으로 2차 정렬한다(FR-026, 기존 001 `users.win_count`/`loss_count` 기준 동률 규칙과 동일).
- `TETRIS_SOLO` 랭킹: `MAX(score) GROUP BY user_id WHERE game_type = 'TETRIS_SOLO'` → 최고 점수.
- 탈퇴 사용자(`users.deleted_at IS NOT NULL`)는 기존 규칙과 동일하게 랭킹에서 제외(조인 조건).

**신규 Java enum** — `GameResultType`(`gameresult/domain` 패키지): `SIGN_DUEL`, `TETRIS_DUEL`, `TETRIS_SOLO`. `game/domain/GameType`(2종, `game_rooms` 전용)과는 다른 별도 enum이다(research.md #3) — 값 집합이 다르고 소속 패키지도 달라 혼동을 줄인다.

## 인메모리 전용 확장 (DB 테이블 아님, 002의 `RoomParticipantRegistry` 확장)

### ParticipantLiveState — `expectingIntentionalClose` 필드 추가 (FR-003/004, research.md #1)

| 필드 | 타입 | 설명 |
|---|---|---|
| **expectingIntentionalClose** | **boolean** | **(신규)** 클라이언트가 `WEBRTC_CONNECTED` 메시지를 보내면 `true`로 전환. `afterConnectionClosed`가 이 값이 `true`인 채로 호출되면 유예 타이머(`leave-grace-seconds`)를 걸지 않는다(FR-004). `false`인 채로 종료되면 기존과 동일하게 유예 타이머 적용(FR-005). 초기값 `false`. |

기존 필드(`confirmed`, `session`, `pendingDeadline`, `pendingTask` 등, 002 data-model.md 참고)는 변경 없음.

## 신규 WebSocket 메시지 (DB/엔티티 아님 — `contracts/realtime-websocket-messages-delta.md` 참고)

| type | 방향 | payload | 설명 |
|---|---|---|---|
| `WEBRTC_CONNECTED` | 클라이언트 → 서버 | 없음 | 영상 통화 연결 성립, 방 실시간 연결을 의도적으로 종료함을 알림(FR-003) |
| `PEER_READY_CHANGED` | 서버 → 클라이언트 | `{ "userId": number, "isReady": boolean }` | 상대방의 준비 상태가 바뀌었음을 실시간 통보(FR-030) |

## 상태 전이 변경분

### GameRoom.status — 결과 보고 후 CLOSED 대신 WAITING (FR-013/014)

기존(001/002): `IN_PROGRESS` → 결과 보고 → `CLOSED`.

신규(대전 모드만): `IN_PROGRESS` → 결과 보고 시 두 참가자가 모두 남아있으면 `WAITING`으로 복귀(양쪽 `ready` 플래그 초기화, 인원 유지) → 재입장 시 새 티켓 발급(FR-016) → 재준비 → 재시작 가능. 서버는 게임 진행 중 실시간 이탈을 감지하지 않으므로(FR-007), 상대방이 결과 보고 이전에 명시적으로 `POST /leave`를 호출한 경우에만 방이 미리 `CLOSED`로 바뀔 수 있다 — 이 경우 이후의 결과 보고는 기존 규칙(`IN_PROGRESS`가 아닌 방은 결과 보고 거부, `ROOM_NOT_IN_PROGRESS` 409)에 따라 그대로 거부된다(FR-014, 새 로직 없음). 솔로는 이 상태 머신 자체가 없다(게임방을 안 씀).
