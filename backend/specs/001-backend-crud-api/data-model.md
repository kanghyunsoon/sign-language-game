# Data Model: 백엔드 CRUD API 1차 구축

spec.md의 Key Entities와 `backend/jira-crud-backlog.md`의 기존 DB 스키마 초안을 기반으로 하되, `/speckit-clarify` 및 후속 논의에서 확정된 사항(게임방 `updated_at` 도입, CLOSED 트리거 확장)을 반영했다. 펫/출석은 spec.md 결정에 따라 **엔티티(테이블/JPA 클래스)만 정의**하고 서비스/컨트롤러는 만들지 않는다.

## User (`users`)

회원가입한 서비스 이용자. 이메일/닉네임/비밀번호, 누적 전적, 탈퇴 여부(Soft Delete)를 가진다.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK, AUTO_INCREMENT) | | |
| email | VARCHAR(255) | NOT NULL, UNIQUE | 탈퇴 시 `deleted_{id}_{timestamp}@withdrawn.local` 형태로 변형되어 원본 이메일 재사용 가능(FR-014) |
| password_hash | VARCHAR(255) | NOT NULL | BCrypt 해시 (평문 저장 금지) |
| nickname | VARCHAR(50) | NOT NULL | FR-012로 수정 가능 |
| profile_image_url | VARCHAR(500) | NULL | FR-012로 수정 가능 |
| win_count | INT | NOT NULL DEFAULT 0 | 게임 결과 저장 시 갱신(FR-027), 랭킹 산정 기준(FR-030) |
| loss_count | INT | NOT NULL DEFAULT 0 | 랭킹 동점자 2차 정렬 기준(FR-032) |
| deleted_at | DATETIME | NULL | NULL=활성, NOT NULL=탈퇴 시각(FR-013). 자식 테이블 FK는 전부 `ON DELETE RESTRICT`로 하드 삭제 자체를 차단 |
| created_at / updated_at | DATETIME | NOT NULL | 표준 타임스탬프 |

**검증 규칙**: 이메일 형식/중복(FR-006), 닉네임 길이(≤50), 비밀번호는 평문으로 절대 응답에 노출하지 않음.

**상태 전이**: `활성(deleted_at = NULL)` → `탈퇴(deleted_at = 탈퇴 시각)` (단방향, 복구 없음 — 동일 이메일 재가입 시 새 row 생성).

## RefreshToken (`refresh_tokens`)

로그아웃/탈퇴 시 즉시 무효화가 가능하도록 두는 DB 화이트리스트. Access Token(JWT)은 이 테이블로 제어되지 않고 자체 만료시간까지만 유효.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| user_id | BIGINT (FK → users.id) | NOT NULL, ON DELETE RESTRICT | |
| token | VARCHAR(500) | NOT NULL, UNIQUE | 원문이 아닌 해시값 저장 권장 |
| expires_at | DATETIME | NOT NULL | |
| revoked_at | DATETIME | NULL | 로그아웃(FR-009)/탈퇴(FR-013) 시 갱신 |
| created_at | DATETIME | NOT NULL | 로그인 시 INSERT(FR-007) |

**검증 규칙**: 재발급(`/auth/refresh`) 시 `revoked_at IS NULL AND expires_at > now()`(FR-008).

**상태 전이**: `발급(로그인)` → `무효화(로그아웃 또는 탈퇴)`. 무효화된 토큰은 재사용 불가.

## Sign (`signs`)

카테고리별 학습 콘텐츠(자음/모음/숫자/단어) 마스터 데이터. 1차 범위에서는 조회만 제공(FR-015) — 등록/수정 API는 없음(운영 데이터는 시드/마이그레이션으로 관리).

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| category | ENUM('CONSONANT','VOWEL','NUMBER','WORD') | NOT NULL | |
| label | VARCHAR(50) | NOT NULL | |
| reference_media_url | VARCHAR(500) | NULL | |
| tip | VARCHAR(500) | NULL | |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE | 비활성 콘텐츠는 목록에서 제외(FR-015) |
| created_at | DATETIME | NOT NULL | |

## WrongAnswerLog (`wrong_answer_logs`)

