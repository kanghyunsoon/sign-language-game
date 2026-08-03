# 기술 문서

포트폴리오·발표·기술 면접 자료로 쓰는 심화 문서를 둔다. 코드와 함께 유지되는 개발 문서는 `frontend/src/game/docs/`에 있다.

## 게임 파트

| 문서 | 주제 | 성격 |
| --- | --- | --- |
| [game-realtime-p2p-report.md](./game-realtime-p2p-report.md) | 서버 중계 없는 실시간 1:1 — 브라우저 호스트 권위 | 제약 → 설계 → 실패 4건 → 재정의 |
| [game-recognition-pipeline-report.md](./game-recognition-pipeline-report.md) | AI 예측을 게임 입력으로 만드는 경계 | AI 문서의 프런트 측 짝 |
| [game-hangul-physics-report.md](./game-hangul-physics-report.md) | 한글 자모의 물리 강체화 — 래스터 콜라이더 자동 생성 | 도메인 고유 문제 |
| [../portfolio-game-frontend.md](../portfolio-game-frontend.md) | 게임 파트 전체 개요 | 위 세 문서의 요약 + 협업 |

## AI 파트

| 문서 | 주제 |
| --- | --- |
| `ai-model-improvement-report.md` | 2D 랜드마크 피처의 한계와 3D 피처·앙상블을 통한 인식 성능 개선 |

## 읽는 순서

전체 그림은 `portfolio-game-frontend.md`부터 본다. 깊이가 필요하면 주제별 문서로 들어간다.

인식 관련은 두 문서를 같이 읽어야 한다. `ai-model-improvement-report.md`가 "모델이 무엇을 얼마나 맞히는가"이고, `game-recognition-pipeline-report.md`가 "그 예측을 언제 게임 입력으로 확정하는가"다. 두 문서는 `game-contracts/recognition/readiness.json`에서 만난다.

## 근거 표기 규칙

세 문서 모두 같은 규칙을 쓴다.

- 수치에는 근거 파일 경로 또는 코드 위치를 표시한다
- 계측하지 않은 항목은 `미측정`으로 표시한다
- 코드에서 추론한 내용은 `코드 기반 추정`으로 표시한다
- 기록이 없어 확인이 필요한 항목은 `확인 필요`로 표시한다
- 조건이 다른 결과를 성능 향상처럼 비교하지 않는다

게임 파트 문서는 AI 문서와 달리 **단일 축의 정량 지표가 없다.** 회차별 계측 로그가 없기 때문이다. 근거는 코드 상수, 회귀 테스트 케이스 이름(대부분 실사용에서 발견한 증상), 커밋 SHA다. 각 문서의 「검증과 한계」 절에 무엇을 측정하지 않았는지 명시했다.
