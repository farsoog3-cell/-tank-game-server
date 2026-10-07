# Tactical Tank Game — Online Server

This package is the online room server for the browser game.

## Architecture

- Node.js + `ws` WebSocket server.
- Render-compatible binding on `0.0.0.0` and `PORT`.
- 1v1 rooms only.
- Server-generated hidden player IDs and resume tokens.
- Player slot/color/room state are controlled by the server.
- Match start occurs only when two real players are present and ready.
- No bot creation or local AI opponent is used by the online flow.
- Server sequence ordering prevents old snapshots from replacing newer state.
- Server keeps a 90-second reconnect grace period for a running match.
- Economy is server-clocked for captured-oil income and a client snapshot cannot mint money.
- The server sanitizes object/state payloads before broadcasting them.
- WebSocket ping/pong keepalive is enabled.

## Important design boundary

The original Three.js game engine remains client-side so its existing models, terrain, controls, effects, construction animation and combat presentation are preserved. The online layer synchronizes the resulting gameplay state through the server.

This is intentionally **not** pretending that the entire Three.js physics/combat engine has been ported to Node. A fully server-authoritative simulation would require moving movement, collision, projectile, damage, construction and production simulation into the server as well. The current server therefore owns identity, room lifecycle, sequencing, reconnect and economy ceilings while the existing game engine remains responsible for local simulation and rendering.

## Render

Build command: `npm install`

Start command: `npm start`

Health endpoint: `/health`

WebSocket URL used by the game:
`wss://tank-game-server-o650.onrender.com`
