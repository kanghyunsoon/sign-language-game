# 백엔드 에픽 - CRUD 스토리/서브태스크 목록

Jira 프로젝트: `S15P11A405` (https://ssafy.atlassian.net)
기준: 백엔드(Backend-XX) 에픽 하위 이슈 중 CRUD(Create/Read/Update/Delete) 작업을 수행하는 스토리와 서브태스크만 정리.
**WebSocket 연결 / SSE 연결(구독, 브로드캐스트, 핸드셰이크 인증 등) 관련 이슈는 제외했습니다.**

완전히 제외된 항목:
- `Backend-04 WebRTC 시그널링 중계` 에픽 전체 (WebSocket 기반 시그널링 릴레이)
- `GAME-02-02` (SSE 기반 게임방 목록 실시간 조회) 스토리 전체
- `GAME-02-06` (SSE/WebSocket 연결 인증) 스토리 전체
- `GAME-02-07` (재접속 세션 처리, 커넥션 관리 성격) 스토리 전체
- `Backend-07 문서화` 에픽 전체 (CRUD 구현이 아닌 문서 작업)
- 각 스토리 내 WebSocket/SSE 브로드캐스트·핸드셰이크 관련 서브태스크 (해당 스토리 섹션에 "제외" 표기)

---

## Backend-00 회원 관리 및 인증 (S15P11A405-377)

### USER-01-01. 사용자는 이메일로 회원가입할 수 있다 (S15P11A405-378)
- S15P11A405-379 회원가입 API 구현
- S15P11A405-380 이메일 중복 검증 로직
- S15P11A405-381 비밀번호 해싱 처리 (BCrypt)
- S15P11A405-382 가입 트랜잭션 내 user_pets 기본 row 생성

### USER-01-02. 사용자는 로그인/로그아웃 할 수 있다 (S15P11A405-383)
- S15P11A405-386 로그인 API 구현 (JWT 발급)
- S15P11A405-387 토큰 재발급(refresh) API
- S15P11A405-388 로그아웃 처리 (토큰 무효화)
- S15P11A405-389 탈퇴 계정 로그인 차단 검증
- S15P11A405-490 로그인 성공 시 refresh 토큰을 refresh_tokens에 저장
- S15P11A405-491 /auth/refresh 요청 시 revoked_at IS NULL AND expires_at > now() 검사
- S15P11A405-492 로그아웃 시 해당 refresh 토큰의 revoked_at 갱신

### USER-01-03. 사용자는 회원 탈퇴(Soft Delete)할 수 있다 (S15P11A405-384)
- S15P11A405-390 탈퇴 API 구현 (deleted_at 갱신)
- S15P11A405-391 탈퇴 시 이메일 변형 로직
- S15P11A405-392 탈퇴 시 토큰/세션 무효화
- S15P11A405-393 탈퇴 후에도 전적·랭킹 데이터 보존 검증
- S15P11A405-493 탈퇴 시 해당 유저의 모든 refresh_tokens.revoked_at 일괄 갱신

### USER-01-04. 사용자는 프로필을 조회/수정할 수 있다 (S15P11A405-385)
- S15P11A405-394 프로필 조회 API
- S15P11A405-395 프로필 수정 API

---

## Backend-01 학습 콘텐츠(지문자/단어) 연습 (S15P11A405-396)

### LEARN-01-01. 사용자는 카테고리별 학습 콘텐츠 목록을 조회할 수 있다 (S15P11A405-397)
- S15P11A405-399 카테고리별 콘텐츠 조회 API
- S15P11A405-400 is_active 필터링 처리

---

## Backend-02 테스트 및 오답노트 (S15P11A405-398)

### TEST-01-01. 시스템은 오답 신고를 받아 로그로 기록한다 (S15P11A405-401)
- S15P11A405-404 오답 신고 API 구현 (sign_id 수신, wrong_answer_logs INSERT)

### TEST-01-02. 사용자는 카테고리별 최근 오답 노트를 조회할 수 있다 (S15P11A405-402)
- S15P11A405-405 카테고리별 최근 5개 오답노트 조회 API
- S15P11A405-406 wrong_answer_logs-signs JOIN 및 응답 DTO 구성

### TEST-01-03. 사용자는 테스트 종료 시 결과를 보고해 펫 경험치에 반영할 수 있다 (S15P11A405-403)
- S15P11A405-407 테스트 완료 보고 API 구현 (총 문제 수/정답 수 수신)
- S15P11A405-408 정답 수 기반 exp 증가 로직 (GROWTH-01-02와 연동)
- S15P11A405-409 exp 증가 배율/공식 정책값 분리

---

## Backend-03 게임방 생성 및 매칭 (S15P11A405-410)

### GAME-02-01. 사용자는 게임방을 생성하고 코드/링크로 초대할 수 있다 (S15P11A405-411)
- S15P11A405-418 게임방 생성 API (room_code 발급)
- S15P11A405-419 코드/링크 기반 입장 API
- S15P11A405-420 ConcurrentHashMap 기반 실시간 인원·준비 상태 관리
- S15P11A405-421 입장 응답에 인원수/정원/방 상태 포함
- S15P11A405-422 정원 초과·진행중 방 입장 거부 처리
- ~~S15P11A405-423 방 생성/입장 시 로비 SSE 구독자에게 변경 사항 브로드캐스트~~ (SSE 제외)

### GAME-02-03. 사용자는 방을 나갈 수 있고, 방장이 나가면 방장이 위임된다 (S15P11A405-413)
- S15P11A405-429 POST /game-rooms/{roomId}/leave API 구현 (명시적 퇴장, 즉시 처리)
- S15P11A405-431 유예 시간 내 재접속 시 퇴장 취소 처리
- S15P11A405-432 host_user_id 위임 처리 로직
- S15P11A405-433 잔여 인원 0명일 때 CLOSED 전환 처리
- ~~S15P11A405-430 WebSocket 연결 해제 감지 + 유예 시간 타이머 구현~~ (WebSocket 제외)
- ~~S15P11A405-434 방장 위임/인원 변경/CLOSED 전환 시 로비 SSE 브로드캐스트~~ (SSE 제외)

### GAME-02-04. 종료된 게임방은 주기적으로 자동 삭제된다 (S15P11A405-414)
- S15P11A405-435 CLOSED 방 정리 스케줄러 구현
- S15P11A405-436 삭제 주기·보관 기간 설정값 분리
- S15P11A405-437 삭제 후 game_sessions 데이터 영향 없음 검증
- ~~S15P11A405-438 CLOSED 방은 SSE 목록에서 이미 빠져있어 삭제 시점 별도 브로드캐스트 불필요~~ (SSE 제외)

### GAME-02-05. 양쪽 참가자가 준비 완료한 뒤 시작 버튼을 눌러야 게임이 시작된다 (S15P11A405-415)
- S15P11A405-439 ConcurrentHashMap 기반 참가자별 ready 상태 관리
- S15P11A405-440 게임 시작 요청 API (ready 게이트 조건 검증)
- S15P11A405-441 시작 성공 시 game_rooms.status → IN_PROGRESS 전환
- ~~S15P11A405-442 WebSocket으로 방 내 게임 시작 브로드캐스트~~ (WebSocket 제외)
- ~~S15P11A405-444 게임 시작(IN_PROGRESS 전환) 시 로비 SSE 목록에서 해당 방 제거 브로드캐스트~~ (SSE 제외)

### GAME-02-08. 사용자는 게임 결과가 안전하게 저장된 것을 신뢰할 수 있다 (S15P11A405-494)
- S15P11A405-495 POST /game-rooms/{roomId}/results API 구현
- S15P11A405-496 요청자 방 참가자 여부 검증 (인증/인가)
- S15P11A405-497 game_sessions 저장 + users.win_count/loss_count 갱신 (트랜잭션 처리)
- S15P11A405-498 중복 신고 방지를 위한 멱등 처리
- S15P11A405-499 GameWonEvent 발행 (ApplicationEventPublisher)
- S15P11A405-500 처리 완료 후 game_rooms.status → CLOSED 전환

---

## Backend-05 랭킹 (S15P11A405-452)

### RANK-01-01. 사용자는 승수 기준 Top 5 랭킹과 내 순위를 조회할 수 있다 (S15P11A405-456)
- S15P11A405-467 승수 기준 Top 5 조회 API
- S15P11A405-468 본인 순위 계산 로직 (전체 유저 중 순위 산출)
- S15P11A405-469 동점자 2차 정렬 기준 정의 및 적용
- S15P11A405-470 탈퇴 유저 제외 필터링

---

## Backend-07 문서화 (S15P11A405-454)

### DOC-01-03. 백엔드 API 문서(Swagger)를 작성한다 (S15P11A405-462)
- S15P11A405-485 DOC-01-03-T01 springdoc-openapi(또는 동급 라이브러리) 설정
- S15P11A405-486 DOC-01-03-T02 API별 요청/응답 DTO에 문서 어노테이션 추가
- S15P11A405-487 DOC-01-03-T03 인증(JWT) 테스트를 위한 Swagger Authorize 설정
- S15P11A405-488 DOC-01-03-T04 전체 API 그룹핑(Tag) 정리 (회원/학습/테스트/게임/랭킹/성장요소)
- S15P11A405-489 DOC-01-03-T05 API 구현 진행에 맞춰 지속적으로 문서 최신화

> CRUD 구현이 아닌 문서화 작업이라 상단 안내(7번 항목)에서는 제외 대상으로 표기했으나, 참고용으로 별도 추가.

# API 명세 초안 (백로그 기준)

> `backend_backlog.md` 기준으로 뽑은 API 목록입니다. 실제 Swagger 작성(`DOC-01-03`) 전
큰 그림을 맞추기 위한 초안이라, 요청/응답 필드 상세는 나중에 DTO 설계하면서 채우면 됩니다.
게임의 실시간 진행 로직(문제 배포/판정/점수 계산)은 게임 파트 소관이라 제외했지만,
**최종 결과 수신(`/results`)과 저장은 이 백엔드가 담당**합니다.
> 

---

## 1. 회원/인증 (USER-01)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | 회원가입 (가입과 동시에 `user_pets` 기본 row 생성) | 불필요 | USER-01-01 |
| POST | `/auth/login` | 로그인. access 토큰 발급 + refresh 토큰을 `refresh_tokens`에 저장 | 불필요 | USER-01-02 |
| POST | `/auth/refresh` | 토큰 재발급. `refresh_tokens`에서 `revoked_at IS NULL AND expires_at > now()` 검증 후 재발급 | refresh 토큰 | USER-01-02 |
| POST | `/auth/logout` | 로그아웃. 해당 refresh 토큰의 `revoked_at` 갱신 (access 토큰은 만료시간까지 유효할 수 있음) | 필요 | USER-01-02 |
| DELETE | `/users/me` | 회원 탈퇴 (Soft Delete, 이메일 변형 저장, 보유한 모든 refresh 토큰 일괄 `revoked_at` 갱신) | 필요 | USER-01-03 |
| GET | `/users/me` | 내 프로필 조회 (닉네임, 이미지, 승/패) | 필요 | USER-01-04 |
| PATCH | `/users/me` | 프로필 수정 (닉네임, 이미지) | 필요 | USER-01-04 |

> **참고**: Redis 없이 로그아웃/탈퇴 무효화를 구현하기 위해 `refresh_tokens`를 DB 화이트리스트로 사용합니다. access 토큰(JWT) 자체는 이 방식으로 즉시 막을 수 없고, 만료시간(예: 15분)까지는 유효할 수 있다는 제약사항이 있습니다.
> 

---

## 2. 학습 콘텐츠 (LEARN-01)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| GET | `/signs?category={CONSONANT|VOWEL|NUMBER|WORD}` | 카테고리별 학습 콘텐츠 목록 조회 (label, media_url, tip) | 필요 | LEARN-01-01 |

> 웹캠 인식/실시간 피드백은 프론트-AI 서버 직접 통신이라 백엔드 API 없음.
> 

---

## 3. 테스트 및 오답노트 (TEST-01)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| POST | `/wrong-answers` | 오답 신고 (`signId` 수신 → 로그 INSERT) | 필요 | TEST-01-01 |
| GET | `/wrong-answers?category={CONSONANT|VOWEL|NUMBER|WORD}` | 카테고리별 최근 5개 오답노트 조회 | 필요 | TEST-01-02 |
| POST | `/test-results` | 테스트 결과 등록 (총 문제 수 / 정답 수 → 펫 exp 반영) | 필요 | TEST-01-03 |

---

## 4. 게임방 매칭 (GAME-02)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| POST | `/game-rooms` | 게임방 생성 (`room_code` 발급) | 필요 | GAME-02-01 |
| POST | `/game-rooms/join` | 방 입장. Body로 `roomCode` 전달 (경로 변수 충돌 방지) — Body: `{ "roomCode": "ABC12" }` | 필요 | GAME-02-01 |
| GET | `/game-rooms/subscribe?token={JWT}` | 활성화된 방 목록 실시간 구독 (SSE) | 필요 (쿼리 토큰) | GAME-02-02, GAME-02-06 |
| POST | `/game-rooms/{roomId}/leave` | 방 퇴장 (명시적 클릭 시 즉시 처리; WS 끊김은 5~10초 유예 후 처리, 방장이면 위임, 마지막 인원이면 CLOSED) | 필요 | GAME-02-03 |
| POST | `/game-rooms/{roomId}/ready` | 준비 상태 토글 (RPC 스타일 액션 — 아래 각주 참고) | 필요 | GAME-02-05 |
| POST | `/game-rooms/{roomId}/start` | 게임 시작 요청 (양쪽 준비 완료 시에만 성공, 성공 시 게임 파트로 제어 이관) | 필요 | GAME-02-05 |
| WS | `/ws/game-rooms/{roomId}` | 방 내 실시간 상태 동기화 연결 (JWT + 방 소속 검증) | 필요 | GAME-02-06 |
| POST | `/game-rooms/{roomId}/results` | 게임 결과 등록. 게임 파트가 승자/최종 점수를 보고 → `game_sessions` 저장 + `users.win_count`/`loss_count` 갱신 + `GameWonEvent` 발행 (신뢰성 위해 REST로 확정, 아래 4번 참고) | 필요 (게임 파트 신뢰 경계) | GAME-02-08 |

> `GAME-02-04`(CLOSED 방 정리)는 스케줄러 내부 배치 작업이라 별도 API 없음.
> 
> 
> **경로 설계 노트**
> 
> - `/game-rooms/{roomCode}/join`처럼 식별자를 경로 변수로 받으면, 같은 위치의 다른 액션(`{roomId}/leave` 등)과 패턴이 겹칠 여지가 있고 `roomCode`가 문자열일 때 특히 구분이 애매해질 수 있음 → **입장은 Body로 `roomCode`를 받는 방식으로 변경**.
> - `/ready`, `/start`는 리소스 중심으로 보면 `PATCH /game-rooms/{roomId}/members/me` (Body: `{ "isReady": true }`) 같은 형태가 더 RESTful하지만, 게임 도메인 특성상 직관적인 RPC 스타일 액션도 흔히 허용됨. **팀 컨벤션에 따라 유지 or 변경 — 아직 미확정, 결정 필요.**
> 
> **보안 주의 — SSE 쿼리 파라미터 토큰 노출**`GET /game-rooms/subscribe?token={JWT}`는 `EventSource`가 커스텀 헤더를 지원하지 않아 선택한 방식인데, URL 쿼리 파라미터는 Nginx/ALB 등의 Access Log에 평문으로 남을 수 있음. API 명세 자체는 유지하되, 인프라 설정 시 아래 중 하나를 반드시 적용:
> 
> - Access Log 포맷에서 `token=` 이후 마스킹 처리, 또는
> - 이 구독 전용으로 유효시간이 아주 짧은(1회성) 토큰을 별도 발급

---

## 5. WebRTC 시그널링 (GAME-04)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| WS | `/ws/signal/{roomId}` | Offer/Answer/ICE Candidate 중계 (내용 가공 없이 relay) | 필요 (JWT + 방 소속 검증) | GAME-04-01 |
| GET | `/webrtc/ice-servers` | STUN/TURN(coturn) 접속 정보 조회 | 필요 | GAME-04-01 |

---

## 6. 랭킹 (RANK-01)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| GET | `/rankings` | 승수 기준 Top 5 + 본인 순위 조회 | 필요 | RANK-01-01 |

---

## 7. 출석 및 펫 (GROWTH-01)

| Method | Path | 설명 | 인증 | 관련 Story |
| --- | --- | --- | --- | --- |
| POST | `/attendance` | 출석체크 (연속 출석일 계산, 성공 시 펫 exp 증가) | 필요 | GROWTH-01-01 |
| GET | `/pets/me` | 내 펫 상태 조회 (이름, 레벨, exp) | 필요 | GROWTH-01-03 |

> 펫 exp 증가/레벨업 자체는 출석·테스트결과·게임승리(`GameWonEvent`) 이벤트에 의해
내부적으로 트리거되는 로직이라 별도의 공개 API는 없음 (`GROWTH-01-02`).
> 

---

## 요약: 총 엔드포인트 수

| 도메인 | REST | WS/SSE |
| --- | --- | --- |
| 회원/인증 | 7 | - |
| 학습 콘텐츠 | 1 | - |
| 테스트/오답노트 | 3 | - |
| 게임방 매칭 | 6 | 1 |
| WebRTC 시그널링 | 1 | 1 |
| 랭킹 | 1 | - |
| 출석/펫 | 2 | - |
| **합계** | **21** | **2** |

---

## 결정된 사항 (이전엔 미확정이었던 부분)

1. **게임 결과 진입점 & exp 연동**: **REST로 확정.** 게임 파트가 승패를 판정한 뒤 `POST /game-rooms/{roomId}/results`로 결과를 보고하면, 이 백엔드가 `game_sessions` 저장 + `users.win_count`/`loss_count` 갱신을 트랜잭션으로 처리한 뒤 `GameWonEvent`를 발행하고, 성장 모듈이 이를 구독해서 exp를 반영한다. WebSocket 대신 REST를 택한 이유는 **신뢰성** — 게임 결과는 유실되면 승패/랭킹/경험치가 전부 어긋나는 데이터라, 응답 코드로 저장 성공 여부를 확인하고 실패 시 재시도할 수 있는 REST가 더 적합하다고 판단했다. (결과 진입점만 REST, exp 반영 자체는 내부 이벤트로 결합도를 낮춘 하이브리드 방식.)
2. **오답 신고/오답노트 조회 인증**: 다른 REST API와 동일하게 **`Authorization: Bearer {JWT}`** 헤더 방식으로 확정. 예외 없음.
3. **방 나가기(`leave`)**: **REST + WebSocket 감지 둘 다** 사용하는 것으로 확정.
    - 명시적 "나가기" 버튼 → `POST /game-rooms/{roomId}/leave`로 즉시 처리
    - 새로고침/네트워크 끊김 등 비의도적 연결 종료 → WebSocket 연결 해제 감지 후 **5~10초 유예 시간**을 두고, 그 안에 재접속하면 취소 (`GAME-02-07`과 연동), 아니면 그때 실제 퇴장 처리
4. **`/ready`, `/start` 네이밍**: 리소스 지향(`PATCH .../members/me`) 대신 **RPC 스타일(`POST .../ready`, `POST .../start`) 유지로 확정**. `/start`는 게이트 검증+상태전환+브로드캐스트+이벤트 발행이 함께 일어나는 "명령"이라 리소스 갱신으로 표현하기 어렵고, 같은 그룹 액션끼리 네이밍 컨벤션을 통일하는 게 실익이 크다고 판단했다.

-- ============================================
-- 한컴수화연습 (HanCom Sign Language Practice)
-- Database Schema - v9
--   - 연습모드는 '틀림' 개념 없음 -> 로그 테이블 불필요
--   - 오답노트: 오답 비율 계산 없이, 오답 발생 시마다 로그 한 줄
--     INSERT (wrong_answer_logs) -> 카테고리별 최근 5개 이벤트를
--     그대로 조회해서 보여주는 방식으로 단순화
--   - 게임 상세 답안 로그/콤보 결과 저장 안 함, 세션 요약만 저장
--     (game_sessions: 승자 판정은 게임 파트가 하지만, 저장/win_count 갱신은
--     POST /game-rooms/{roomId}/results API를 통해 이 백엔드가 담당)
--   - 재화(포인트) 시스템 없음, 펫이 exp/level을 직접 보유
--   - 1인 1펫 확정 (user_id UNIQUE)
--   - users 참조 FK 전부 ON DELETE RESTRICT (Soft Delete 정책과
--     일관되게, 실수로라도 유저를 하드 딜리트하는 것을 DB 레벨에서 차단)
--   - game_sessions는 game_rooms를 참조하지 않음 (완전 독립).
--     방은 매칭 용도로만 쓰이고, CLOSED된 방은 스케줄러로
--     하드 삭제해도 매치 기록에는 영향 없음
--   - 방장 이탈 시 방을 닫지 않고 host_user_id 위임(앱 로직)
--   - Redis 없이 refresh 토큰 무효화를 구현하기 위해
--     refresh_tokens 테이블(DB 화이트리스트) 추가.
--     access 토큰은 즉시 무효화되지 않고 만료시간까지만 유효.
-- ============================================

DROP DATABASE IF EXISTS hancom_sign_practice;

CREATE DATABASE hancom_sign_practice
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci
    COMMENT '한컴수화연습 서비스 데이터베이스';

USE hancom_sign_practice;


-- ============================================
-- 1. users : 회원가입, 계정관리
-- ============================================
CREATE TABLE users (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    email               VARCHAR(255) NOT NULL UNIQUE,   -- 탈퇴(Soft Delete) 시 원본 이메일 재사용 가능하도록
                                                          -- 'deleted_{id}_{timestamp}@withdrawn.local' 등으로 변경 후 저장
    password_hash       VARCHAR(255) NOT NULL,
    nickname            VARCHAR(50)  NOT NULL,
    profile_image_url   VARCHAR(500),
    win_count           INT NOT NULL DEFAULT 0,
    loss_count          INT NOT NULL DEFAULT 0,
    deleted_at          DATETIME NULL DEFAULT NULL,   -- NULL: 활성, NOT NULL: 삭제(탈퇴) 시각 (Soft Delete)
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='회원 정보 (Soft Delete 적용: 실제 DELETE 대신 deleted_at 갱신. 자식 테이블 FK는 모두 ON DELETE RESTRICT로, 하드 딜리트 자체를 막는 안전장치)';


-- ============================================
-- 1-1. refresh_tokens : Refresh 토큰 화이트리스트
--    Redis 없이 로그아웃/탈퇴 시 토큰을 무효화하기 위한 테이블.
--    로그인 시 INSERT, 로그아웃/탈퇴 시 revoked_at 갱신.
--    /auth/refresh 요청마다 revoked_at IS NULL AND expires_at > now()
--    조건으로 유효성을 검사한다.
--    ※ access 토큰(JWT) 자체는 이 테이블로 막을 수 없고, 만료시간
--       (예: 15분)까지는 계속 유효할 수 있다 — 알려진 제약사항.
--    token 컬럼은 원문이 아닌 해시값 저장을 권장 (탈취 대비).
-- ============================================
CREATE TABLE refresh_tokens (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    token         VARCHAR(500) NOT NULL UNIQUE,
    expires_at    DATETIME NOT NULL,
    revoked_at    DATETIME NULL DEFAULT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_refresh_user (user_id),
    INDEX idx_refresh_valid (user_id, revoked_at, expires_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Refresh 토큰 화이트리스트 (로그아웃/탈퇴 시 revoked_at으로 무효화)';


-- ============================================
-- 2. signs : 키워드 모음 (자음/모음/숫자/단어 마스터 데이터)
--    단어(WORD)도 그 자체로 완결된 동작 -> 조합 매핑 없음
-- ============================================
CREATE TABLE signs (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    category              ENUM('CONSONANT','VOWEL','NUMBER','WORD') NOT NULL,
    label                 VARCHAR(50) NOT NULL,
    reference_media_url   VARCHAR(500),
    tip                   VARCHAR(500),
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_signs_category (category)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='지문자/단어 마스터 데이터';


-- ============================================
-- 3. wrong_answer_logs : 오답노트
--    "최근 5개 중 오답 비율"을 계산하지 않고, 오답 발생 시마다
--    그냥 한 줄씩 INSERT하는 단순 로그 테이블.
--    (프론트가 오답 발생 시에만 신고하므로, 정답 이벤트는 애초에
--     알 수 없음 -> 비율 계산을 포기하고 "카테고리별 최근 5개
--     오답 이벤트"를 그대로 보여주는 방식으로 단순화)
--
--    조회 로직: signs와 JOIN해서 category로 필터링 후
--               ORDER BY wrong_at DESC LIMIT 5
-- ============================================
CREATE TABLE wrong_answer_logs (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    sign_id       BIGINT NOT NULL,
    wrong_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wronglog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_wronglog_sign FOREIGN KEY (sign_id) REFERENCES signs(id) ON DELETE RESTRICT,

    INDEX idx_wronglog_user_time (user_id, wrong_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='오답 발생 로그 (카테고리별 최근 5개 조회용, 비율 계산 없음)';


-- ============================================
-- 4. game_rooms : 게임방 (1:1 전용, 매칭 용도로만 사용)
--    CLOSED 상태인 방은 스케줄러가 주기적으로 하드 삭제
--    (room_code 재사용 및 테이블 크기 관리 목적).
--    game_sessions는 이 테이블을 참조하지 않으므로 방을
--    삭제해도 매치 기록/랭킹 데이터에는 전혀 영향 없음.
--    방장(host_user_id)이 나가는 경우 방을 닫지 않고
--    남은 인원에게 host_user_id를 위임(UPDATE)하는 방식으로 처리.
-- ============================================
CREATE TABLE game_rooms (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_code       VARCHAR(20) NOT NULL UNIQUE,
    host_user_id    BIGINT NOT NULL,
    status          ENUM('WAITING','IN_PROGRESS','CLOSED') NOT NULL DEFAULT 'WAITING',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_room_host
        FOREIGN KEY (host_user_id) REFERENCES users(id)
        ON DELETE RESTRICT,

    INDEX idx_room_status (status)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='게임방 (활성화된 방 목록 조회용, 1:1 전용)';


-- ============================================
-- 5. game_sessions : 1:1 대전 매치 결과 (요약만 저장)
--    game_rooms와 완전히 독립적. 방은 매칭(WAITING -> IN_PROGRESS)
--    용도로만 쓰이고, 매치가 시작되는 시점에 이 테이블에
--    player1/player2 정보만으로 자기완결적인 row를 생성.
--    -> 매치 종료 후 방 정보가 사라져도 결과 조회/랭킹 집계에
--       전혀 영향 없음.
--    문제별 상세 답안/콤보 로그는 저장하지 않음.
--    콤보는 게임 진행 중 실시간 연출용으로만 쓰이고
--    종료 후 결과에는 남기지 않음 -> 최종 점수/승자만 기록
-- ============================================
CREATE TABLE game_sessions (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    player1_id          BIGINT NOT NULL,
    player2_id          BIGINT NOT NULL,
    player1_score       INT NOT NULL DEFAULT 0,
    player2_score       INT NOT NULL DEFAULT 0,
    winner_id           BIGINT NULL,
    started_at          DATETIME NOT NULL,
    ended_at            DATETIME,

    CONSTRAINT fk_session_player1
        FOREIGN KEY (player1_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_player2
        FOREIGN KEY (player2_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_session_winner
        FOREIGN KEY (winner_id) REFERENCES users(id)
        ON DELETE RESTRICT,

    INDEX idx_session_player1 (player1_id),
    INDEX idx_session_player2 (player2_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='1:1 대전 매치 결과 (요약, game_rooms와 독립)';


-- ============================================
-- 6. attendance : 출석체크
--    보상은 아래 user_pets.exp를 앱 로직에서 직접 증가시키는
--    방식으로 처리 (별도 재화/이력 테이블 없음)
-- ============================================
CREATE TABLE attendance (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id           BIGINT NOT NULL,
    attendance_date   DATE NOT NULL,
    streak_count      INT NOT NULL DEFAULT 1,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attendance_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT,

    UNIQUE KEY uq_attendance_user_date (user_id, attendance_date),
    INDEX idx_attendance_user (user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='출석체크';


-- ============================================
-- 7. user_pets : 사용자 펫 (1인 1펫 확정, 마스터 테이블 없이 단일화)
--    exp/level은 출석·게임·테스트 등 이벤트 발생 시
--    앱 로직에서 직접 증감. 별도 이력 테이블 없음.
--    ** 여러 종류의 펫을 고르게 하는 기획이 생기면 그때
--       pets 마스터 테이블을 다시 분리하면 됨.
-- ============================================
CREATE TABLE user_pets (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE,
    name            VARCHAR(50),
    level           INT NOT NULL DEFAULT 1,
    exp             INT NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_pet_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='사용자 펫 (1인 1펫 확정, exp/level 직접 보유)';