# Tank Game — GameRanger-style Server

This server intentionally has **no Firebase, no PostgreSQL and no DATABASE_URL requirement**.

It keeps live rooms, players and match state in server memory and synchronizes them through WebSocket.

## Render

1. Put these files in a GitHub repository.
2. Create a Render Web Service from that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. No database and no environment variable are required.
6. The WebSocket endpoint is `/ws`.

Expected URLs after deployment:
- `https://YOUR-SERVICE.onrender.com/`
- `https://YOUR-SERVICE.onrender.com/health`
- `wss://YOUR-SERVICE.onrender.com/ws`

## Important

This is live server memory. Rooms disappear when the Render service restarts or sleeps. That is intentional for the GameRanger-style live lobby. Permanent accounts/friends/statistics would require a persistent database later.
