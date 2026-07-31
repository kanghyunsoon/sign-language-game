# Research: 출석 및 펫 성장

최신 명세와 현재 `backend/suhwa` 구현을 비교해 Phase 0 기술 결정을 정리한다. 외부 라이브러리는 추가하지 않는다.

## 1. 불필요한 활동 세션 제거

- **Decision**: `practice_sessions`, `solo_sessions`, `solo_session_symbols`, `solo_symbol_statistics`와 관련 엔티티·Repository·Service·Controller·DTO를 제거한다.
- **Rationale**: 연습은 XP와 백엔드 이력이 모두 없고, 솔로의 시작·중단·재시작·상세 통계는 게임이 관리한다. 백엔드는 완료된 솔로 `score`만 필요하다.
- **Alternatives considered**: 보상 없이 세션 이력 유지, 비활성 API 유지. 사용처가 없고 계약과 스키마만 복잡하게 만들므로 제외했다.

## 2. 기존 Flyway 마이그레이션 처리

- **Decision**: 적용 가능성이 있는 V6/V7은 수정하지 않고 신규 V8에서 폐기 구조를 제거한다.
- **Rationale**: 적용된 Flyway 파일을 수정하면 체크섬 검증이 실패한다. 새 DB도 V6 생성 후 V8 제거 순서를 거치므로 모든 환경의 최종 스키마가 같다.
- **Alternatives considered**: V6 직접 수정, Flyway repair. 기존 환경의 재현성과 감사 가능성을 해치므로 제외했다.

## 3. 기존 솔로 데이터의 초 단위 이관

- **Decision**: `play_duration_ms`가 있는 `TETRIS_SOLO` 행은 컬럼 삭제 전에 `score = CEIL(play_duration_ms / 1000)`으로 변환한다. 시간이 없는 기존 행의 `score`는 이미 초 단위라는 사용자 정의에 따라 보존한다.
- **Rationale**: V6 세션 경로가 만든 행의 기존 `score`는 게임 점수이고 실제 시간은 별도 컬럼에 있으므로 그대로 두면 랭킹이 오염된다. 부분 초를 올림해야 60.001초가 60초 보상 구간으로 잘못 들어가지 않는다.
- **Alternatives considered**: 모든 솔로 기록 삭제, 밀리초 내림, 시간 없는 행 제외. 기록 손실 또는 경계 보상의 유리한 왜곡이 생겨 제외했다.

## 4. `game_results.score`의 단일 필드 의미

- **Decision**: `game_type`에 따라 하나의 `score`를 해석한다. 솔로는 게임 진행 시간(초), 대전은 승리 1·패배 0이다.
- **Rationale**: 기존 기본 스키마와 `POST /solo-results`가 이미 `game_type + score` 구조이며 별도 시간 컬럼 없이 저장·보상·랭킹을 모두 표현할 수 있다.
- **Alternatives considered**: `duration_ms` 유지, 모드별 결과 테이블 분리. 중복 필드와 분기 스키마가 불필요하다.

## 5. 솔로 경험치 누적

- **Decision**: `SoloResultService`가 결과 저장과 같은 트랜잭션에서 펫을 잠그고 `score <= 60: 15`, `<= 90: 10`, `<= 120: 5`, 그 외 0 XP를 지급한다.
- **Rationale**: `user_pets.exp`는 활동 완료 시점의 저장 상태이며, 결과 전체를 조회해 재계산하거나 DB 트리거를 사용할 필요가 없다. 기존 `GrowthRewardService`와 `UserPet.addExperience`가 동시성과 레벨 전이를 이미 담당한다.
- **Alternatives considered**: DB 트리거, 조회 시 `game_results` 전체 재집계, 비동기 이벤트. 정책 변경·레벨 전이·실패 원자성을 다루기 어려워 제외했다.

## 6. 솔로 결과 중복 책임

- **Decision**: 별도 솔로 지급 원장이나 세션 ID를 만들지 않고 신뢰 게임 서버가 완료 결과의 유일성과 단일 전송을 보장한다.
- **Rationale**: 사용자가 게임 측에서 이미 중단·재시작·중복 처리를 끝내고 완료 결과만 보내기로 확정했다.
- **Alternatives considered**: `solo_session_id`, 공통 reward event 원장, 클라이언트 UUID. 모두 제거하기로 한 서버 상태를 다시 도입한다.

