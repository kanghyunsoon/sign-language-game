# API 명세서

이 문서는 Springdoc Swagger의 `*Api` 인터페이스와 요청·응답 DTO를 기준으로 작성한다.

## 공통 규칙

| 항목 | 내용 |
|---|---|
| API 버전 | v1 |
| 데이터 형식 | `application/json` |
| 인증 | JWT Bearer Token |
| 인증 헤더 | `Authorization: Bearer {accessToken}` |
| Swagger UI | `/swagger-ui/index.html` |
| OpenAPI JSON | `/v3/api-docs` |
| 운영 API prefix | 리버스 프록시 구성에 따라 `/api`가 앞에 붙을 수 있음 |

인증이 필요한 API에서 토큰이 없거나 유효하지 않으면 `401 Unauthorized`를 반환한다.

공통 오류 응답:

```json
{
  "code": "ERROR_CODE",
  "message": "오류 설명"
}
```

## Enum

| 이름 | 값 |
|---|---|
| `GameType` | `SIGN_DUEL`, `TETRIS_DUEL` |
| `GameResultType` | `SIGN_DUEL`, `TETRIS_DUEL`, `TETRIS_SOLO` |
| `GameRoomStatus` | `WAITING`, `IN_PROGRESS`, `CLOSED` |
| `SignCategory` | `CONSONANT`, `VOWEL`, `NUMBER`, `WORD` |
| `EvolutionStage` | `STAGE_1`, `STAGE_2`, `STAGE_3`, `STAGE_4`, `STAGE_5` |

---

## Auth

### 회원가입

`POST /auth/signup`

인증이 필요하지 않다.

