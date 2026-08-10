# Research: 백엔드 CRUD API 1차 구축

Technical Context에서 남겨둔 결정 지점들을 정리한다. 대부분 기존 `backend/suhwa/build.gradle`에 이미 선언된 의존성과 `backend/jira-crud-backlog.md`의 기존 결정 사항을 그대로 따르는 선택이라, 외부 리서치보다는 이 저장소 안에서 확인 가능한 사실을 근거로 결정했다.

## 1. API 문서(Swagger)와 비즈니스 로직의 분리 방식

- **Decision**: 도메인별로 `{Domain}Api` 인터페이스(Swagger 어노테이션 전담) + `{Domain}Controller` 구현체(`@RestController`, 위임 로직만) 두 파일로 나눈다. `springdoc-openapi`는 인터페이스의 어노테이션과 구현체의 매핑 어노테이션을 함께 읽어 문서를 생성한다.
- **Rationale**: 사용자가 명시적으로 요청한 "비즈니스 로직에 API 명세가 섞이지 않게" 요구사항을 만족하는 가장 표준적인 springdoc 패턴. 인터페이스만 봐도 API 계약(요청/응답/인증 요구사항)을 한눈에 파악할 수 있어 User Story 1(문서 우선)과도 맞는다. 컨트롤러 구현체는 `@Override` 메서드만 남아 가독성이 높아지고, 나중에 실제 요청 매핑(`@GetMapping` 등)을 인터페이스/구현체 어느 쪽에 둘지도 일관되게 유지하면 된다(본 프로젝트는 구현체에 매핑 어노테이션을 유지해 라우팅 설정이 실제 실행 경로와 함께 보이도록 한다).
- **Alternatives considered**:
  - 컨트롤러 클래스에 Swagger 어노테이션을 직접 붙이는 방식 — springdoc 기본 예제에 가장 흔하지만, 사용자가 원하는 "로직과 문서 분리" 요구를 충족하지 못함.
  - 별도 OpenAPI YAML을 손으로 작성 후 springdoc 없이 정적 서빙 — 코드 변경 시 문서가 자동 반영되지 않아(FR-002 위반) 제외.

## 2. 테스트 전략과 테스트용 데이터베이스

- **Decision**: 계층별로 테스트 범위를 나눈다.
  - Repository 계층: `@DataJpaTest` (내장 H2, MySQL 방언과 다른 부분—ENUM, `LIMIT`—은 통합 테스트에서 별도 검증)
  - Controller 계층: `@WebMvcTest` + MockMvc, Service는 Mock 처리
  - 도메인 간 흐름(회원가입 시 미래 pet row 대비 확인, 게임 결과 저장 시 승/패 갱신 등): `@SpringBootTest`로 전체 컨텍스트 기동 후 실제 흐름 검증
  - MySQL 고유 문법(예: `ORDER BY ... LIMIT 5`, ENUM 컬럼)에 의존하는 리포지토리 쿼리는 `@SpringBootTest` 통합 테스트에서 실제 MySQL(로컬 개발 DB 또는 CI의 MySQL 서비스 컨테이너)로 최소 1회 이상 검증한다.
- **Rationale**: `build.gradle`에 이미 `spring-boot-starter-data-jpa-test`, `spring-boot-starter-webmvc-test`, `spring-boot-starter-security-test` 등이 선언되어 있어 추가 의존성 없이 바로 사용 가능. 순수 H2만으로는 MySQL 전용 문법 차이를 놓칠 수 있어, 소수의 핵심 쿼리(오답노트 최근 5개, 랭킹 Top 5)는 통합 테스트로 이중 검증한다.
- **Alternatives considered**:
  - Testcontainers로 모든 테스트를 실제 MySQL 컨테이너 위에서 실행 — 가장 안전하지만 `build.gradle`에 의존성 추가와 로컬 Docker 요구사항이 생겨 이번 1차 범위엔 과함. 필요성이 커지면 후속 기능에서 도입을 재검토.
  - 전부 H2로만 테스트 — 빠르지만 MySQL ENUM/문자열 정렬 차이로 실제 버그를 놓칠 위험이 있어 핵심 쿼리는 배제하지 않음.

## 3. 게임방 정리 스케줄러 구현 방식

- **Decision**: Spring `@Scheduled` 기반의 단일 배치(`game.scheduler` 패키지)가 일정 주기로 `status = CLOSED AND updated_at < now() - 5분` 조건의 방을 하드 삭제한다. FR-023에 따라 CLOSED 전환 시 `updated_at`이 함께 갱신되므로 별도 `closed_at` 컬럼은 두지 않는다.
- **Rationale**: 별도 메시지 큐나 외부 스케줄러 없이 단일 인스턴스로 충분한 소규모 프로젝트 범위. `@Scheduled` + `@EnableScheduling`은 이미 사용 가능한 Spring Boot 기본 기능.
- **Alternatives considered**: Quartz 등 외부 스케줄링 라이브러리 — 분산 실행/영속 스케줄이 필요한 규모가 아니라 과함(YAGNI).

