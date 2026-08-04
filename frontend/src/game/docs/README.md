# 게임 문서

문서는 8개다. 새 문서를 만들지 말고 해당 문서의 절에 추가한다. 날짜를 파일명에 넣지 않는다.

## 어디에 쓸 것인가

| 쓰려는 내용 | 문서 |
| --- | --- |
| 게임 규칙, 모드 구성, 화면 흐름 | [game-spec.md](./game-spec.md) |
| 모듈 경계, 주입 포트, 상태 머신, 도메인 규칙 | [architecture.md](./architecture.md) |
| 심볼 등록부, 콜라이더, 물리, 렌더, 솔로 런타임, 점수 | [game-engine.md](./game-engine.md) |
| 인식 파이프라인, 손 소유권, Decoder, AI 계약, 카메라 | [recognition.md](./recognition.md) |
| REST·SSE·WebSocket·P2P 계약, 솔로 결과 API | [backend-contracts.md](./backend-contracts.md) |
| 1:1 로비·대기실·결과 동작, 화면 표현 원칙 | [battle-ui-and-rooms.md](./battle-ui-and-rooms.md) |
| 증상·원인·조치, 재발 점검 순서 | [game-troubleshooting.md](./game-troubleshooting.md) |
| 배포 전 수동 검증 절차 | [manual-test-checklist.md](./manual-test-checklist.md) |

## 충돌 시 우선순위

같은 주제를 두 문서가 다르게 말하면 아래 순서로 우선한다.

1. **코드와 계약 파일** — `game-contracts/recognition/readiness.json`, 배포 Swagger
2. `backend-contracts.md` / `battle-ui-and-rooms.md` — 현재 동작과 서버 경계
3. `game-spec.md` — 제품 기준
4. `game-engine.md` / `recognition.md` / `architecture.md` — 구현 세부
5. `game-troubleshooting.md` — 과거 사고 기록

모델 버전과 경쟁 출제 가능 글자는 문서가 아니라 `game-contracts/recognition/readiness.json`이 원천이다.

## 여기에 두지 않는 것

| 내용 | 위치 |
| --- | --- |
| 배포·인프라 절차, 환경변수 | `frontend/docs/deployment-guide.md` |
| AI 학습 이력, 모델 평가 | AI 서버 문서 |
| 포트폴리오·발표용 문서 (개요, P2P·인식·물리 심화) | 저장소 루트 `docs/` |
| 특정 작업자·특정 PC 기준 인수인계 스냅샷 | 남기지 않는다. 상태 변화는 위 문서에 반영한다 |

## 기록 규칙

- 계측하지 않은 수치는 `미측정`, 코드에서 추론한 내용은 `코드 기반 추정`, 근거를 못 찾은 항목은 `확인 필요`로 표시한다.
- 실패했거나 되돌린 접근도 남긴다. 원인만 적힌 문서보다 "이 접근은 실패했다"가 적힌 문서가 다음 사람의 시간을 아낀다.
- 수치를 쓸 때는 근거 파일 경로나 상수명을 함께 적는다.
