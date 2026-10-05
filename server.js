const http = require("http");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 10000);
const MAX_PLAYERS = 2;
const rooms = new Map();
const sockets = new Map();

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function cleanName(v) {
  return String(v || "Commander").replace(/[<>]/g, "").trim().slice(0, 18) || "Commander";
}

function cleanSettings(s) {
  const money = [1000, 2000, 3000, 4000].includes(Number(s?.money)) ? Number(s.money) : 3000;
  const color = /^#[0-9a-fA-F]{6}$/.test(String(s?.color || "")) ? String(s.color) : "#168cff";
  const colorName = String(s?.colorName || "BLUE").slice(0, 12);
  return { money, color, colorName };
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    ready: p.ready,
    settings: p.settings
  }));
}

function broadcastRoom(room) {
  const payload = { type: "room_update", room: room.code, players: publicPlayers(room) };
  for (const p of room.players.values()) send(p.ws, payload);
}

function removeFromRoom(p, reason = "left") {
  if (!p?.room) return;
  const room = rooms.get(p.room);
  if (!room) return;
  room.players.delete(p.id);
  p.room = null;
  if (room.hostId === p.id) {
    const next = room.players.values().next().value;
    if (next) {
      next.role = "host";
      room.hostId = next.id;
    }
  }
  for (const other of room.players.values()) send(other.ws, { type: "peer_left", reason });
  if (room.players.size === 0) rooms.delete(room.code);
  else broadcastRoom(room);
}

function makePlayer(ws, name, role, settings, room) {
  const id = crypto.randomUUID();
  const p = { id, ws, name: cleanName(name), role, settings: cleanSettings(settings), ready: false, room };
  sockets.set(id, p);
  return p;
}

function startBattle(room) {
  if (room.players.size !== 2) return;
  const players = [...room.players.values()];
  if (!players.every(p => p.ready)) return;
  room.started = true;
  const payload = { type: "battle_start", room: room.code, players: publicPlayers(room) };
  for (const p of players) send(p.ws, payload);
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end("Tank Game Multiplayer Server is running");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", ws => {
  const temp = { ws, id: crypto.randomUUID(), room: null };
  sockets.set(temp.id, temp);
  send(ws, { type: "hello", id: temp.id });

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === "create_room") {
      if (temp.room) removeFromRoom(temp);
      const code = roomCode();
      const room = { code, hostId: temp.id, players: new Map(), started: false };
      rooms.set(code, room);
      const p = makePlayer(ws, m.name, "host", m.settings, code);
      p.id = temp.id;
      sockets.set(temp.id, p);
      room.players.set(p.id, p);
      send(ws, { type: "room_created", room: code, role: "host", players: publicPlayers(room) });
      return;
    }

    if (m.type === "join_room") {
      const code = String(m.room || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "room_error", message: "الغرفة غير موجودة." });
      if (room.started) return send(ws, { type: "room_error", message: "المعركة بدأت بالفعل." });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { type: "room_error", message: "الغرفة ممتلئة." });
      if (temp.room) removeFromRoom(temp);
      const p = makePlayer(ws, m.name, "guest", m.settings, code);
      p.id = temp.id;
      sockets.set(temp.id, p);
      room.players.set(p.id, p);
      send(ws, { type: "room_joined", room: code, role: "guest", players: publicPlayers(room) });
      broadcastRoom(room);
      return;
    }

    const p = sockets.get(temp.id);
    const room = p?.room ? rooms.get(p.room) : null;

    if (m.type === "settings" && p && room) {
      p.settings = cleanSettings(m.settings);
      broadcastRoom(room);
      return;
    }

    if (m.type === "ready" && p && room) {
      p.ready = !!m.ready;
      broadcastRoom(room);
      return;
    }

    if (m.type === "start_battle" && p && room) {
      if (p.id !== room.hostId) return;
      startBattle(room);
      return;
    }

    if (m.type === "state" && p && room && room.started) {
      // Relay-only multiplayer: the game client remains responsible for rendering/simulation.
      // A later authoritative server can validate the same state schema without changing the room protocol.
      for (const other of room.players.values()) {
        if (other.id !== p.id) {
          send(other.ws, {
            type: "state",
            from: p.id,
            state: m.state || {}
          });
        }
      }
      return;
    }

    if (m.type === "leave_room" && p) {
      removeFromRoom(p);
      return;
    }
  });

  ws.on("close", () => {
    const p = sockets.get(temp.id);
    if (p) removeFromRoom(p, "disconnect");
    sockets.delete(temp.id);
  });
});

server.listen(PORT, () => {
  console.log(`Tank Game Multiplayer Server listening on ${PORT}`);
});
