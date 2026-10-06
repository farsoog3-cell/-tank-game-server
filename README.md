# CONTROL BATTLE — Online 1v1

## Files
- index(10).html — game client connected to the authoritative WebSocket protocol.
- control-battle-server.js — authoritative 1v1 server.
- package.json — Render/Node dependencies.
- render.yaml — Render deployment configuration.

## Render
Build Command: npm install
Start Command: npm start

The server listens on `process.env.PORT`.

## WebSocket
The game client connects to:
wss://tank-game-server-o650.onrender.com

## Important
Both players must send their selected color and starting money before the server starts the match. The server then sends the same authoritative map/state to both players.

The server validates movement, building, production, attacks, damage and production timers.