요청:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "nickname": "수어왕"
}
```

| 필드 | 타입 | 필수 | 제약 |
|---|---|---:|---|
| `email` | string | O | 이메일 형식 |
| `password` | string | O | 8~64자 |
| `nickname` | string | O | 최대 50자 |

성공 응답 `201 Created`:

```json
{
  "id": 1,
  "email": "user@example.com",
  "nickname": "수어왕"
}
```

주요 오류: `400` 요청값 오류, `409` 이미 사용 중인 이메일

### 로그인

`POST /auth/login`

요청:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

성공 응답 `200 OK`:

```json
{
  "accessToken": "access-token",
  "refreshToken": "refresh-token"
}
```

주요 오류: `400` 요청값 오류, `401` 인증 실패 또는 탈퇴 계정

### 토큰 재발급

`POST /auth/refresh`

요청:

```json
{
  "refreshToken": "refresh-token"
}
```

성공 응답 `200 OK`는 로그인과 동일한 `TokenResponse`를 반환한다.

주요 오류: `401` 만료되거나 유효하지 않은 Refresh Token

### 로그아웃

`POST /auth/logout`

Bearer 인증이 필요하며 요청 본문은 없다.

성공 응답: `204 No Content`

### 실시간 연결 티켓 발급

`POST /auth/sse-ticket`

Bearer 인증이 필요하며 요청 본문은 없다. 발급된 티켓은 SSE 또는 WebSocket 연결에 한 번 사용한다.

성공 응답 `201 Created`:

```json
{
  "ticket": "one-time-realtime-ticket",
  "expiresInSeconds": 30
}
```

---

## Users

모든 API에 Bearer 인증이 필요하다.

### 내 프로필 조회

`GET /users/me`

성공 응답 `200 OK`:

```json
{
  "id": 1,
  "email": "user@example.com",
  "nickname": "수어왕"
}
```

### 내 프로필 수정

`PATCH /users/me`

요청:

```json
{
  "nickname": "새닉네임"
}
```

| 필드 | 타입 | 필수 | 제약 |
|---|---|---:|---|
| `nickname` | string | X | 최대 50자 |

성공 응답 `200 OK`: 수정된 `UserProfileResponse`

### 회원 탈퇴

`DELETE /users/me`

사용자를 Soft Delete 처리하고 보유한 Refresh Token을 무효화한다.

성공 응답: `204 No Content`

---

## Learning

모든 API에 Bearer 인증이 필요하다.

### 학습 콘텐츠 목록 조회

`GET /signs?category={category}`

| Query | 타입 | 필수 | 값 |
|---|---|---:|---|
| `category` | `SignCategory` | O | `CONSONANT`, `VOWEL`, `NUMBER`, `WORD` |

성공 응답 `200 OK`:

```json
[
  {
    "id": 1,
    "category": "CONSONANT",
    "label": "기역",
    "referenceMediaUrl": "https://example.com/sign/1.mp4",
    "tip": "손 모양을 확인하세요."
  }
]
```

### 오답 신고

`POST /wrong-answers`

요청:

```json
{
  "testSessionId": 42,
  "signId": 1
}
```

성공 응답: `201 Created`이며 본문은 없다.

주요 오류: `400` 요청값 오류, `404` 세션 또는 수어 콘텐츠 없음

### 최근 오답 조회

`GET /wrong-answers?category={category}`

성공 응답 `200 OK`:

```json
[
  {
    "id": 10,
    "sign": {
      "id": 1,
      "category": "CONSONANT",
      "label": "기역",
      "referenceMediaUrl": "https://example.com/sign/1.mp4",
      "tip": "손 모양을 확인하세요."
    },
    "wrongAt": "2026-07-31T12:00:00"
  }
]
```

### 테트리스 출제 가중치 조회

`GET /wrong-answers/tetris-weights`

성공 응답 `200 OK`:

```json
[
  {
    "signId": 1,
    "weight": 1.6
  }
]
```

### 테스트 세션 시작

`POST /test-sessions`

요청 본문은 없다.

성공 응답 `201 Created`:

```json
{
  "testSessionId": 42,
  "startedAt": "2026-07-31T12:00:00",
  "completedAt": null,
  "correctCount": null,
  "totalCount": null,
  "passedRewardThreshold": false,
  "awardedExp": 0,
  "pet": null
}
```

### 테스트 세션 완료

`POST /test-sessions/{testSessionId}/complete`

요청:

```json
{
  "correctCount": 8,
  "totalCount": 10
}
```

| 필드 | 타입 | 필수 | 제약 |
|---|---|---:|---|
| `correctCount` | integer | O | 0 이상, `totalCount` 이하 |
| `totalCount` | integer | O | 1 이상 |

정답률이 80% 이상이면 최초 완료 요청에서 테스트 XP 7을 지급한다. 같은 결과의 재요청은 추가 XP 없이 기존 결과를 반환하며, 완료 후 다른 결과를 보내면 `409 Conflict`를 반환한다.

성공 응답 `200 OK`:

```json
{
  "testSessionId": 42,
  "startedAt": "2026-07-31T12:00:00",
  "completedAt": "2026-07-31T12:03:00",
  "correctCount": 8,
  "totalCount": 10,
  "passedRewardThreshold": true,
  "awardedExp": 7,
  "pet": {
    "level": 1,
    "currentExp": 7,
    "expToNextLevel": 13,
    "evolutionStage": "STAGE_1",
    "maxLevel": 20
  }
}
```

---

## Growth

모든 API에 Bearer 인증이 필요하다.

### 오늘 출석 상태 조회

`GET /growth/attendance`

성공 응답 `200 OK`:

```json
{
  "attendanceDate": "2026-07-31",
  "attendedToday": true,
  "streakCount": 4
}
```

### 오늘 출석

`POST /growth/attendance`

하루 최초 출석에 XP 3을 지급한다. 같은 KST 날짜의 재요청은 추가 보상 없이 기존 상태를 반환한다.

성공 응답 `200 OK`:

```json
{
  "attendanceDate": "2026-07-31",
  "attendedToday": true,
  "streakCount": 4,
  "newlyAttended": true,
  "awardedExp": 3,
  "pet": {
    "level": 1,
    "currentExp": 3,
    "expToNextLevel": 17,
    "evolutionStage": "STAGE_1",
    "maxLevel": 20
  }
}
```

### 펫 성장 상태 조회

`GET /growth/pet`

성공 응답 `200 OK`:

```json
{
  "level": 7,
  "currentExp": 12,
  "expToNextLevel": 8,
  "evolutionStage": "STAGE_2",
  "maxLevel": 20
}
```

펫 성장 규칙:

| 레벨 | 진화 단계 |
|---:|---|
| 1~4 | `STAGE_1` |
| 5~9 | `STAGE_2` |
| 10~14 | `STAGE_3` |
| 15~19 | `STAGE_4` |
| 20 | `STAGE_5` |

레벨당 필요한 경험치는 20이다. 최대 레벨에서는 `currentExp=0`, `expToNextLevel=null`이다.

---

## Solo Results

모든 API에 Bearer 인증이 필요하다.

### 테트리스 솔로 결과 저장

`POST /solo-results`

요청:

```json
{
  "score": 90
}
```

`score`는 게임 완료까지 걸린 시간(초)이며 1 이상이어야 한다. 낮을수록 좋은 기록이다.

| score | 지급 XP |
|---:|---:|
| 1~60 | 15 |
| 61~90 | 10 |
| 91~120 | 5 |
| 121 이상 | 0 |

성공 응답 `201 Created`:

```json
{
  "resultId": 123,
  "score": 90
}
```

결과 저장과 펫 경험치 반영은 하나의 트랜잭션에서 처리된다.

---

## Game Rooms

모든 REST API에 Bearer 인증이 필요하다. 게임방 정원은 2명이다.

### 게임방 생성

`POST /game-rooms`

요청:

```json
{
  "gameType": "SIGN_DUEL"
}
```

성공 응답 `201 Created`:

```json
{
  "id": 100,
  "roomCode": "ABC123",
  "hostUserId": 1,
  "guestUserId": null,
  "hostReady": false,
  "guestReady": false,
  "status": "WAITING",
  "participantCount": 1,
  "capacity": 2,
  "gameType": "SIGN_DUEL",
  "realtimeTicket": "one-time-ticket"
}
```

### 게임방 입장

`POST /game-rooms/join`

요청:

```json
{
  "roomCode": "ABC123"
}
```

성공 응답 `200 OK`: `GameRoomResponse`

주요 오류: `404` 존재하지 않는 코드, `409` 정원 초과 또는 진행 중인 방

### 게임방 나가기

`POST /game-rooms/{roomId}/leave`

성공 응답: `204 No Content`

주요 오류: `403` 해당 방의 참여자가 아님

### 준비 상태 변경

`POST /game-rooms/{roomId}/ready`

요청:

```json
{
  "isReady": true
}
```

성공 응답 `200 OK`: 변경된 `GameRoomResponse`

### 게임 시작

`POST /game-rooms/{roomId}/start`

방장만 호출할 수 있다. 모든 참가자가 준비된 경우 상태를 `IN_PROGRESS`로 변경한다.

성공 응답 `200 OK`: 변경된 `GameRoomResponse`

주요 오류: `403` 방장이 아님, `409` 참가자가 준비되지 않음

### 1대1 게임 결과 보고

`POST /game-rooms/{roomId}/results`

요청:

```json
{
  "winnerUserId": 1
}
```

`winnerUserId`를 생략하거나 `null`로 보내면 무승부로 처리한다.

| 결과 | game_results score | 지급 XP |
|---|---:|---:|
| 승자 | 1 | 10 |
| 패자 | 0 | 3 |
| 무승부 | 저장·지급 없음 | 0 |

성공 응답 `201 Created`:

```json
{
  "winnerUserId": 1
}
```

주요 오류: `400` 승자가 방 참여자가 아님, `403` 요청자가 참여자가 아님, `409` 진행 중이 아니거나 이미 결과가 보고됨

---

## Ranking

### 게임별 랭킹 조회

`GET /rankings?gameType={gameType}`

Bearer 인증이 필요하다.

| Query | 타입 | 필수 | 값 |
|---|---|---:|---|
| `gameType` | `GameResultType` | O | `SIGN_DUEL`, `TETRIS_DUEL`, `TETRIS_SOLO` |

성공 응답 `200 OK`:

```json
{
  "top": [
    {
      "rank": 1,
      "userId": 1,
      "nickname": "수어왕",
      "score": 75
    },
    {
      "rank": 1,
      "userId": 2,
      "nickname": "손말왕",
      "score": 75
    },
    {
      "rank": 3,
      "userId": 3,
      "nickname": "연습왕",
      "score": 80
    }
  ],
  "me": {
    "rank": 3,
    "userId": 3,
    "nickname": "연습왕",
    "score": 80
  }
}
```

랭킹 규칙:

- `TETRIS_SOLO`: 사용자별 `MIN(score)` 오름차순, 동일 score는 `1, 1, 3` 방식의 공동 순위
- `SIGN_DUEL`, `TETRIS_DUEL`: 승수 내림차순, 동률이면 패배 수 오름차순
- `top`은 최대 5명
- 해당 게임 기록이 없으면 `me`는 `null`

---

## WebRTC

### ICE 서버 정보 조회

`GET /webrtc/ice-servers`

Bearer 인증이 필요하다.

성공 응답 `200 OK`:

```json
{
  "iceServers": [
    {
      "urls": ["stun:stun.example.com:3478"],
      "username": null,
      "credential": null
    },
    {
      "urls": ["turn:turn.example.com:3478"],
      "username": "turn-user",
      "credential": "turn-password"
    }
  ]
}
```

---

## SSE

### 대기 게임방 목록 구독

`GET /game-rooms/subscribe?ticket={ticket}`

`Authorization` 헤더 대신 `POST /auth/sse-ticket`에서 발급받은 일회용 티켓을 사용한다.

응답 Content-Type: `text/event-stream`

이벤트:

| 이벤트명 | 설명 |
|---|---|
| `snapshot` | 최초 연결 시 현재 대기방 전체 목록 |
| `update` | 게임방 목록 변경 시 최신 전체 목록 |
| `heartbeat` | 연결 유지 이벤트 |

`snapshot`, `update` 데이터 예:

```json
{
  "rooms": [
    {
      "id": 100,
      "roomCode": "ABC123",
      "status": "WAITING",
      "participantCount": 1,
      "capacity": 2,
      "gameType": "SIGN_DUEL"
    }
  ]
}
```

주요 오류: `401` 티켓 누락, 만료, 무효 또는 이미 사용됨

---

## WebSocket

### 게임방 실시간 연결

`WS /ws/game-rooms/{roomId}?ticket={ticket}`

Swagger의 해당 경로는 메시지 계약을 보여주기 위한 문서용 항목이다. 일반 HTTP `Try it out`으로 호출하지 않는다.

연결 조건:

- `POST /auth/sse-ticket`에서 새 일회용 티켓 발급
- 해당 게임방 참여자
- 유효한 `roomId`

공통 메시지 형식:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": {}
}
```

| type | 방향 | 주요 payload |
|---|---|---|
| `SIGNAL` | 양방향 | WebRTC offer, answer 또는 ICE candidate |
| `GAME_STARTED` | 서버 → 클라이언트 | `roomId` |
| `PEER_DISCONNECTED` | 서버 → 클라이언트 | `userId` |
| `PEER_RECONNECTED` | 서버 → 클라이언트 | `userId` |
| `PEER_LEFT` | 서버 → 클라이언트 | `userId`, `newHostUserId` |
| `ERROR` | 서버 → 클라이언트 | `code`, `message` |

`SIGNAL` 메시지 예:

```json
{
  "type": "SIGNAL",
  "payload": {
    "sdp": {
      "type": "offer",
      "sdp": "..."
    }
  }
}
```

핸드셰이크가 거부되는 경우: 티켓 만료·재사용, 방 참여자가 아님, 종료된 방

---

## 제외된 API

다음 API는 현재 Swagger 및 서버 코드에서 제거되었다.

- 연습 세션 시작·완료 API
- 솔로 세션 시작·완료·통계 API

연습은 서버 세션이나 XP를 생성하지 않는다. 솔로 게임은 게임 클라이언트가 완료 후 `POST /solo-results`로 초 단위 `score`만 전송한다.
