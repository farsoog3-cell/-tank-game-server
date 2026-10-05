const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

const PORT = Number(process.env.PORT || 10000);
const rooms = new Map();
const sockets = new Map();

function id(prefix = "") {
  return prefix + crypto.randomBytes(8).toString("hex");
}

function cleanName(value, fallback = "Player") {
  const s = String(value ?? "").trim().slice(0, 24);
  return s || fallback;
}

function send(ws, type, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  }
}

function broadcastRoom(room, type, data = {}, except = null) {
  for (const player of room.players.values()) {
    if (player.ws !== except) send(player.ws, type, data);
  }
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    ready: !!p.ready,
    connected: !!p.ws && p.ws.readyState === WebSocket.OPEN
  };
}

function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    players: [...room.players.values()].map(publicPlayer),
    createdAt: room.createdAt
  };
}

function makeRoom(name, password, maxPlayers, host) {
  const room = {
    id: id("room_"),
    name: cleanName(name, "Battle Room"),
    password: String(password || "").slice(0, 64),
    maxPlayers: Math.max(2, Math.min(8, Number(maxPlayers) || 4)),
    hostId: host.id,
    createdAt: Date.now(),
    players: new Map(),
    state: {
      started: false,
      tick: 0,
      gameTime: 0,
      players: {},
      units: {},
      buildings: {},
      projectiles: {},
      effects: {}
    }
  };
  rooms.set(room.id, room);
  return room;
}

function leaveRoom(player) {
  const room = player.roomId ? rooms.get(player.roomId) : null;
  if (!room) return;

  room.players.delete(player.id);
  player.roomId = null;

  if (room.hostId === player.id) {
    const next = room.players.values().next().value;
    room.hostId = next ? next.id : null;
    if (next) send(next.ws, "room_host", { room: publicRoom(room) });
  }

  broadcastRoom(room, "player_left", {
    playerId: player.id,
    room: publicRoom(room)
  });

  if (room.players.size === 0) {
    rooms.delete(room.id);
  } else {
    broadcastRoom(room, "room_update", { room: publicRoom(room) });
  }
}

function joinRoom(room, player) {
  if (room.players.size >= room.maxPlayers) {
    return { ok: false, error: "ROOM_FULL" };
  }

  if (room.password && room.password !== player.passwordAttempt) {
    return { ok: false, error: "BAD_PASSWORD" };
  }

  if (player.roomId) leaveRoom(player);

  room.players.set(player.id, player);
  player.roomId = room.id;
  player.passwordAttempt = undefined;

  room.state.players[player.id] = {
    id: player.id,
    name: player.name,
    color: player.color,
    x: 0,
    y: 0,
    hp: 100
  };

  return { ok: true };
}

function removePlayerState(room, playerId) {
  delete room.state.players[playerId];
}

function roomSnapshot(room) {
  return {
    room: publicRoom(room),
    state: room.state
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Tank Game Online Server",
    websocket: "/ws",
    rooms: rooms.size,
    time: Date.now()
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tank-game-server",
    rooms: rooms.size,
    players: [...sockets.values()].filter(p => p.ws?.readyState === WebSocket.OPEN).length,
    uptime: process.uptime(),
    time: Date.now()
  });
});

app.get("/api/rooms", (req, res) => {
  res.json([...rooms.values()].map(publicRoom));
});