## 4. 비밀번호 저장 및 토큰 검증

- **Decision**: 비밀번호는 `BCryptPasswordEncoder`로 해싱 저장(`spring-boot-starter-security`에 포함). 인증은 JWT Access Token(Stateless) + `refresh_tokens` 테이블 화이트리스트 조합을 그대로 따른다(spec.md Assumptions에 이미 확정).
- **Rationale**: `spring-boot-starter-security` 의존성이 이미 포함되어 있고, `backend/jira-crud-backlog.md`에 이미 이 방식이 "결정된 사항"으로 명시되어 있어 별도 대안 탐색이 불필요.
- **Alternatives considered**: 세션 기반 인증 — REST API + 향후 WebSocket 전환을 고려할 때 Stateless JWT가 더 적합하다고 이미 결정되어 있어 제외.

## 5. `room_code` 생성 방식

- **Decision**: 영숫자 조합의 짧은 랜덤 코드(예: 6자리, Base36)를 생성하고 `UNIQUE` 제약 위반 시 재시도한다.
- **Rationale**: 사람이 구두/채팅으로 공유하기 쉬운 짧은 코드가 필요(예시로 문서에 `ABC12` 형태가 이미 등장). DB `UNIQUE` 제약이 최종 방어선이 되므로 애플리케이션 레벨 충돌 처리는 단순 재시도로 충분.
- **Alternatives considered**: UUID 사용 — 충돌 가능성은 거의 없지만 사용자가 입력/공유하기엔 너무 길어 UX상 부적합.

## 6. 랭킹 조회 쿼리

- **Decision**: `users` 테이블에서 `deleted_at IS NULL` 조건으로 `win_count DESC, loss_count ASC` 정렬 후 상위 5명을 조회하고, 별도 쿼리(또는 윈도우 함수)로 요청자 본인의 순위를 계산한다.
- **Rationale**: 별도 랭킹 집계 테이블 없이 `users.win_count`/`loss_count`만으로 요구사항(FR-030~033)을 충족 가능 — 이미 DB 스키마에 해당 컬럼이 존재.
- **Alternatives considered**: 랭킹 전용 캐시/집계 테이블 — 이번 규모에서는 불필요한 선반영 최적화(YAGNI), 필요 시 후속 성능 이슈가 확인되면 도입 검토.

## 7. 배포 대상/인프라

- **Decision**: 별도 Dockerfile/CI 설정은 이번 기능 범위에서 다루지 않는다(저장소에 아직 없음을 확인).
- **Rationale**: spec.md에 인프라 관련 요구사항이 없고, Technical Context의 "Target Platform"은 향후 별도 작업으로 분리하는 것이 합리적.
- **Alternatives considered**: 해당 없음 — 범위 외로 확정.

## 8. 게임 결과 보고 스키마 — 위치 기반(player1/2) 대신 역할 기반(host/guest)