오답 발생 로그. 비율 계산 없이 카테고리별 최근 5건을 그대로 노출(FR-016, FR-017).

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| user_id | BIGINT (FK → users.id) | NOT NULL, ON DELETE RESTRICT | |
| sign_id | BIGINT (FK → signs.id) | NOT NULL, ON DELETE RESTRICT | |
| wrong_at | DATETIME | NOT NULL | 조회 시 `ORDER BY wrong_at DESC LIMIT 5` |

**검증 규칙**: 존재하지 않는 `sign_id`로 신고 시 거부(Edge Case).

## TestResult (`test_results`) — *(신규, 갭 보완)*

contracts/learning-api.yaml의 `POST /test-results`(FR-018)를 구현하는 과정에서 대응하는 테이블이 이 문서에 정의되어 있지 않음을 발견해 추가했다. 문제별 상세 로그는 남기지 않고 카테고리/총 문제 수/정답 수만 저장하는 최소 형태다. 정답 수 기반 펫 경험치 반영은 Out of Scope이므로 이 테이블은 그 외 용도로 사용하지 않는다.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| user_id | BIGINT (FK → users.id) | NOT NULL, ON DELETE RESTRICT | |
| category | ENUM('CONSONANT','VOWEL','NUMBER','WORD') | NOT NULL | |
| total_count | INT | NOT NULL | |
| correct_count | INT | NOT NULL | |
| created_at | DATETIME | NOT NULL | |

## GameRoom (`game_rooms`)