wss.on("connection", (ws) => {
  const player = {
    id: id("p_"),
    ws,
    name: "Player",
    color: "#2f7d32",
    roomId: null,
    ready: false,
    passwordAttempt: ""
  };

  sockets.set(player.id, player);
  ws.isAlive = true;

  send(ws, "connected", {
    playerId: player.id,
    serverTime: Date.now()
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, "error", { code: "BAD_JSON", message: "Invalid JSON" });
    }

    const type = String(msg.type || "");

    try {
      if (type === "profile") {
        player.name = cleanName(msg.name);
        player.color = String(msg.color || "#2f7d32").slice(0, 20);

        if (player.roomId) {
          const room = rooms.get(player.roomId);
          if (room) {
            room.state.players[player.id] = {
              ...(room.state.players[player.id] || {}),
              id: player.id,
              name: player.name,
              color: player.color
            };
            broadcastRoom(room, "player_update", {
              player: publicPlayer(player),
              room: publicRoom(room)
            });
          }
        }

        return send(ws, "profile_ok", { player: publicPlayer(player) });
      }

      if (type === "list_rooms") {
        return send(ws, "rooms", {
          rooms: [...rooms.values()].map(publicRoom)
        });
      }

      if (type === "create_room") {
        const room = makeRoom(
          msg.name,
          msg.password,
          msg.maxPlayers,
          player
        );

        const result = joinRoom(room, player);
        if (!result.ok) {
          rooms.delete(room.id);
          return send(ws, "error", { code: result.error });
        }

        send(ws, "room_created", { room: publicRoom(room) });
        return send(ws, "state_snapshot", roomSnapshot(room));
      }

      if (type === "join_room") {
        const room = rooms.get(String(msg.roomId || ""));
        if (!room) return send(ws, "error", { code: "ROOM_NOT_FOUND" });

        player.passwordAttempt = String(msg.password || "");
        const result = joinRoom(room, player);

        if (!result.ok) {
          return send(ws, "error", { code: result.error });
        }

        broadcastRoom(room, "player_joined", {
          player: publicPlayer(player),
          room: publicRoom(room)
        });

        send(ws, "joined_room", { room: publicRoom(room) });
        return send(ws, "state_snapshot", roomSnapshot(room));
      }

      if (type === "leave_room") {
        leaveRoom(player);
        return send(ws, "left_room", {});
      }

      if (type === "ready") {
        player.ready = !!msg.ready;
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return;

        broadcastRoom(room, "player_update", {
          player: publicPlayer(player),
          room: publicRoom(room)
        });
        return;
      }

      if (type === "start_game") {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return send(ws, "error", { code: "NOT_IN_ROOM" });
        if (room.hostId !== player.id) {
          return send(ws, "error", { code: "NOT_HOST" });
        }

        room.state.started = true;
        room.state.gameTime = 0;
        room.state.tick = 0;

        return broadcastRoom(room, "game_started", {
          state: room.state,
          room: publicRoom(room)
        });
      }

      // Generic authoritative state update.
      // The game client can send only the changed part:
      // {type:"state_patch", patch:{players,units,buildings,...}}
      if (type === "state_patch") {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return send(ws, "error", { code: "NOT_IN_ROOM" });

        const patch = msg.patch && typeof msg.patch === "object" ? msg.patch : {};
        const allowed = ["players", "units", "buildings", "projectiles", "effects"];

        for (const key of allowed) {
          if (patch[key] !== undefined) room.state[key] = patch[key];
        }

        room.state.tick++;
        room.state.serverTime = Date.now();

        return broadcastRoom(room, "state_patch", {
          from: player.id,
          tick: room.state.tick,
          serverTime: room.state.serverTime,
          patch
        }, ws);
      }

      // Event relay for shooting, construction, damage, extraction, etc.
      if (type === "game_event") {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return send(ws, "error", { code: "NOT_IN_ROOM" });

        return broadcastRoom(room, "game_event", {
          from: player.id,
          event: msg.event || {},
          serverTime: Date.now()
        }, null);
      }

      if (type === "ping") {
        return send(ws, "pong", {
          clientTime: msg.clientTime || null,
          serverTime: Date.now()
        });
      }

      send(ws, "error", {
        code: "UNKNOWN_MESSAGE",
        message: `Unknown message type: ${type}`
      });
    } catch (err) {
      console.error("message error", err);
      send(ws, "error", { code: "SERVER_ERROR", message: "Server error" });
    }
  });

  ws.on("close", () => {
    leaveRoom(player);
    sockets.delete(player.id);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

// Heartbeat for stale connections.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tank Game Server listening on port ${PORT}`);
});
