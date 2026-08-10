# Quickstart / Validation Guide: Backend Refactoring & Hardening

기존 백엔드 모듈(`backend/suhwa`)을 대상으로 한 리팩토링/하드닝 검증 가이드. 각 스토리는 독립 검증 가능하다.

## 사전 준비

```bash
cd backend/suhwa
./gradlew build          # 전체 빌드 + 테스트 (회귀 기준선)
```

- 로컬 실행은 `.env`(gitignore) 또는 환경 변수로 DB/JWT/CORS 값 주입. 운영은 플랫폼 주입.
- 기준: **리팩토링 후 기존 테스트가 모두 통과**해야 한다(회귀 0, SC-006).

## 검증 시나리오 (FR ↔ 확인 방법)

### 인증·회원 (US1)

- **FR-004 익명 500 방지**: 인증 필요한 엔드포인트에 토큰 없이 요청 → 500이 아닌 표준 `ErrorResponse`(인증 실패) 응답 확인.
- **FR-005 비밀번호 상한**: 상한 초과 비밀번호로 회원가입 → 검증 오류(400) 확인.
- **FR-001/007 활성 판정·soft delete**: 탈퇴 계정으로 로그인/조회 → 일관되게 비활성 처리, `ACCOUNT_WITHDRAWN` 분기 부재 확인.
- **FR-002 서비스 분리**: 로그인→갱신→로그아웃 e2e가 분리 전과 동일 동작. (계약: 관찰 동작 불변)
- **FR-008 벌크 flush**: `RefreshTokenRepository.revokeAllByUserId`가 `@Modifying(clearAutomatically, flushAutomatically)` 유지 확인. `GameRoomRepository.closeAllActiveRooms`는 `flushAutomatically` 불필요로 결론(현행 유지) — 변경 없음 확인.

### 게임방 (US2, US3)

- **FR-012 데드락**: 두 참가자 동시 `reportResult` 부하 테스트 → 데드락 0, 결과 1건 확정.
- **FR-013 벌크 정리**: 대량 방 정리 스케줄러 실행 시 단일 벌크 DML(쿼리 로그로 N+1 부재) 확인.
- **FR-014 커스텀 예외**: 코드 생성 충돌 강제 → 도메인 커스텀 예외 + 표준 `ErrorResponse` 매핑 확인.
- **FR-015 결과 정합성**: 결과 저장 후 검증 쿼리로 누락/중복 0 확인(Flyway 제약 반영).
- **FR-016 입장 신호(GAME-02-21)**: 참가자 A 연결 후 B가 최초 WS 연결 → A 세션이 `PEER_JOINED {userId:B}` 수신. 재접속 시엔 `PEER_RECONNECTED`만. (contracts/realtime-websocket-messages-delta.md)

### 조회 성능 (US4)

- **FR-009/010 오답노트**: 조회 시 쿼리 로그에서 단일 DTO 프로젝션 쿼리 확인(2쿼리+인메모리 조인 부재).
- **FR-011 콘텐츠 캐시(Caffeine)**: 콘텐츠 반복 조회 시 2회차 DB 미조회(캐시 히트) 확인. (랭킹 캐시는 범위 제외)
- **FR-017 인덱스**: 랭킹 집계 쿼리(`game_results` game_type별 SUM/MAX) 실행계획 확인 — 기존 `idx_game_result_*`로 충분한지 보고 필요 시에만 인덱스 추가([재확인 필요]).

### 운영 안정성 (US5)

- **FR-018 Flyway**: 기동 시 `V1__baseline` 이후 마이그레이션 순차 적용, `flyway_schema_history` 기록 확인. `resources/schema` 수동 DDL이 Flyway로 이관·통일됐는지 확인.
- **FR-019 CORS**: `CORS_ALLOWED_ORIGINS` 미설정 기동 → 정의된 동작 + 경고 로그. 설정 시 해당 오리진만 허용.
- **FR-020 ArchUnit**: 모듈 경계 위반 코드 추가 시 테스트 실패 확인.
- **FR-021/022/023**: `open-in-view=false`, 트랜잭션/쿼리 타임아웃, 풀/배치 설정이 프로퍼티에 반영됐는지 확인. 장시간 쿼리는 타임아웃으로 중단.
- **FR-024 예외 정리**: 400/409/500 매핑과 catch-all 로깅 확인.
- **FR-025 필터체인 테스트**: 시큐리티 필터 체인을 켠 통합 테스트가 인증 경로를 커버.

## 완료 판정

- 대상 스토리(USER-01-10·RANK-01-03 제외)와 하위 작업이 지라에서 완료로 전환.
- `./gradlew build` 그린(기존 + 신규 테스트 통과), 관찰 가능한 회귀 없음.