1:1 대전 매칭 전용, 임시 리소스. **`updated_at` 컬럼을 새로 추가**해 CLOSED 전환 시각 및 좀비 방 판별 기준(후속 WebSocket 단계에서 사용)으로 재사용한다 — 별도 `closed_at` 컬럼은 두지 않는다(연구 결정 사항 3번 참고).

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| room_code | VARCHAR(20) | NOT NULL, UNIQUE | 짧은 랜덤 코드(research.md #5) |
| host_user_id | BIGINT (FK → users.id) | NOT NULL, ON DELETE RESTRICT | 방장. 방장 나가면 위임(FR-022)으로 값 갱신 |
| **guest_user_id** | **BIGINT (FK → users.id)** | **NULL, ON DELETE RESTRICT** | **(신규)** 두 번째 참가자. 입장(FR-020) 시 설정, 나가면 NULL로 복귀. 1:1 고정 방이라 host/guest 두 역할만 존재 — 이전 초안에는 이 컬럼이 없어 "두 번째 참가자가 누구인지" 자체를 서버가 알 방법이 없었음(게임 결과 스키마 논의에서 발견) |
| host_ready | BOOLEAN | NOT NULL DEFAULT FALSE | **(신규)** 방장 준비 상태(FR-025). REST 전용 1차 구조는 상태를 메모리가 아닌 DB에 영속해야 하므로 컬럼으로 관리 |
| guest_ready | BOOLEAN | NOT NULL DEFAULT FALSE | **(신규)** 참가자 준비 상태(FR-025). 입장/재입장 시 FALSE로 초기화 |
| status | ENUM('WAITING','IN_PROGRESS','CLOSED') | NOT NULL DEFAULT 'WAITING' | |
| created_at | DATETIME | NOT NULL | |
| **updated_at** | **DATETIME** | **NOT NULL, ON UPDATE CURRENT_TIMESTAMP** | **(신규)** 참가/퇴장/준비/시작/결과/CLOSED 전환 등 상태 관련 변경마다 갱신. FR-024(5분 정리 스케줄러)와 향후 좀비 방 판별의 공통 기준 |

**검증 규칙**: 정원 2명 초과(`guest_user_id`가 이미 채워진 방) 입장 거부(FR-020), IN_PROGRESS 방 입장 거부(FR-020). 시작 요청(FR-026)은 `host_ready = TRUE AND guest_ready = TRUE`일 때만 허용.

**상태 전이**: `WAITING` → (양쪽 준비 완료 + 시작 요청) → `IN_PROGRESS` → (참가자 소진 **또는** IN_PROGRESS 중 나가기로 인한 무효화 **또는** 결과 보고 성공, FR-023/FR-027) → `CLOSED` → (5분 경과, FR-024) → 삭제.

**호스트 위임 시 참고**: **WAITING** 상태에서 방장이 나가고 guest만 남으면(FR-022) `host_user_id ← guest_user_id`, `guest_user_id ← NULL`, `host_ready ← guest_ready`, `guest_ready ← FALSE`로 갱신해 다음 참가자를 받을 수 있는 상태로 되돌린다. **IN_PROGRESS** 상태에서는 누가 나가든 위임하지 않고 즉시 `CLOSED`로 전환한다(FR-021/FR-023) — 상대가 없는 진행 중 매치를 이어갈 수 없으므로 위임이 의미가 없다. 이 경우 `game_sessions` row는 생성하지 않는다(결과 미저장, 무효 처리).

## GameSession (`game_sessions`)

1:1 매치 결과 요약. `game_rooms`와 완전히 독립적으로 영구 보존(FR-029) — 방이 삭제돼도 영향 없음.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| player1_id / player2_id | BIGINT (FK → users.id) | NOT NULL, ON DELETE RESTRICT | |
| player1_score / player2_score | INT | NOT NULL DEFAULT 0 | |
| winner_id | BIGINT (FK → users.id) | NULL | **서버가 계산**(요청으로 직접 받지 않음). `player1_score`와 `player2_score` 비교 결과로 결정, 동점이면 NULL(무승부) |
| started_at / ended_at | DATETIME | started_at NOT NULL | |

**검증 규칙**: `game_sessions`는 `game_rooms`를 참조하지 않으므로(완전 독립 설계), "이미 보고된 결과"와 "무효화된 매치"를 사후에 구분할 방법이 없다. 따라서 `reportResult`는 **`game_rooms.status == IN_PROGRESS`일 때만 처리를 허용**하고, 그 외(이미 결과 보고로 CLOSED됐든, FR-023의 나가기 무효화로 CLOSED됐든)는 사유를 구분하지 않고 동일하게 거부한다(409, `contracts/game-rooms-api.yaml` 참고) — 이것으로 FR-028의 "재반영 금지"를 만족한다(재반영이 아니라 항상 거부이므로 별도의 중복 감지용 유니크 제약은 불필요).

**player1/player2 ↔ host/guest 매핑 규칙**: `/game-rooms/{roomId}/results` 요청은 위치 기반(player1/player2)이 아니라 역할 기반(`hostScore`/`guestScore`)으로 받는다(게임 결과 API 리뷰에서 확정 — 클라이언트가 순서를 실수로 바꿔 보내면 승패가 영구적으로 뒤바뀌는 문제를 예방). 저장 시 `game_rooms.host_user_id → player1_id`, `game_rooms.guest_user_id → player2_id`로 고정 매핑하고, `winner_id`는 서버가 두 점수를 비교해 계산한다.

## Attendance (`attendance`) — *엔티티만 정의, API/로직 없음 (FR-035)*

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| user_id | BIGINT (FK → users.id) | NOT NULL, ON DELETE RESTRICT | |
| attendance_date | DATE | NOT NULL | |
| streak_count | INT | NOT NULL DEFAULT 1 | |
| created_at | DATETIME | NOT NULL | |
| | | UNIQUE(user_id, attendance_date) | |

## UserPet (`user_pets`) — *엔티티만 정의, API/로직 없음 (FR-034)*

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BIGINT (PK) | | |
| user_id | BIGINT (FK → users.id) | NOT NULL, UNIQUE, ON DELETE RESTRICT | 1인 1펫 |
| name | VARCHAR(50) | NULL | |
| level | INT | NOT NULL DEFAULT 1 | |
| exp | INT | NOT NULL DEFAULT 0 | |
| created_at / updated_at | DATETIME | NOT NULL | |

**1차 범위 메모**: 회원가입 시 `user_pets` row를 함께 생성하는지 여부는 spec.md FR-005/FR-034에 명시된 API 범위 밖이므로, 이번 구현에서는 **테이블/엔티티 클래스만 존재**하면 충분하다(row 생성 여부는 후속 기능에서 결정).

## 엔티티 관계 요약

```text
User (1) ── (N) RefreshToken
User (1) ── (N) WrongAnswerLog ── (N) : 1 Sign
User (1) ── (0..1) UserPet
User (1) ── (N) Attendance
User (1) ── (N) GameRoom [host_user_id]
User (1) ── (N) GameSession [player1_id / player2_id / winner_id]  (game_rooms와 독립)
```
