# Quickstart / Validation Guide: 출석 및 펫 성장

## 사전 준비

```powershell
cd backend/suhwa
./gradlew.bat test
```

- 로컬 실행에는 MySQL과 `JWT_SECRET` 등 기존 환경 변수가 필요하다.
- 운영 스키마 변경은 V8 Flyway 마이그레이션으로 적용한다.
- API 요청 경로의 `/api`는 nginx 프록시 prefix이며 Spring Controller 매핑에는 포함하지 않는다.
- 신뢰 게임 서버는 기존 사용자 Bearer 토큰을 전달하며, 배포 계층은 `/solo-results`의 직접 외부 호출을 차단한다고 가정한다.

## 자동 검증

```powershell
cd backend/suhwa
./gradlew.bat test
./gradlew.bat benchmark
```

- 일반 테스트: 정책 경계, 서비스 트랜잭션, Controller/Security, OpenAPI, ArchUnit 회귀 검증
- benchmark: Docker 사용 가능 환경에서 MySQL V1→V8 및 V7→V8 마이그레이션과 랭킹 집계 검증

## 핵심 시나리오

### 가입과 펫

1. 새 사용자로 가입한다.
2. `GET /growth/pet`을 호출한다.
3. `level=1`, `currentExp=0`, `evolutionStage=STAGE_1`인지 확인한다.
4. 다른 사용자 ID를 요청에 넣어 조회할 수 있는 API가 없는지 확인한다.

### 출석

1. `POST /growth/attendance`를 호출해 XP 3과 streak 1을 확인한다.
2. 같은 날 다시 호출해 Attendance 행과 XP가 증가하지 않는지 확인한다.
3. 다음 KST 날짜에 호출해 streak가 증가하는지 확인한다.
4. 하루를 건너뛴 뒤 호출해 streak가 1로 초기화되는지 확인한다.
5. 동일 사용자 요청을 동시에 보내 출석과 XP가 각각 한 번만 반영되는지 확인한다.

### 연습과 테스트

1. OpenAPI와 실제 라우팅에 `/practice-sessions` 시작·완료 경로가 없는지 확인한다.
2. 연습을 수행해도 `user_pets.exp`와 백엔드 세션 테이블이 변하지 않는지 확인한다.
3. 테스트를 4/5로 완료해 XP 7을 확인하고 79/100에서는 XP가 없는지 확인한다.
4. 완료된 테스트에 같은 결과를 다시 보내면 XP가 추가되지 않는지 확인한다.
5. 완료된 테스트에 다른 결과를 다시 보내면 409인지 확인한다.

### 솔로 결과와 보상

1. 신뢰 게임 서버 경로로 `POST /solo-results`에 `{ "score": 60 }`을 제출해 `TETRIS_SOLO` 결과와 XP 15를 확인한다.
2. 별도 사용자로 61, 90, 91, 120, 121을 제출해 각각 XP 10, 10, 5, 5, 0인지 확인한다.
3. 각 요청에서 `game_results` 저장과 `user_pets.exp` 갱신이 함께 커밋되는지 확인한다.
4. 결과 저장 또는 펫 갱신을 강제로 실패시켰을 때 둘 다 롤백되는지 확인한다.
5. OpenAPI와 실제 라우팅에 `/game/solo/sessions` 시작·완료·결과 조회 경로가 없는지 확인한다.
6. 요청·응답·엔티티에 `duration_ms`, `playDurationMs`, `soloSessionId`가 없는지 확인한다.

### 솔로 랭킹

1. 사용자 A에 120·75, B에 80, C에 75의 솔로 `score`를 저장한다.
2. 랭킹에서 A와 C가 75초 공동 1위, B가 80초 3위인지 확인한다.
3. `me`의 순위도 Top 목록과 같은 공동 순위 규칙을 사용하는지 확인한다.
4. 한 사용자의 더 느린 기록이 개인 최소 기록과 순위를 바꾸지 않는지 확인한다.
5. 대전 결과와 탈퇴 사용자가 솔로 랭킹에 섞이지 않는지 확인한다.
6. 랭킹 응답에 `rank`, `userId`, `nickname`, `score`만 있고 `playDurationMs`가 없는지 확인한다.

### 1대1

1. 두 사용자가 게임방을 정상 시작하고 승자를 포함한 결과를 보고한다.
2. 승자 `game_results.score=1`, 패자 `score=0`, 펫 XP 10·3을 확인한다.
3. 같은 방 결과를 다시 보고해 추가 결과와 XP가 없는지 확인한다.
4. 무승부·이탈·무효 종료에는 XP가 없는지 확인한다.

### 레벨과 진화

1. 누적 XP가 20이 되는 순간 레벨이 1 오르고 잔여 XP가 이월되는지 확인한다.
2. 한 번의 큰 보상으로 여러 레벨 기준을 넘을 때 모든 레벨업이 적용되는지 확인한다.
3. 레벨 5에서 `STAGE_2`, 레벨 10에서 `STAGE_3`, 레벨 15에서 `STAGE_4`, 레벨 20에서 `STAGE_5`인지 확인한다.
4. 기존 10레벨 펫의 레벨과 XP가 유지되고, XP 20을 받으면 11레벨로 성장하는지 확인한다.
5. 레벨 20 도달 시 잔여 XP가 0이고 이후 활동에도 상태가 바뀌지 않는지 확인한다.

### V8 마이그레이션

1. 새 MySQL DB에 V1부터 V8까지 적용한다.
2. 기존 V7 DB에 다음 표본을 만든다.
   - `TETRIS_SOLO`, `play_duration_ms=60000`
   - `TETRIS_SOLO`, `play_duration_ms=60001`
   - `TETRIS_SOLO`, `play_duration_ms=NULL`, 기존 `score=90`
3. V8 적용 후 `score`가 각각 60, 61, 90인지 확인한다.
4. 솔로 `game_results` 행 수와 사용자 연결이 유지되는지 확인한다.
5. 다음 테이블이 모두 없는지 확인한다.
   - `practice_sessions`
   - `solo_sessions`
   - `solo_session_symbols`
   - `solo_symbol_statistics`
6. `game_results.solo_session_id`, `game_results.play_duration_ms`와 관련 FK·체크·인덱스가 없는지 확인한다.
7. `test_sessions` 결과 필드와 `user_pets`의 20레벨 제약은 유지되는지 확인한다.

## 완료 판정

- `./gradlew.bat test` 전체 통과
- Docker 가능 환경에서 `./gradlew.bat benchmark` 통과
- V1→V8 및 V7→V8 MySQL 마이그레이션 검증 통과
- 솔로 점수 경계 60/61/90/91/120/121의 XP 결과 일치
- 솔로 공동 순위와 대전 랭킹 회귀 검증 통과
- 삭제 대상 API·Swagger 태그·Java 타입·DB 테이블·컬럼 참조 0
- 활동 결과와 펫 XP의 부분 커밋 0
- [성장 API 계약](./contracts/growth-api.yaml)과 [활동·랭킹 계약](./contracts/activity-reward-api-delta.yaml)이 구현 및 springdoc 출력과 일치
