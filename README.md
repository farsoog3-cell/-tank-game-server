# CONTROL BATTLE — realtime multiplayer sync server

This package works with `CONTROL_BATTLE_multiplayer_render_production_fix.html`.

## Deploy on Render
1. Upload/extract this package into your server repository.
2. Keep `package.json` and `server.js` at the repository root.
3. Create a **Web Service** on Render.
4. Build command: `npm install`
5. Start command: `npm start`
6. Configure the game's `WS_URL` to the secure WebSocket URL of this service (`wss://...`).

## Included fixes
- Keeps disconnected-player construction progress moving toward its work site.
- Continues production jobs while the owner is disconnected.
- Uses stable server-generated IDs for offline-produced units so reconnecting snapshots do not duplicate or erase them.
- Prevents stale browser snapshots from restarting a production job that the server already completed.
- Broadcasts the resulting state to the other player every server tick.

## Important limitation
The browser still simulates most combat and sends snapshots to the server. This is a real-time state relay with server-side offline construction/production progression, not a fully authoritative RTS simulation. Full server authority for movement, combat, damage, capture, and economy requires moving those game rules into `server.js`.

## Health check
Open `/health` on the deployed service. A healthy service returns JSON with `ok: true`.
