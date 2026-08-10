"""1:1 지문자 대전(SIGN_DUEL) 백엔드 오케스트레이션 e2e 검증 하네스.

두 플레이어(host/guest)를 모사해 배포 백엔드의 실시간 대전 흐름을 계약대로 검증한다.
  회원가입 -> 로그인 -> 방 생성 -> 참가 -> 준비 -> 게임방 WS 연결 -> 시작(GAME_STARTED)
  -> SIGNAL 중계 -> 결과 보고 -> 방 WAITING 복귀 -> 랭킹 반영 -> 테스트 유저 탈퇴(teardown)

중요:
- 이 스크립트는 backend 코드를 수정하지 않는다. 다만 실행하면 대상 서버에 실제 데이터(계정/방/결과)가
  생성된다. 종료 시 생성한 테스트 유저를 DELETE /users/me 로 soft-delete 하여 랭킹에서 제외시킨다.
  (game_results 행 자체는 API로 삭제 불가하여 DB에 잔존할 수 있음 — 스테이징 권장.)
- WebRTC 실제 영상/카메라/MediaPipe 경로는 검증하지 않는다(SIGNAL 중계만 확인). 그 부분은 런북의
  수동 체크리스트로 확인한다.
- 샌드박스(에이전트 실행 환경)는 배포 백엔드에 네트워크 접근이 차단되어 있어, 반드시 네트워크가
  가능한 팀 환경에서 실행할 것.

필요 패키지: websockets (표준 라이브러리 urllib로 HTTP 처리)
실행 예:
  python scripts/e2e_sign_duel.py --base-url https://i15a405.p.ssafy.io/api
  python scripts/e2e_sign_duel.py --base-url https://<staging>/api --keep-users
"""
from __future__ import annotations

import argparse
import asyncio
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field

import websockets


# Windows 콘솔(cp949) 등에서 유니코드(예: em-dash) 출력이 UnicodeEncodeError로 끊기지
# 않도록 표준 출력/에러를 UTF-8로 강제한다. PYTHONUTF8=1 없이도 동작.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


@dataclass
class Result:
    steps: list[tuple[str, bool, str]] = field(default_factory=list)

    def record(self, name: str, ok: bool, detail: str = "") -> None:
        self.steps.append((name, ok, detail))
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""), flush=True)

    @property
    def passed(self) -> bool:
        return all(ok for _, ok, _ in self.steps)


class Api:
    def __init__(self, base_url: str, insecure: bool = False) -> None:
        self.base = base_url.rstrip("/")
        self.ctx = ssl.create_default_context()
        if insecure:
            self.ctx.check_hostname = False
            self.ctx.verify_mode = ssl.CERT_NONE

    def request(self, method: str, path: str, token: str | None = None,
                body: dict | None = None) -> tuple[int, dict | str]:
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=15, context=self.ctx) as r:
                raw = r.read().decode() or ""
                return r.status, (json.loads(raw) if raw.strip() else {})
        except urllib.error.HTTPError as e:
            raw = e.read().decode() if e.fp else ""
            try:
                payload = json.loads(raw) if raw.strip() else raw
            except json.JSONDecodeError:
                payload = raw
            return e.code, payload


def ws_url(base_url: str, room_id: int, ticket: str) -> str:
    scheme = "wss" if base_url.startswith("https") else "ws"
    host = base_url.split("://", 1)[1].rstrip("/")
    return f"{scheme}://{host}/ws/game-rooms/{room_id}?ticket={ticket}"


async def wait_for_type(ws, wanted: str, timeout: float = 8.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=end - time.time()))
        except (asyncio.TimeoutError, websockets.ConnectionClosed):
            return None
        if msg.get("type") == wanted:
            return msg
    return None