## 7. 신뢰 게임 서버와 사용자 식별

- **Decision**: 프로토타입에서는 기존 Bearer 인증과 `@LoginUser` 계약을 유지하고 신뢰 게임 서버가 사용자 토큰을 전달한다. 직접 외부 호출 차단은 기존 배포 계층의 신뢰 경계로 둔다.
- **Rationale**: 사용자는 추가 백엔드 설정이 필요 없다고 확정했으며, 요청을 `{score}`로 유지하면 대상 사용자 ID 위조 면도 늘지 않는다.
- **Alternatives considered**: 서비스 전용 자격 증명과 요청 `userId` 추가. 더 강한 서버 인증이지만 새 비밀값·인증 필터·계약 변경이 필요해 현재 프로토타입 범위에서 제외했다.

## 8. 솔로 랭킹 집계와 공동 순위

- **Decision**: 사용자별 `MIN(score)`를 DB에서 집계해 오름차순 정렬하고, 자신보다 작은 최소 점수를 가진 사용자 수에 1을 더해 공동 순위를 계산한다.
- **Rationale**: 솔로 `score`는 시간이므로 낮을수록 좋다. DB 집계는 전체 결과를 JVM 메모리에 적재하는 현재 구현보다 확장성이 좋고, 엄격히 더 좋은 기록만 세면 `1, 1, 3` 순위가 된다.
- **Alternatives considered**: 최고 점수 내림차순, 누적/평균 점수, 서비스 메모리 전체 집계. 점수 의미 또는 성능 목표와 맞지 않는다.

## 9. 연습 보상 정책 제거

- **Decision**: `practiceExp`, `growth.practice-exp`, 연습 시작·완료 API와 관련 테스트를 제거한다.
- **Rationale**: 연습에서 XP를 지급하지 않고 이력도 사용하지 않는다는 명세와 코드·설정을 일치시킨다.
- **Alternatives considered**: 경험치 0으로 API 유지. 호출 가치 없이 유지보수 표면만 남는다.

## 10. 테스트·출석·대전 보상 유지

- **Decision**: 출석 3, 테스트 정답률 80% 이상 7, 대전 승자 10·패자 3과 기존 최초 완료 경계를 유지한다.
- **Rationale**: 현재 서비스가 고유키 또는 상태 전이와 같은 트랜잭션에서 이미 보상하며 최신 명세와 일치한다.
- **Alternatives considered**: 공통 보상 원장으로 재구현. 현재 범위에 필요하지 않다.

## 11. 펫 동시성 및 20레벨·5단계 성장

- **Decision**: 사용자별 `UserPet` 비관적 쓰기 잠금, 레벨당 20 XP, 5·10·15·20레벨 진화, 최대 20레벨과 초과 XP 제거 규칙을 유지한다.
- **Rationale**: 서로 다른 활동의 동시 완료에서도 XP 유실을 막고, 이미 수정된 성장 도메인과 V7 제약을 그대로 활용한다.
- **Alternatives considered**: JVM 락, 진화 단계 저장 컬럼, 20레벨 이후 XP 누적. 각각 다중 인스턴스 안전성, 정합성 또는 명세에 맞지 않는다.

## 12. API 및 Swagger 호환성

- **Decision**: `POST /solo-results`만 솔로 완료 API로 유지하고 세션·통계 API와 연습 API를 제거한다. 랭킹 응답에서는 `playDurationMs`를 제거하고 `score`만 노출한다.
- **Rationale**: 실제 유지할 최소 계약과 Swagger를 일치시키며, 솔로 `score`의 초 단위 의미를 한 곳에서 설명할 수 있다.
- **Alternatives considered**: 제거 API를 deprecated 상태로 유지. 저장할 도메인과 테이블이 없으므로 유효한 호환 동작을 제공할 수 없다.

## Resolved Unknowns

없음. 데이터 이관, 인증 경계, 점수 의미, XP 경계, 랭킹과 삭제 범위를 모두 확정했다.
