RTS Online - 5 Minute Disconnect System

server.js = Node.js WebSocket server with 5-minute disconnect grace period.
index.html = current game file with the terrain/player waiting screen.

Run server:
npm install ws
node server.js

The server is authoritative for the 5-minute timeout.