- **Decision**: `POST /game-rooms/{roomId}/results` 요청을 `{winnerUserId, player1Score, player2Score}`에서 `{hostScore, guestScore}`로 변경하고, `winnerUserId`는 요청에서 제거해 서버가 두 점수를 비교해 계산한다(동점이면 `winner_id = NULL`, 무승부). 저장 시 `game_rooms.host_user_id → game_sessions.player1_id`, `game_rooms.guest_user_id → game_sessions.player2_id`로 고정 매핑한다.
- **Rationale**: 기존 스키마는 어떤 유저가 player1/player2인지 계약에 정의가 없어 클라이언트가 순서를 실수로 바꿔 보내면 승패가 `game_sessions`에 영구적으로 잘못 저장될 위험이 있었다(게임 결과 API 리뷰에서 발견). host/guest는 방 API가 이미 쓰고 있는 역할 개념이라 자연스럽게 확장 가능하고, `winnerUserId`를 클라이언트가 별도로 보내면 점수와 모순될 수 있어 아예 서버 계산으로 없앴다.
- **파생된 데이터 모델 변경**: 이 문제를 고치려면 방이 "누가 guest인지" 알아야 하는데, 기존 `game_rooms`에는 `host_user_id`만 있고 두 번째 참가자를 저장할 컬럼이 없었다. `guest_user_id`를 추가했다. 같은 이유로 `host_ready`/`guest_ready`도 함께 추가했다 — REST 전용 1차 구조는(research.md #3, 좀비 방 논의와 동일한 이유로) 요청 간 상태를 메모리가 아닌 DB에 영속해야 하는데, 준비 상태를 저장할 곳이 기존 스키마엔 없었다. 이 두 컬럼 추가는 이번 리뷰에서 파생된 추가 변경이라 별도로 명시한다.
- **Alternatives considered**:
  - `{"scores": [{"userId":..,"score":..}, ...]}` 형태의 완전 명시적 배열 — 가장 안전하지만, 방이 이미 1:1로 고정(capacity=2)되어 배열의 유연성이 필요 없고, 기존 host 개념과 중복된 새로운 식별 방식을 도입하게 되어 채택하지 않음.
  - `winnerUserId`를 계속 클라이언트가 보내고 점수와의 정합성만 서버가 검증(불일치 시 400) — 검증 로직이 추가되지만 필드 자체는 남길 수 있음. 서버가 어차피 점수로 승자를 계산할 수 있어 필드를 아예 없애는 쪽이 더 단순하다고 판단해 채택하지 않음.

## 9. 게임방 도메인 서비스와 REST 전송 계층의 분리

- **Decision**: `GameRoomService`의 각 메서드는 `roomId`/`userId` 등 순수 도메인 파라미터만 받고, `HttpServletRequest`/`Authentication`/요청 DTO 같은 HTTP 종속 타입을 받지 않는다. 인증 주체 추출과 요청 바디 파싱은 `GameRoomController`에서 끝낸다.
- **Rationale**: 방 나가기 시 방장 위임·CLOSED 전환(FR-022/023) 같은 상태 전이 로직은 지금은 `POST /leave`로만 트리거되지만, 향후 WebSocket 연결 종료(disconnect) 이벤트에서도 동일 로직이 필요해질 것이 명확하다(리뷰에서 지적). 서비스 계층을 HTTP와 분리해두면 그때 컨트롤러 로직을 복제하지 않고 서비스 메서드를 재사용할 수 있다. plan.md Project Structure에 반영.
- **Alternatives considered**: 컨트롤러에 로직을 그대로 두고 나중에 리팩터링 — 비용이 거의 들지 않는 지금 분리해두는 것과 달리, 나중에는 이미 얽힌 로직을 풀어야 해서 더 위험함. 채택하지 않음.

## WebSocket 도입 시 재검토가 필요한 항목 (지금은 조치하지 않음)

1차 리뷰 과정에서 나온 지적 중, 실제로는 WebSocket이 도입되어야 문제가 성립하거나 트래픽 규모가 커져야 체감되는 항목들. 지금 코드/스키마를 바꾸지 않고 메모만 남긴다.

- **입장(`/join`) 시맨틱 재설계 (허깨비 참가자 문제)**: 지금은 `POST /game-rooms/join`이 성공하면 즉시 `guest_user_id`가 확정된다. WebSocket이 도입되면 "REST로는 입장했지만 실제 게임 소켓엔 연결하지 않고 이탈"하는 사용자가 방 정원을 영구 점유하는 문제가 생길 수 있다. 이때는 `/join`을 확정 입장이 아니라 **임시 예약(PENDING)** 으로 바꾸고, 일정 시간(예: 5초) 내 WebSocket 연결이 확인되지 않으면 자동으로 자리를 비우는 로직이 필요하다. `guest_user_id`에 상태(`PENDING`/`CONFIRMED`) 필드를 추가하는 정도의 변경이라 스키마 전면 재설계는 아니지만, 지금(REST 전용, 검증할 소켓 자체가 없음) 미리 만들면 존재하지 않는 계층을 전제로 한 코드가 되어 시기상조로 판단해 보류.
- **Ready 토글의 쓰기 전략**: `host_ready`/`guest_ready`를 REST 요청마다 DB에 쓰는 지금 방식은 1차 트래픽 규모(소규모 프로젝트, 사람이 클릭하는 빈도)에서는 문제가 없다. WebSocket으로 토글 이벤트 빈도가 높아지면(사용자가 짧은 시간에 여러 번 토글) 매번 UPDATE를 치는 것이 낭비가 될 수 있어, 그 시점엔 인메모리에 먼저 반영해 즉시 브로드캐스트하고 DB에는 의미 있는 시점(예: 최종 확정, 또는 배치)에만 반영하는 write-behind 패턴을 얹는 것을 검토한다. **컬럼 자체를 제거하는 롤백이 아니라, 그 컬럼에 쓰는 시점/방식을 바꾸는 최적화로 예상**— 재접속 시 상태 복구, 다른 REST 클라이언트의 방 상태 조회 등에는 여전히 DB 값이 필요하기 때문.

## 미해결 항목

없음 — 모든 Technical Context 항목이 이 문서에서 해소되었다.
