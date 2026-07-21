# Quickstart: 백엔드 CRUD API 1차 구축 검증

이 문서는 구현이 끝난 뒤 각 User Story가 실제로 동작하는지 수동/스크립트로 검증하기 위한 가이드다. 요청/응답 상세 필드는 [contracts/](./contracts/)를, 엔티티 구조는 [data-model.md](./data-model.md)를 참고한다.

## 0. 사전 준비

1. Java 17, MySQL(로컬 또는 컨테이너) 준비.
2. `backend/suhwa/env.sample`을 참고해 `.env` 또는 환경변수 설정(`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`).
3. `backend/jira-crud-backlog.md`의 DDL로 스키마를 생성하되, [data-model.md](./data-model.md)의 `game_rooms.updated_at` 컬럼 추가 사항을 반영한다.
4. 애플리케이션 실행:

   ```bash
   cd backend/suhwa
   ./gradlew bootRun
   ```

5. 자동화 테스트 실행(구현 완료 판단 기준, plan.md Summary 참고):

   ```bash
   cd backend/suhwa
   ./gradlew test
   ```

## 1. User Story 1 — API 문서화가 가장 먼저 준비되어 있는지 확인

1. 브라우저에서 Swagger UI 접속: `http://localhost:8080/swagger-ui/index.html` (springdoc 기본 경로, 실제 경로는 `OpenApiConfig` 설정에 따름).
2. 우측 상단 **Authorize** 버튼으로 로그인 후 발급받은 Access Token을 입력 → 인증이 필요한 API를 문서 화면에서 바로 시험 호출할 수 있는지 확인(FR-003).
3. Auth / Users / Learning / GameRooms / Ranking 태그로 그룹화되어 있는지 확인(FR-004).
4. 새 도메인 API를 하나 추가 배포했을 때, 재배포 후 문서에 별도 수작업 없이 반영되는지 확인(FR-002).

## 2. User Story 2 — 회원가입 → 로그인 → 프로필 → 탈퇴

[contracts/auth-api.yaml](./contracts/auth-api.yaml), [contracts/users-api.yaml](./contracts/users-api.yaml) 참고.

```bash
# 회원가입
curl -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","nickname":"tester"}'

# 로그인 (accessToken/refreshToken 응답에서 확보)
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 프로필 조회/수정 (accessToken 필요)
curl http://localhost:8080/users/me -H "Authorization: Bearer $ACCESS_TOKEN"
curl -X PATCH http://localhost:8080/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"nickname":"newnick"}'

# 로그아웃 후 refreshToken 재사용 시도 → 401 확인
curl -X POST http://localhost:8080/auth/logout -H "Authorization: Bearer $ACCESS_TOKEN"
curl -X POST http://localhost:8080/auth/refresh -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"   # 401 기대

# 탈퇴 후 재로그인 시도 → 401 확인
curl -X DELETE http://localhost:8080/users/me -H "Authorization: Bearer $ACCESS_TOKEN"
curl -X POST http://localhost:8080/auth/login -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'   # 401 기대

# 탈퇴 후 동일 이메일 재가입 → 201 확인
curl -X POST http://localhost:8080/auth/signup -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password456","nickname":"tester2"}'
```

기대 결과: spec.md User Story 2의 Acceptance Scenario 1~8 전부 통과.

## 3. User Story 3 — 학습 콘텐츠 조회 → 오답 신고 → 오답노트 확인

[contracts/learning-api.yaml](./contracts/learning-api.yaml) 참고. 사전 조건: `signs` 테이블에 카테고리별 시드 데이터 존재.

```bash
curl "http://localhost:8080/signs?category=CONSONANT" -H "Authorization: Bearer $ACCESS_TOKEN"

curl -X POST http://localhost:8080/wrong-answers -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{"signId":1}'

curl "http://localhost:8080/wrong-answers?category=CONSONANT" -H "Authorization: Bearer $ACCESS_TOKEN"
# → 방금 신고한 오답이 최신순 목록에 포함되는지 확인

curl -X POST http://localhost:8080/test-results -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{"category":"CONSONANT","totalCount":10,"correctCount":7}'
```

## 4. User Story 4 — 게임방 생성 → 입장 → 준비 → 시작 → 결과 저장

[contracts/game-rooms-api.yaml](./contracts/game-rooms-api.yaml) 참고. 사용자 A(방장), 사용자 B(참가자) 두 계정 필요.

```bash
# A: 방 생성
curl -X POST http://localhost:8080/game-rooms -H "Authorization: Bearer $TOKEN_A"
# → roomCode 확보

# B: 코드로 입장
curl -X POST http://localhost:8080/game-rooms/join -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" -d "{\"roomCode\":\"$ROOM_CODE\"}"

# A, B 각각 준비 완료
curl -X POST http://localhost:8080/game-rooms/$ROOM_ID/ready -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d '{"isReady":true}'
curl -X POST http://localhost:8080/game-rooms/$ROOM_ID/ready -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" -d '{"isReady":true}'

# A: 게임 시작
curl -X POST http://localhost:8080/game-rooms/$ROOM_ID/start -H "Authorization: Bearer $TOKEN_A"
# → status: IN_PROGRESS 확인

# 결과 보고 — hostScore/guestScore는 역할 기준(A=host, B=guest), winner는 서버가 점수 비교로 계산
# 동일 요청 2회 전송 → 두 번째는 반영되지 않아야 함(FR-028)
curl -X POST http://localhost:8080/game-rooms/$ROOM_ID/results -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"hostScore":10,"guestScore":7}'
curl -X POST http://localhost:8080/game-rooms/$ROOM_ID/results -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"hostScore":10,"guestScore":7}'
```

기대 결과: 응답의 `winnerUserId`가 A(host)의 userId와 일치(점수가 더 높으므로), 두 참가자의 `win_count`/`loss_count`가 정확히 1회만 반영, 방 상태가 CLOSED로 전환. CLOSED 전환 5분 후 방이 스케줄러에 의해 삭제되어도 `game_sessions` 기록과 `/rankings` 결과에는 영향 없음(FR-024, FR-029) — 별도 지연 검증 필요.

## 5. User Story 5 — 랭킹 조회

[contracts/ranking-api.yaml](./contracts/ranking-api.yaml) 참고. User Story 4를 여러 계정 조합으로 반복해 승/패 데이터를 쌓은 뒤 확인.

```bash
curl http://localhost:8080/rankings -H "Authorization: Bearer $ACCESS_TOKEN"
```

기대 결과: 승수 내림차순 상위 5명, 동점자는 패 수 적은 순, 탈퇴 계정 제외, 응답에 본인 순위 포함.

## 6. 회귀 확인 — 펫/출석 엔티티 존재 여부(API 없음)

`user_pets`, `attendance` 테이블/엔티티 클래스가 존재하는지(JPA 컨텍스트 로드 시 매핑 오류 없는지)만 확인한다. 이 두 도메인에 대한 REST 엔드포인트나 curl 시나리오는 1차 범위에 없다(FR-034, FR-035).
