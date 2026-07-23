# Specification Quality Checklist: 게임방 자동 실시간 연결 및 WebRTC 전환 흐름

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-23
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- FR-007의 [NEEDS CLARIFICATION] 마커는 해소됨 — 방 WebSocket 종료 이후 이탈은 실시간 감지하지 않고, 결과 보고 시점(FR-011)에 참가자 유효성만 검증하는 것으로 확정(옵션 B).
- User Story 5(게임 종료 후 원래 방 복귀, FR-013~016)를 추가함 — "결과 미보고 참가자가 재대결 가능 상태를 어떻게 아는가"는 명시적 실시간 통보 없이 각자 재입장 시 새 티켓을 받는 방식(FR-016)을 기본값으로 채택, 별도 클라리피케이션 마커 없이 Assumptions에 문서화.
- User Story 6·7(게임 타입 구분, FR-017/018/020)을 추가함 — 백로그(GAME-02-09/10)에 있던 내용을 이 spec에 정식 편입.
- **정정**: 처음엔 "영상 통화 전환(User Story 2~5)이 1:1 대전 방에만 적용된다"고 잘못 작성했었음 — 사용자 확인 결과 시그널링은 두 타입 모두 필요함. 실제 타입별 차이는 **결과 보고 형식**(1:1 대전은 점수 불필요, 테트리스는 점수 필요)으로 정정하고 User Story 7을 그에 맞게 다시 작성함(FR-021~023).
- **재정정**: FR-022의 [NEEDS CLARIFICATION]은 사용자 확인으로 해소됨 — 테트리스는 "게임 종류"가 아니라 "모드"(대전/솔로)로 결과 형식이 갈린다는 게 핵심이었음. 게임 타입을 지문자 1:1 대전/테트리스 대전/테트리스 솔로 3종으로 재정의하고, 대전 모드(앞의 2종) vs 솔로 모드(테트리스 솔로)로 묶어 실시간 연결 필요 여부·정원·결과 형식을 전부 이 모드 기준으로 재작성함(User Story 6·7·8, FR-017/020~024).
- 솔로 모드 점수 검증 여부를 확인함 — 사용자가 "검증 없음(MVP 수준으로 충분)"을 선택. 점수 조작 가능성을 의식적으로 수용하는 결정으로 Assumptions에 명시함. 추후 랭킹 신뢰도 문제가 생기면 세션 기반 최소 검증을 별도 스펙으로 추가.
- User Story 9(랭킹 3종 완전 분리)를 추가함 — 백로그의 RANK-01-02와 연결되는 내용을 이 spec에 정식 편입. 대전 두 타입(지문자 1:1 대전, 테트리스 대전)은 각각 승수 기준, 솔로(테트리스 솔로)는 최고 점수 기준으로 완전히 독립된 랭킹.
- **대규모 재구성**: "솔로 모드도 게임방(GameRoom) 개념을 쓴다"는 전제가 틀렸음을 사용자가 지적 — 솔로는 상대가 없으므로 room_code/생성/입장/정원 같은 방 개념 자체가 불필요하고, 시작 API조차 없이 **결과 보고 API 하나로 끝나야 한다**는 요구사항으로 전면 재작성함. User Story 7(결과 형식 차이)은 대전 쪽(US4)과 솔로 쪽(US8)으로 이미 분해되어 있어 제거. FR 번호 상당수가 이 과정에서 결번 처리됨(문서 내 번호 참고 각주 확인).
- 랭킹 저장 방식(FR-026/029, Assumptions)을 "게임 종류 + 점수" 공통 구조로 단순화하는 방향을 사용자가 제안 — 대전은 승리 시 1점 기록 후 SUM 집계, 솔로는 실제 점수 기록 후 MAX 집계. 이건 정규화가 아니라 다형적(polymorphic) 테이블 설계(컬럼 의미가 타입에 따라 갈림)이며 그 트레이드오프를 Assumptions에 명시함.
- Jira 동기화 완료(GAME-02-09/10/19/RANK-01-02 전부 갱신, 서브태스크 요약도 최신화).
- User Story 10(준비 상태 변경 실시간 통보, FR-030/031)을 추가함 — 사용자가 "REST만으로는 상대방이 실시간으로 모른다"를 지적, 기존 방 WS 메시지 패턴(PEER_DISCONNECTED 등)에 새 메시지 타입 하나를 추가하는 방향으로 반영. 정확한 메시지 스키마는 계획 단계로 미룸.
- 랭킹 저장 방식을 재확정 — "기존 지문자 1:1 대전만 카운터 유지, 신규 타입만 새 구조"였던 걸 사용자가 **세 타입 전부 공통 구조로 통일**하자고 판단해 FR-032 추가(`users.win_count`/`loss_count` 마이그레이션 후 폐기).
- 최종 전수 재검토(FR/SC/Assumptions 전체 재확인) 수행 — 무승부(draw) 처리가 FR-021에 빠져있던 것을 발견해 FR-033으로 추가(기존 `computeWinner`의 null-winner 처리와 동일하게 승자 정보 비우면 무승부, 승패 미반영). 그 외 번호/교차 참조 불일치 없음 확인.
- `/speckit-clarify` 실행(2026-07-23): 전체 카테고리(기능 범위/데이터 모델/UX 흐름/비기능 속성/외부 연동/엣지 케이스/제약·트레이드오프/용어 일관성/완료 신호) 스캔 결과, 이미 대화로 대부분 해소되어 있어 **정식 질문 0건** — "게임 타입"/"게임 종류" 용어 표기만 통일(편집성 수정, 질문 아님). 상세는 아래 완료 보고 참고.
- `/speckit-plan` 등 다음 단계로는 아직 자동 진행하지 않음.
- `/speckit-plan` 산출물(plan.md/research.md/data-model.md/contracts/quickstart.md) 자체 리뷰 수행 — FR-014("상대가 이미 나간 경우")가 실제로는 불가능한 분기("결과 보고 시점에 기존 leave() 경로를 따른다")를 서술하고 있었음을 발견해 정정: 서버는 게임 진행 중 실시간 이탈을 감지하지 못하므로(FR-007), 상대방이 결과 보고 전 명시적으로 `POST /leave`한 경우에만 방이 미리 CLOSED로 바뀌고, 이후 결과 보고는 기존 규칙(IN_PROGRESS 아닌 방은 거부)에 따라 그냥 409로 거부될 뿐 별도 "경로"는 없음(spec.md/data-model.md/contracts/quickstart.md 동시 수정).
- `soloresult` 패키지명을 `gameresult`로 재명명(plan.md/research.md/data-model.md) — 이 패키지가 솔로 API뿐 아니라 대전 모드 승/패까지 함께 저장하는 공통 `GameResult` 엔티티를 갖고 있어 "솔로"라는 이름이 범위를 잘못 좁혀 보였기 때문.
- FR-018(로비 목록에도 게임 종류 노출)이 `GameRoomResponse`에만 반영되고 `LobbyBroadcastService`가 실제로 쓰는 별개의 `LobbyRoomSummary` record에는 누락되어 있던 설계 공백을 발견해 plan.md/data-model.md/research.md에 보강.
- **재정정**: "대전 모드 승리 시 승자만 `game_results`에 score=1로 기록, 패자는 기록 안 함"(YAGNI 판단)이 사용자 지적으로 뒤집힘 — 기존 001 랭킹(`RankingService`)이 승수 동률 시 패수 오름차순으로 2차 정렬하는 동작을 이미 갖고 있어(코드 확인), 이 회귀 없는 동작을 보존하려면 패자 행(`score=0`)도 반드시 기록해야 함. FR-026에 동률 규칙 명시, research.md #5/data-model.md/contracts 전체에 반영.
- 위 정정과 맞물려 `game_sessions` 테이블 자체를 완전히 제거하기로 결정(컬럼만 줄이는 게 아니라 테이블·`GameSession`/`GameSessionRepository` 전부 삭제) — 저장소 전수 조사 결과 이 테이블을 읽는 코드가 어디에도 없었고(write-only), `game_results`(승자+패자 기록)만으로 대전 모드 승/패 집계가 완전히 대체되어 병행 유지할 이유가 없어짐(research.md #8). `GameResultResponse`에서 `gameSessionId` 필드도 함께 제거.