async def run(args) -> int:
    api = Api(args.base_url, insecure=args.insecure)
    res = Result()
    tag = uuid.uuid4().hex[:8]
    users: list[tuple[int, str]] = []  # (userId, token) for teardown

    def signup_login(role: str):
        email = f"e2e_{role}_{tag}@example.com"
        pw = "e2eTest!" + tag
        st, body = api.request("POST", "/auth/signup",
                               body={"email": email, "password": pw, "nickname": f"e2e-{role}-{tag}"})
        if st != 201 or not isinstance(body, dict) or "id" not in body:
            res.record(f"signup({role})", False, f"status={st} body={body}")
            return None
        uid = body["id"]
        st2, tok = api.request("POST", "/auth/login", body={"email": email, "password": pw})
        if st2 != 200 or not isinstance(tok, dict) or not tok.get("accessToken"):
            res.record(f"login({role})", False, f"status={st2} body={tok}")
            return None
        res.record(f"signup+login({role})", True, f"userId={uid}")
        return uid, tok["accessToken"]

    try:
        host = signup_login("host")
        guest = signup_login("guest")
        if not host or not guest:
            return 2
        host_id, host_tok = host
        guest_id, guest_tok = guest
        users = [(host_id, host_tok), (guest_id, guest_tok)]

        # 방 생성 (host)
        st, room = api.request("POST", f"/game-rooms?userId={host_id}", host_tok,
                               {"gameType": "SIGN_DUEL"})
        ok = st == 201 and isinstance(room, dict) and room.get("gameType") == "SIGN_DUEL" \
            and room.get("roomCode") and room.get("realtimeTicket")
        res.record("createRoom(host, SIGN_DUEL, realtimeTicket)", ok, f"status={st}")
        if not ok:
            return 2
        room_id = room["id"]
        room_code = room["roomCode"]

        # 참가 (guest)
        st, jr = api.request("POST", f"/game-rooms/join?userId={guest_id}", guest_tok,
                             {"roomCode": room_code})
        ok = st == 200 and isinstance(jr, dict) and jr.get("realtimeTicket")
        res.record("joinRoom(guest, realtimeTicket)", ok, f"status={st}")

        # 준비 (양쪽)
        s1, _ = api.request("POST", f"/game-rooms/{room_id}/ready?userId={host_id}", host_tok, {"isReady": True})
        s2, _ = api.request("POST", f"/game-rooms/{room_id}/ready?userId={guest_id}", guest_tok, {"isReady": True})
        res.record("setReady(host,guest)", s1 == 200 and s2 == 200, f"status={s1},{s2}")

        # 게임방 WS 연결용 신규 티켓 발급
        def fresh_ticket(uid, tok):
            st, t = api.request("POST", f"/auth/sse-ticket?userId={uid}", tok)
            return t.get("ticket") if isinstance(t, dict) else None
        ht = fresh_ticket(host_id, host_tok)
        gt = fresh_ticket(guest_id, guest_tok)
        res.record("issueRealtimeTicket(host,guest)", bool(ht and gt))
        if not (ht and gt):
            return 2

        # 양쪽 WS 연결 후 host가 start -> 둘 다 GAME_STARTED 수신, SIGNAL 중계 확인
        async with websockets.connect(ws_url(args.base_url, room_id, ht)) as hws, \
                   websockets.connect(ws_url(args.base_url, room_id, gt)) as gws:
            res.record("game-room WS handshake(host,guest)", True)
            st, _ = api.request("POST", f"/game-rooms/{room_id}/start?userId={host_id}", host_tok)
            res.record("startGame(host)", st == 200, f"status={st}")
            hs = await wait_for_type(hws, "GAME_STARTED")
            gs = await wait_for_type(gws, "GAME_STARTED")
            res.record("GAME_STARTED 수신(host,guest)", bool(hs and gs))

            # SIGNAL 중계: host -> guest
            await hws.send(json.dumps({"type": "SIGNAL", "payload": {"kind": "offer", "sdp": "x"}}))
            relayed = await wait_for_type(gws, "SIGNAL")
            res.record("SIGNAL relay host->guest", bool(relayed))
            # SIGNAL 중계: guest -> host
            await gws.send(json.dumps({"type": "SIGNAL", "payload": {"kind": "answer", "sdp": "y"}}))
            relayed2 = await wait_for_type(hws, "SIGNAL")
            res.record("SIGNAL relay guest->host", bool(relayed2))

        # 결과 보고: host 승리 -> 방 WAITING 복귀
        st, rr = api.request("POST", f"/game-rooms/{room_id}/results?userId={host_id}", host_tok,
                             {"winnerUserId": host_id})
        res.record("reportResult(winner=host, 201)", st == 201, f"status={st}")

        # 랭킹 반영 확인
        st, rank = api.request("GET", f"/rankings?userId={host_id}&gameType=SIGN_DUEL", host_tok)
        ok = st == 200 and isinstance(rank, dict)
        res.record("getRankings(SIGN_DUEL, 200)", ok, f"status={st}")

        # (선택) AI 인식 서버 landmark 스모크
        if args.ai_ws:
            try:
                async with websockets.connect(args.ai_ws) as aws:
                    await aws.send(json.dumps({"type": "GET_CAPABILITIES"}))
                    cap = json.loads(await asyncio.wait_for(aws.recv(), timeout=8))
                    res.record("AI 서버 CAPABILITIES", cap.get("type") == "CAPABILITIES",
                               f"modelVersion={cap.get('modelVersion')}")
            except Exception as e:  # noqa: BLE001
                res.record("AI 서버 연결", False, f"{type(e).__name__}: {e}")

        return 0 if res.passed else 1
    finally:
        if not args.keep_users:
            for uid, tok in users:
                st, _ = api.request("DELETE", f"/users/me?userId={uid}", tok)
                print(f"[teardown] withdraw userId={uid} status={st}", flush=True)
        print("\n=== SUMMARY ===", flush=True)
        for name, ok, _ in res.steps:
            print(f"  {'PASS' if ok else 'FAIL'}  {name}", flush=True)
        print(f"RESULT: {'PASS' if res.passed else 'FAIL'}", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description="SIGN_DUEL 1:1 백엔드 e2e 검증 하네스")
    p.add_argument("--base-url", default="https://i15a405.p.ssafy.io/api",
                   help="백엔드 base URL (기본: 배포)")
    p.add_argument("--ai-ws", default=None,
                   help="선택: AI 인식 서버 WebSocket URL (예: ws://localhost:8765)")
    p.add_argument("--keep-users", action="store_true",
                   help="종료 시 테스트 유저를 탈퇴시키지 않음(디버깅용)")
    p.add_argument("--insecure", action="store_true", help="TLS 인증서 검증 생략")
    args = p.parse_args()
    try:
        sys.exit(asyncio.run(run(args)))
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
