TANK GAME — ROOM MENU UPDATE

Files:
- index.html: updated game HTML with full-screen multiplayer start menu, create-room form, room list, four team colors, lobby and auto-start when both players are ready.
- server.js: WebSocket server updated to accept room names, colors, ready toggles, profile updates, and list rooms including status.
- package.json: Node.js dependency and start command.

Existing Render service URL:
https://tank-game-server-o650.onrender.com/
WebSocket URL used by the HTML:
wss://tank-game-server-o650.onrender.com/ws

To update the hosted server, upload/replace server.js and package.json in the repository connected to the Render service, then deploy/restart it. Keep the existing Render service URL. Upload index.html to wherever you host the game page.

The HTML and server code were syntax-checked locally. A successful live match still requires deploying the updated server code to Render; editing the local files does not change the hosted server by itself.
