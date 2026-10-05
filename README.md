# Tank Game PvP Server

This server provides:
- 2-player rooms
- 6-character room codes
- host / guest roles
- ready state
- synchronized battle start
- WebSocket state relay
- `/` and `/health` health endpoints

## Render

Deploy this folder as a Node Web Service.

Build command:
npm install

Start command:
npm start

The game client connects to:

wss://YOUR-RENDER-DOMAIN/ws

For the current client file, the configured endpoint is:
wss://tank-game-server-o650.onrender.com/ws

Important: the existing Render URL may currently be running a different server implementation. The new `server.js` must be deployed to that Render service for `/ws` to work.

## Protocol

Client -> server:
- create_room
- join_room
- settings
- ready
- start_battle
- state
- leave_room

The current implementation is a relay server, not an authoritative anti-cheat server. That is intentional so it can be integrated with the existing browser game without rewriting all combat simulation.
