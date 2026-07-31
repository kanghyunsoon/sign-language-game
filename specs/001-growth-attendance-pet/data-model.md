# Data Model: 출석 및 펫 성장

엔티티 간 연결은 기존 코드처럼 ID 필드를 사용하고 JPA 연관관계는 추가하지 않는다. 각 Repository는 소속 도메인 서비스에서만 사용한다.

## Attendance

| 필드 | 타입 | 규칙 |
|---|---|---|
| id | Long | PK |
| userId | Long | 사용자 ID, 필수 |
| attendanceDate | LocalDate | Asia/Seoul 기준 서비스 날짜 |
| streakCount | int | 1 이상 |
| createdAt | LocalDateTime | 서버 생성 시각 |

- 고유 제약: `(user_id, attendance_date)`
- 인덱스: `(user_id, attendance_date DESC)`
- 생성 규칙: 전날 가장 최근 출석이 있으면 이전 `streakCount + 1`, 아니면 1

## UserPet

| 필드 | 타입 | 규칙 |
|---|---|---|
| id | Long | PK |
| userId | Long | 사용자당 유일, 필수 |
| level | int | 1~20 |
| exp | int | 레벨 1~19는 0~19, 레벨 20은 0 |
| createdAt | LocalDateTime | 생성 시각 |
| updatedAt | LocalDateTime | 변경 시각 |

- 이름과 진화 단계는 저장하지 않는다.
- 진화 단계:
  - `STAGE_1`: 레벨 1~4
  - `STAGE_2`: 레벨 5~9
  - `STAGE_3`: 레벨 10~14
  - `STAGE_4`: 레벨 15~19
  - `STAGE_5`: 레벨 20
- 갱신은 `userId` 기준 비관적 쓰기 잠금을 사용한다.
- 기존 펫의 레벨과 경험치는 유지한다. 기존 10레벨 펫은 `STAGE_3`으로 계산되고 20레벨까지 다시 성장한다.

### XP 상태 전이

1. 레벨 20이면 입력 XP를 무시하고 `level=20, exp=0`을 유지한다.
2. 현재 XP에 보상을 더한다.
3. 합계가 20 이상이고 레벨이 20 미만인 동안 XP 20을 차감하고 레벨을 1 올린다.
4. 레벨 20에 도달하면 남은 XP를 0으로 만든다.

## TestSession

| 필드 | 타입 | 규칙 |
|---|---|---|
| id | Long | PK |
| userId | Long | 세션 소유자 |
| startedAt | LocalDateTime | 시작 시각 |
| completedAt | LocalDateTime | 미완료 시 null |
| correctCount | int | 완료 전 null, 완료 시 0 이상 |
| totalCount | int | 완료 전 null, 완료 시 1 이상 |

- 상태: `STARTED → COMPLETED`
- `correctCount <= totalCount`
- `correctCount * 100 >= totalCount * 80`이면 최초 완료 트랜잭션에서 XP 7을 지급한다.
- 완료된 같은 세션은 다시 보상하지 않는다.

## GameResult

| 필드 | 타입 | 규칙 |
|---|---|---|
| id | Long | PK |
| userId | Long | 결과 소유 사용자, 필수 |
| gameType | Enum | `SIGN_DUEL`, `TETRIS_DUEL`, `TETRIS_SOLO` |
| score | int | 게임 종류별 의미가 다름 |
| recordedAt | LocalDateTime | 서버 기록 시각 |

### `score` 의미

| gameType | 원본 `score` | 좋은 기록 | 보상 |
|---|---|---|---|
| `TETRIS_SOLO` | 게임 진행 시간(초), 1 이상 | 낮을수록 좋음 | ≤60: 15, ≤90: 10, ≤120: 5, 그 외 0 |
| `SIGN_DUEL` | 승리 1, 패배 0 | 랭킹에서 승수 합계가 높을수록 좋음 | 승 10, 패 3 |
| `TETRIS_DUEL` | 승리 1, 패배 0 | 랭킹에서 승수 합계가 높을수록 좋음 | 승 10, 패 3 |

- 인덱스 `(user_id, game_type)`은 사용자별 집계를 지원한다.
- 인덱스 `(game_type, score)`는 게임 종류 필터와 솔로 점수 정렬을 지원한다.
- `soloSessionId`와 `playDurationMs`는 최종 모델에 존재하지 않는다.

### 솔로 랭킹 파생값

- 사용자별 기록: `MIN(score)`
- 정렬: 최소 `score` 오름차순, 동점 표시 순서는 `userId` 오름차순
- 순위: `1 + (자신보다 작은 최소 score를 가진 사용자 수)`
- 같은 최소 `score`는 같은 순위이며 다음 순위는 건너뛴다.
- 탈퇴 사용자는 기존 사용자 조회 제약에 따라 제외한다.

## 제거되는 모델

다음 모델은 최종 스키마와 애플리케이션에 존재하지 않는다.

- `PracticeSession`
- `SoloSession`
- `SoloSessionSymbol`
- `SoloSymbolStatistic`

연습은 백엔드 보상·이력을 만들지 않는다. 솔로 시작·중단·재시작·상세 통계와 중복 방지는 게임이 관리한다.

## Transaction Boundaries

| 활동 | 최초 완료 또는 신뢰 근거 | 같은 트랜잭션의 변경 |
|---|---|---|
| 출석 | 사용자+서비스 날짜 고유키 | Attendance 생성, UserPet XP 3 |
| 테스트 | TestSession 최초 `COMPLETED` 전이 | 점수/완료 저장, 조건부 UserPet XP 7 |
| 솔로 | 신뢰 게임 서버의 유일한 완료 전송 | TETRIS_SOLO GameResult 생성, 점수 구간별 UserPet XP |
| 1대1 | GameRoom 최초 정상 결과 전이 | 양쪽 GameResult 생성, 승·패 UserPet XP |

결과 저장 또는 펫 갱신 중 하나가 실패하면 전체 변경을 롤백한다. 솔로는 백엔드 내부 중복 키나 지급 원장을 추가하지 않는다.

## V8 Migration

1. `TETRIS_SOLO`이고 `play_duration_ms`가 있는 기존 행은 `CEIL(play_duration_ms / 1000)`으로 `score`를 갱신한다.
2. `play_duration_ms`가 없는 기존 솔로 행의 초 단위 `score`는 유지한다.
3. `game_results`의 솔로 세션 FK·유니크·시간 체크·시간 인덱스를 제거한다.
4. `solo_session_id`, `play_duration_ms` 컬럼을 제거한다.
5. `solo_session_symbols`, `solo_symbol_statistics`, `solo_sessions`, `practice_sessions`를 제거한다.
6. `test_sessions` 확장 필드와 모든 유효 `game_results`, `user_pets` 데이터는 보존한다.
