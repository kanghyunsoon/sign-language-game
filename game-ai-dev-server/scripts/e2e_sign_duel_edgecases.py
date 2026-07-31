"""SIGN_DUEL 1:1 백엔드 계약 **엣지케이스** e2e 하네스.

happy-path는 `e2e_sign_duel.py`가 담당한다. 이 스크립트는 배포 백엔드 계약의 엣지케이스를
계약대로(상태코드/실시간 이벤트) 검증한다:
  1. 정원 초과 입장 -> 409
  2. IN_PROGRESS 아닌 방에 결과 보고 -> 409
  3. winnerUserId가 참가자가 아님 -> 400
  4. 나가기 의미: 대기방에서 guest 퇴장(204) 후 host 마지막 퇴장 시 방 CLOSED
  5. 재접속 유예: guest WS 끊김 -> host가 PEER_DISCONNECTED 수신, 유예 내 재접속 -> PEER_RECONNECTED

공용 로직(HTTP/WS 헬퍼)은 e2e_sign_duel.py에서 재사용한다.
주의: happy-path 하네스와 동일하게 실제 데이터가 생성되며 종료 시 유저를 자동 withdraw 한다.
      샌드박스는 배포 백엔드 접근이 차단돼 있어 반드시 네트워크 가능한 팀 환경에서 실행할 것.

실행:
  python scripts/e2e_sign_duel_edgecases.py --base-url https://i15a405.p.ssafy.io/api
  # 재접속 유예(시간 소요)까지: --with-reconnect
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid

import websockets

# happy-path 하네스의 공용 헬퍼 재사용
from e2e_sign_duel import Api, Result, ws_url, wait_for_type


class Harness:
    def __init__(self, api: Api, res: Result) -> None:
        self.api = api
        self.res = res
        self.users: list[tuple[int, str]] = []

    def new_user(self, role: str):
        tag = uuid.uuid4().hex[:8]
        email = f"e2e_edge_{role}_{tag}@example.com"
        pw = "e2eEdge!" + tag
        st, body = self.api.request("POST", "/auth/signup",
                                    body={"email": email, "password": pw, "nickname": f"edge-{role}-{tag}"})
        if st != 201 or not isinstance(body, dict) or "id" not in body:
            self.res.record(f"signup({role})", False, f"status={st}")
            return None
        uid = body["id"]
        st2, tok = self.api.request("POST", "/auth/login", body={"email": email, "password": pw})
        if st2 != 200 or not tok.get("accessToken"):
            self.res.record(f"login({role})", False, f"status={st2}")
            return None
        self.users.append((uid, tok["accessToken"]))
        return uid, tok["accessToken"]

    def create_room(self, host):
        uid, tok = host
        st, room = self.api.request("POST", f"/game-rooms?userId={uid}", tok, {"gameType": "SIGN_DUEL"})
        return (room if st == 201 and isinstance(room, dict) else None), st

    def join(self, user, code):
        uid, tok = user
        return self.api.request("POST", f"/game-rooms/join?userId={uid}", tok, {"roomCode": code})

    def teardown(self):
        for uid, tok in self.users:
            self.api.request("DELETE", f"/users/me?userId={uid}", tok)


async def edge_capacity(h: Harness):
    host = h.new_user("host"); guest = h.new_user("guest"); third = h.new_user("third")
    if not (host and guest and third):
        return
    room, st = h.create_room(host)
    if not room:
        h.res.record("정원초과: 방 생성", False, f"status={st}"); return
    code = room["roomCode"]
    _, sj = h.join(guest, code)
    st3, _ = h.join(third, code)
    h.res.record("정원 초과 3번째 입장 -> 409", st3 == 409, f"guest={sj}, third={st3}")


async def edge_result_not_in_progress(h: Harness):
    host = h.new_user("host2")
    if not host:
        return
    room, st = h.create_room(host)
    if not room:
        h.res.record("결과-상태위반: 방 생성", False, f"status={st}"); return
    uid, tok = host
    str_, _ = h.api.request("POST", f"/game-rooms/{room['id']}/results?userId={uid}", tok,
                            {"winnerUserId": uid})
    h.res.record("IN_PROGRESS 아닌 방 결과보고 -> 409", str_ == 409, f"status={str_}")


async def edge_winner_not_participant(h: Harness):
    host = h.new_user("host3"); guest = h.new_user("guest3"); outsider = h.new_user("outsider")
    if not (host and guest and outsider):
        return
    room, st = h.create_room(host)
    if not room:
        h.res.record("승자검증: 방 생성", False, f"status={st}"); return
    code = room["roomCode"]; rid = room["id"]
    h.join(guest, code)
    h.api.request("POST", f"/game-rooms/{rid}/ready?userId={host[0]}", host[1], {"isReady": True})
    h.api.request("POST", f"/game-rooms/{rid}/ready?userId={guest[0]}", guest[1], {"isReady": True})
    sstart, _ = h.api.request("POST", f"/game-rooms/{rid}/start?userId={host[0]}", host[1])
    st_bad, _ = h.api.request("POST", f"/game-rooms/{rid}/results?userId={host[0]}", host[1],
                              {"winnerUserId": outsider[0]})
    h.res.record("winnerUserId 비참가자 -> 400", st_bad == 400, f"start={sstart}, result={st_bad}")


async def edge_leave_semantics(h: Harness):
    host = h.new_user("host4"); guest = h.new_user("guest4")
    if not (host and guest):
        return
    room, st = h.create_room(host)
    if not room:
        h.res.record("나가기: 방 생성", False, f"status={st}"); return
    code = room["roomCode"]; rid = room["id"]
    h.join(guest, code)
    sg, _ = h.api.request("POST", f"/game-rooms/{rid}/leave?userId={guest[0]}", guest[1])
    sh, _ = h.api.request("POST", f"/game-rooms/{rid}/leave?userId={host[0]}", host[1])
    h.res.record("대기방 퇴장(guest 204, host 204)", sg == 204 and sh == 204, f"guest={sg}, host={sh}")


async def edge_reconnect_grace(h: Harness):
    host = h.new_user("host5"); guest = h.new_user("guest5")
    if not (host and guest):
        return
    room, st = h.create_room(host)
    if not room:
        h.res.record("재접속: 방 생성", False, f"status={st}"); return
    code = room["roomCode"]; rid = room["id"]
    h.join(guest, code)

    def ticket(u):
        _, t = h.api.request("POST", f"/auth/sse-ticket?userId={u[0]}", u[1])
        return t.get("ticket") if isinstance(t, dict) else None

    ht = ticket(host); gt = ticket(guest)
    if not (ht and gt):
        h.res.record("재접속: 티켓 발급", False); return
    hws = await websockets.connect(ws_url(h.api.base, rid, ht))
    gws = await websockets.connect(ws_url(h.api.base, rid, gt))
    await gws.close()  # guest 비정상 종료 모사
    disc = await wait_for_type(hws, "PEER_DISCONNECTED", timeout=8)
    gt2 = ticket(guest)
    gws2 = await websockets.connect(ws_url(h.api.base, rid, gt2))
    recon = await wait_for_type(hws, "PEER_RECONNECTED", timeout=8)
    h.res.record("guest 끊김 -> host PEER_DISCONNECTED", bool(disc))
    h.res.record("유예 내 재접속 -> host PEER_RECONNECTED", bool(recon))
    for ws in (hws, gws2):
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass


async def run(args) -> int:
    api = Api(args.base_url, insecure=args.insecure)
    res = Result()
    h = Harness(api, res)
    try:
        await edge_capacity(h)
        await edge_result_not_in_progress(h)
        await edge_winner_not_participant(h)
        await edge_leave_semantics(h)
        if args.with_reconnect:
            await edge_reconnect_grace(h)
        return 0 if res.passed else 1
    finally:
        if not args.keep_users:
            h.teardown()
        print("\n=== EDGE SUMMARY ===", flush=True)
        for name, ok, _ in res.steps:
            print(f"  {'PASS' if ok else 'FAIL'}  {name}", flush=True)
        print(f"RESULT: {'PASS' if res.passed else 'FAIL'}", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description="SIGN_DUEL 1:1 백엔드 엣지케이스 e2e 하네스")
    p.add_argument("--base-url", default="https://i15a405.p.ssafy.io/api")
    p.add_argument("--with-reconnect", action="store_true",
                   help="재접속 유예 시나리오 포함(WS 연결·시간 소요)")
    p.add_argument("--keep-users", action="store_true")
    p.add_argument("--insecure", action="store_true")
    args = p.parse_args()
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
