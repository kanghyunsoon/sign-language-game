# Specification Quality Checklist: 백엔드 CRUD API 1차 구축

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-21
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

- (갱신) 사용자 요청에 따라 API 문서화(Swagger 등)를 최우선(P1) 사용자 스토리로 승격하고, 펫/출석체크는 "엔티티(데이터 구조)만 준비, API·비즈니스 로직은 범위 제외"로 스토리·FR·Out of Scope·Key Entities·Assumptions에 일관되게 반영했습니다.
- 문서 자체 "Swagger"라는 특정 도구명은 Assumptions에서만 참고용으로 언급하고, User Story/FR 본문은 "API 문서화 체계"로 기술해 구현 세부사항 노출을 피했습니다.
- 소스 자료(`backend/jira-crud-backlog.md`)에 이미 확정된 결정 사항(인증 방식, 게임 결과 REST 확정, 방 나가기 정책 등)이 포함되어 있어 [NEEDS CLARIFICATION] 마커 없이 작성했습니다.
- (2026-07-21 `/speckit-clarify` 세션) 남아있던 모호한 지점 2건을 확정: ① 종료(CLOSED) 게임방 자동 정리 보관 기간 → 5분 이내(FR-024, User Story 4 시나리오 8 반영), ② 랭킹 동점자 2차 정렬 기준 → 패 수가 적은 순으로 확정(FR-032, User Story 5 시나리오 2 반영, 기존 Assumptions의 임시 문구 제거). 체크리스트 항목은 모두 이미 통과 상태였으며 변동 없음(16/16 → 16/16).
- (2026-07-21 후속 논의) 게임방 CLOSED 전환 트리거를 "참가자 소진" 외에 "게임 결과 보고 처리 완료"까지 명시적으로 포함하도록 FR-023/FR-027을 정합화했고(기존 User Story 4 시나리오 11과의 불일치 해소), Key Entities의 게임방 항목에 "가장 최근 상태 변경 시각" 속성을 추가했습니다. 함께 논의된 "비정상(좀비) 방 강제 정리"는 REST 전용인 1차 구조에는 서버가 지속적으로 들고 있어야 할 연결 상태가 없어 해당 실패 유형(연결 유실) 자체가 발생하지 않는다고 판단해 1차 범위에서 제외하고, WebSocket 도입 시점의 후속 작업으로 Out of Scope/Edge Cases에 명시했습니다. 체크리스트 항목 변동 없음(16/16 → 16/16).
- (2026-07-21 plan 단계 리뷰) 게임 결과 API 리뷰 중 발견된 공백을 반영: ① `/game-rooms/{roomId}/leave`가 방 상태(WAITING/IN_PROGRESS)에 따라 다르게 동작하도록 FR-021/022/023과 User Story 4 시나리오를 분리(대기 중엔 위임, 진행 중엔 즉시 CLOSED+결과 무효화). ② 진행 중 나가기를 "무효 처리(결과 미저장)"로 확정 — 명시적으로 나가지 않고 조용히 사라진 경우와 동일하게 취급해, 나가기 버튼이 불이익이 되는 것을 방지. ③ "좀비 방 1시간 자동 삭제(WAITING/IN_PROGRESS 포함)" 재도입 제안은 이미 합의된 "WebSocket 도입 시점까지 보류" 결정을 뒤집을 새 근거가 없어 반영하지 않음(기존 Out of Scope 유지). 이 변경들은 plan.md 산출물(data-model.md, contracts/game-rooms-api.yaml) 조율 과정에서 spec.md에 소급 반영된 것으로, 체크리스트 항목 변동 없음(16/16 → 16/16).
- (2026-07-21 구현 단계 리뷰) FR-018(테스트 결과 총 문제 수/정답 수 저장)을 구현하다가, 오답노트만 노출하면 되고
  테스트 결과 자체를 조회·노출할 계획이 없다는 점을 재확인해 저장 기능 자체를 1차 범위에서 완전히 제외했습니다.
  User Story 3 시나리오 5, FR-018, data-model.md TestResult, contracts/learning-api.yaml의 `POST /test-results`를
  모두 제거(결번 유지, 이후 FR 번호는 재부여하지 않음). 체크리스트 항목 변동 없음(16/16 → 16/16).
- 모든 항목이 통과하여 바로 `/speckit-plan` 단계로 진행 가능합니다.
