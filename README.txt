CONTROL BATTLE — Multiplayer Server

Files:
- control-battle-server.js
- package.json

Render:
Build Command:
npm install

Start Command:
npm start

The server listens on:
process.env.PORT || 10000

Health check:
GET /health

WebSocket:
wss://YOUR-RENDER-DOMAIN

Important:
Deploy this package to the same Render Web Service used by the game.
The game's online client must connect to the Render WebSocket URL.
