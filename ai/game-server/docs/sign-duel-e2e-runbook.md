# 1:1 지문자 대전(SIGN_DUEL) 배포 전 e2e 검증 런북

배포 판단 기준은 "1:1 대전이 실제로 동작하는가"이다. 이 런북은 (A) 자동 하네스로 검증하는 백엔드 오케스트레이션과, (B) 사람이 브라우저로 확인해야 하는 미디어·인식 경로를 분리해 정의한다. 둘 다 통과해야 배포 가능으로 본다.

> 주의: 에이전트(Cowork) 실행 환경(샌드박스)은 배포 백엔드(`i15a405.p.ssafy.io`)와 `lab.ssafy.com`에 네트워크가 차단되어 있어 아래 A/B를 자동 실행할 수 없다. **네트워크가 되는 팀 로컬 환경**에서 실행할 것. 백엔드 코드는 수정하지 않는다(테스트 호출만 수행).

## A. 자동 검증 — 백엔드 1:1 오케스트레이션

`ai/game-server/scripts/e2e_sign_duel.py`가 두 플레이어(host/guest)를 모사해 다음을 계약대로 검증한다.

1. 회원가입 + 로그인 x2 (throwaway 계정)
2. `POST /game-rooms` (gameType=`SIGN_DUEL`, 응답 `realtimeTicket` 포함) — host 방장
3. `POST /game-rooms/join` (roomCode, 응답 `realtimeTicket`) — guest 참가
4. `POST /game-rooms/{id}/ready` x2 (isReady=true)
5. `POST /auth/sse-ticket` x2 — 게임방 WS용 신규 티켓
6. `wss://.../ws/game-rooms/{id}?ticket=...` 양쪽 핸드셰이크
7. `POST /game-rooms/{id}/start` (host) → 양쪽 `GAME_STARTED` 수신
8. `SIGNAL` 양방향 중계 확인 (host↔guest)
9. `POST /game-rooms/{id}/results` (winnerUserId=host, 201) → 방 `WAITING` 복귀
10. `GET /rankings?gameType=SIGN_DUEL` 200 반영 확인
11. teardown: `DELETE /users/me` x2 (soft-delete → 랭킹 제외)

### 실행

```bash
cd ai/game-server
pip install websockets          # HTTP는 표준 urllib 사용
python scripts/e2e_sign_duel.py --base-url https://i15a405.p.ssafy.io/api
# 스테이징 권장:
python scripts/e2e_sign_duel.py --base-url https://<staging-host>/api
# AI 인식 서버까지 함께 스모크:
python scripts/e2e_sign_duel.py --base-url https://<host>/api --ai-ws ws://localhost:8765
```

각 단계에 `[PASS]/[FAIL]`가 찍히고 마지막에 `RESULT: PASS/FAIL` 요약이 출력된다.

### 이 자동 검증이 남기는 데이터와 정리

- 실행하면 대상 서버에 테스트 계정·방·`game_results`·랭킹 행이 **실제로 생성**된다.
- 종료 시 테스트 유저를 자동 탈퇴시켜 랭킹에서 제외한다(`--keep-users`로 비활성 가능).
- 단, `game_results` 행은 API로 삭제 불가하여 DB에 잔존할 수 있으므로 **프로덕션보다 스테이징 실행을 권장**한다. 프로덕션에서 부득이 실행하면 사후 데이터 정리를 백엔드 담당과 협의한다.

### 자동 검증이 **다루지 못하는 것**

- 실제 오디오/비디오 미디어(WebRTC media). 하네스는 `SIGNAL`(offer/answer/ICE) **중계만** 확인한다.
- 카메라 → MediaPipe landmark 추출 → AI 인식 결과의 실사용 품질.

## B. 수동 검증 — 브라우저 미디어·인식 경로 (2대 필요)

브라우저 2대(가능하면 서로 다른 네트워크: TURN 경로 확인)에서 카메라를 켜고 진행한다.

- [ ] 로그인 → 로비에서 대기방 목록 SSE 갱신(`event: snapshot`/`update`) 실시간 반영
- [ ] host 방 생성 → guest 코드로 참가 → 양쪽 준비 → host 시작
- [ ] 시작 직후 양쪽에 상대 **영상/음성 연결**(WebRTC) 성립 — 서로 다른 네트워크에서 TURN 경유 연결 확인
- [ ] 각자 카메라 지문자 → AI 인식 결과가 화면/게임 로직에 반영, 프런트 전송 fps에서 지연 체감 없음(baseline 저지연)
- [ ] 상대 탭 닫기/네트워크 끊기 → `PEER_DISCONNECTED` 후 유예 시간, 재접속 시 `PEER_RECONNECTED`, 유예 만료 시 `PEER_LEFT`(+필요 시 방장 위임)
- [ ] 대전 종료 후 결과 반영 → 방이 `WAITING`으로 복귀해 **재대결** 가능
- [ ] 랭킹 화면에서 승자 승수 반영, 다른 gameType과 섞이지 않음

## 판정 기준

- A(자동) `RESULT: PASS` **그리고** B(수동) 체크리스트 전 항목 통과 시에만 1:1 대전 "배포 가능"으로 판정한다.
- AI 인식 서버 자체 검증(단위 16/16, 아티팩트 무결성, 단일·1:1 동시 격리 스모크, env 미설정 baseline 로드)은 `deployment-readiness.md` 참조.
