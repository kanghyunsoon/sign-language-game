# Solo Game Results API

2026-07-29 현재 운영 Swagger에 맞춘 프런트 계약이다. 백엔드 코드는 이 작업 범위에서 수정하지 않는다.

## 세션

백엔드에는 솔로 방/세션 시작 API가 없다. `HttpSoloGameApi.startSession()`은 브라우저 안에서만 세션 ID와 시작 시각을 만든다. 게임 시작을 원격 세션 API 성공에 의존시키지 않는다.

## 결과 저장

```http
POST /api/solo-results?userId={userId}
Authorization: Bearer {accessToken}
Content-Type: application/json

{"score": 87}
```

- `score`는 게임 포인트가 아니라 결승선 도달까지 걸린 정수 초다.
- 프런트는 `ceil(playTimeMs / 1000)`으로 계산한다.
- 카메라 프레임, 이미지, 랜드마크와 글자별 인식 통계는 전송하지 않는다.

## 랭킹 조회

```http
GET /api/rankings?userId={userId}&gameType=TETRIS_SOLO
Authorization: Bearer {accessToken}
```

프런트는 응답의 `me.rank`를 결과 화면에 표시하며 전체 순위를 다시 계산하지 않는다. `TETRIS_SOLO`는 기록이 짧을수록 높은 순위여야 하므로 백엔드 정책은 `score ASC` 또는 MIN 기준이어야 한다.

## 오답 가중치

게임 시작 시 한 번 호출한다.

```http
GET /api/wrong-answers/tetris-weights
GET /api/signs?category=CONSONANT
GET /api/signs?category=VOWEL
Authorization: Bearer {accessToken}
```

`signId`는 signs 응답의 `id`와 `label`로 연결한다. 게임에서는 다양성을 위해 서버 가중치를 다음처럼 완화한다.

```text
effectiveWeight = min(1.2, 1 + (serverWeight - 1) * 0.2)
```

예: `1.4 → 1.08`, `2.0 → 1.20`. 요청 또는 계약 실패 시 모든 글자의 기본값 `1.0`을 사용한다.
