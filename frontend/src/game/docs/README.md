# 게임 문서 색인

`frontend/src/game`의 문서는 아래 네 종류로만 유지한다. 새 날짜 문서를 만들지 말고 해당 문서를 갱신한다.

## 기준 문서

먼저 읽어야 하는 문서다. 서로 충돌하면 아래 순서대로 우선한다.

| 문서 | 역할 |
| --- | --- |
| [game-spec.md](./game-spec.md) | 게임 제품 명세. 화면, 규칙, 모드 구성의 기준 |
| [battle-ui-room-status-2026-08-02.md](./battle-ui-room-status-2026-08-02.md) | 1:1 로비·대기실·게임·결과의 현재 동작과 서버 계약 경계 |
| [backend-contract-alignment-2026-07-23.md](./backend-contract-alignment-2026-07-23.md) | REST/SSE/WebSocket 계약과 프런트 코드의 경계 |

## 트러블슈팅

| 문서 | 역할 |
| --- | --- |
| [game-troubleshooting.md](./game-troubleshooting.md) | 인식·솔로·1:1·성능·UI·턴 배틀·결과 저장의 증상·원인·조치와 재발 점검 순서 |

날짜별 트러블슈팅 문서 7개를 이 파일 하나로 합쳤다. 새 사고 기록은 해당 주제 절에 추가한다.

## 계약

| 문서 | 역할 |
| --- | --- |
| [contracts/README.md](./contracts/README.md) | 실행 계약의 위치 |
| [contracts/recognition-contract.md](./contracts/recognition-contract.md) | AI WebSocket 메시지 계약 |

모델 버전과 경쟁 출제 가능 글자는 문서가 아니라 `game-contracts/recognition/readiness.json`이 원천이다.

## 기술 참조

구현 세부를 다루는 문서다. 코드를 고칠 때 함께 본다.

| 문서 | 주제 |
| --- | --- |
| [reference/architecture.md](./reference/architecture.md) | 모듈 경계와 포트-어댑터 구조 |
| [reference/game-domain.md](./reference/game-domain.md) | 게임 도메인 모델 |
| [reference/solo-game-runtime.md](./reference/solo-game-runtime.md) | 솔로 런타임 루프 |
| [reference/matter-physics.md](./reference/matter-physics.md) | Matter 물리 설정과 충돌체 |
| [reference/pixi-renderer.md](./reference/pixi-renderer.md) | Pixi 렌더러와 레이어 |
| [reference/symbol-metadata.md](./reference/symbol-metadata.md) | 심볼 등록부 |
| [reference/solo-ai-input.md](./reference/solo-ai-input.md) | 솔로 인식 입력 |
| [reference/pose-feedback.md](./reference/pose-feedback.md) | 포즈 피드백 |
| [reference/template-capture.md](./reference/template-capture.md) | 기준 템플릿 촬영 |
| [reference/solo-score-statistics.md](./reference/solo-score-statistics.md) | 솔로 점수·통계 |
| [reference/game-results-api.md](./reference/game-results-api.md) | 결과 API |
| [reference/backend-integration-guide.md](./reference/backend-integration-guide.md) | 백엔드 연동과 DTO 재사용 |
| [reference/ui-usability.md](./reference/ui-usability.md) | UI 사용성 기준 |
| [reference/manual-test-checklist.md](./reference/manual-test-checklist.md) | 수동 검증 체크리스트 |

## 이 폴더에 두지 않는 것

- 배포·인프라 절차: `frontend/docs/deployment-guide.md`
- AI 학습 이력과 모델 평가: AI 서버 문서
- 특정 작업자·특정 PC 기준의 인수인계 스냅샷: 남기지 않는다. 상태 변화는 위 기준 문서에 반영한다
