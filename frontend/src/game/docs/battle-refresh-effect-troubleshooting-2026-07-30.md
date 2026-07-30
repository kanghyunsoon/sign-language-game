# 1:1 refresh and shared claim effect troubleshooting

## Symptoms

- Refreshing an in-progress duel repeatedly opened fresh WebSocket tickets but the signaling handshake still failed.
- Only the player who answered correctly saw the claim animation.
- The drain portal appeared inside both boards instead of on the shared otter's paper.
- The physical letter started falling before the drain and burst sequence was readable.
- Transparent duel canvases could cover the single shared animated background with a white surface.

## Causes

- The frontend closed the room WebSocket immediately after WebRTC connected. The backend contract also uses this socket as the participant-presence channel, so closing it prevented a reliable `PEER_DISCONNECTED` to `PEER_RECONNECTED` lifecycle.
- `BattleGamePage` discarded `SHARED_TARGET_CLAIMED` events when the winner was the remote player.
- The drain effect was owned by each `BattleBoardPanel`, so it could not represent the single shared target.
- `SPAWN_LETTER` was applied immediately even though the visual effect needed a deterministic lead time.

## Resolution

- Keep the room presence/signaling WebSocket open for the full media session and retry fresh-ticket handshakes across the backend's 10-second rejoin window.
- Render the shared paper black hole from every authoritative claim event on both clients.
- Route the delayed burst only to the winning player's board, while both clients use the same `winnerPlayerId`.
- Delay the authoritative physics spawn by 1.15 seconds and delay the next target until the full 2.3-second sequence completes.
- Force both Pixi hosts and canvases to remain transparent above the one shared animated sky.

## Verification

- `BattleController`, P2P transport, room socket, and native signaling targeted tests: 27 passed.
- TypeScript/Vite production build: passed.
- Full suite: 637 passed, 6 pre-existing failures remain in learning category availability, recognition session, and bot danger-line tests.
