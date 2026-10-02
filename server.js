const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 10000);
const MAX_PLAYERS_PER_ROOM = 2;
const ROOM_TTL_MS = 30 * 60 * 1000;
const STATE_RATE_MS = 50; // 20 state updates/sec
const RECONNECT_GRACE_MS = 60 * 1000;

const app = express();
app.use(cors({ origin: true, methods: ["GET", "POST"] }));
app.use(express.json({ limit: "256kb" }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  pingInterval: 10000,
  pingTimeout: 20000,
  maxHttpBufferSize: 256 * 1024
});

const rooms = new Map();
const socketToRoom = new Map();

function id(prefix = "") {
  return prefix + crypto.randomBytes(5).toString("hex");
}

function cleanName(value) {
  return String(value ?? "Player").trim().slice(0, 24) || "Player";
}

function cleanColor(value, fallback) {
  const s = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function validMoney(value) {
  const n = Number(value);
  return [1000, 2000, 3000, 4000].includes(n) ? n : 3000;
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    ready: p.ready,
    connected: p.connected
  };
}

function publicRoom(room) {
  return {
    roomId: room.id,
    status: room.status,
    settings: room.settings,
    players: room.players.map(publicPlayer),
    createdAt: room.createdAt
  };
}

function createRoom(settings = {}) {
  const room = {
    id: id("room_"),
    status: "waiting",
    createdAt: Date.now(),
    lastActivity: Date.now(),
    settings: {
      money: validMoney(settings.money),
      map: String(settings.map || "default").slice(0, 32),
      maxPlayers: MAX_PLAYERS_PER_ROOM
    },
    players: [],
    state: {
      tick: 0,
      startedAt: null,
      units: {},
      projectiles: {},
      effects: {},
      winner: null,
      snapshots: {}
    },
    lastBroadcast: 0
  };
  rooms.set(room.id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function roomOfSocket(socket) {
  const roomId = socketToRoom.get(socket.id);
  return roomId ? rooms.get(roomId) : null;
}

function emitRoom(room) {
  io.to(room.id).emit("room:update", publicRoom(room));
}

function emitError(socket, code, message) {
  socket.emit("server:error", { code, message });
}

function removePlayerFromRoom(socket, reason = "left") {
  const room = roomOfSocket(socket);
  if (!room) return;
  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;
  socketToRoom.delete(socket.id);
  socket.leave(room.id);
  player.connected = false; player.socketId = null; player.disconnectedAt = Date.now();
  room.lastActivity = Date.now();
  if (room.status === "playing") {
    io.to(room.id).emit("player:disconnected", { playerId: player.id, reason, graceMs: RECONNECT_GRACE_MS });
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      if (player.connected || !player.disconnectedAt || Date.now()-player.disconnectedAt < RECONNECT_GRACE_MS || room.status !== "playing") return;
      const other=room.players.find(p=>p.id!==player.id && p.connected);
      room.state.winner=other?other.id:null; room.status="finished"; room.lastActivity=Date.now();
      io.to(room.id).emit("match:forfeit", { disconnectedPlayerId:player.id, winnerPlayerId:other?other.id:null, reason:"disconnect_timeout", graceMs:RECONNECT_GRACE_MS, state:room.state });
      emitRoom(room);
    }, RECONNECT_GRACE_MS+100);
  } else { room.players=room.players.filter(p=>p.id!==player.id); emitRoom(room); }
}

function findJoinableRoom() {
  for (const room of rooms.values()) {
    const connected = room.players.filter(p => p.connected);
    if (room.status === "waiting" && connected.length < MAX_PLAYERS_PER_ROOM) {
      return room;
    }
  }
  return null;
}

function addPlayer(socket, room, data = {}) {
  if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
    emitError(socket, "ROOM_FULL", "الغرفة ممتلئة.");
    return false;
  }

  const usedColors = new Set(room.players.map(p => p.color));
  let color = cleanColor(data.color, "#168cff");
  if (usedColors.has(color)) color = usedColors.has("#ef4444") ? "#22c55e" : "#ef4444";

  const player = {
    id: id("player_"),
    socketId: socket.id,
    name: cleanName(data.name),
    color,
    ready: false,
    connected: true,
    reconnectToken: id("rt_"),
    lastCommandAt: 0,
    disconnectedAt: null,
    disconnectTimer: null
  };

  room.players.push(player);
  socketToRoom.set(socket.id, room.id);
  socket.join(room.id);
  room.lastActivity = Date.now();

  socket.emit("room:joined", {
    room: publicRoom(room),
    playerId: player.id,
    reconnectToken: player.reconnectToken
  });
  emitRoom(room);
  return true;
}

function startRoom(room) {
  if (room.status !== "waiting") return false;
  if (room.players.length !== MAX_PLAYERS_PER_ROOM) return false;
  if (!room.players.every(p => p.ready && p.connected)) return false;

  room.status = "playing";
  room.state.startedAt = Date.now();
  room.state.tick = 0;
  room.state.snapshots = {};
  room.lastActivity = Date.now();

  // The server owns the match state container. The client is responsible
  // for rendering it; gameplay commands are validated before broadcast.
  io.to(room.id).emit("match:started", {
    room: publicRoom(room),
    state: room.state
  });
  return true;
}

function rateLimit(player) {
  const now = Date.now();
  if (now - player.lastCommandAt < 25) return false;
  player.lastCommandAt = now;
  return true;
}

function validateCommand(command) {
  if (!command || typeof command !== "object") return false;
  if (typeof command.type !== "string") return false;

  const allowed = new Set([
    "move",
    "stop",
    "attack",
    "defend",
    "build",
    "buy",
    "capture",
    "select",
    "ping"
  ]);
  if (!allowed.has(command.type)) return false;

  if (command.payload && typeof command.payload !== "object") return false;
  return true;
}

io.on("connection", socket => {
  socket.emit("server:hello", {
    version: "1.0.0",
    protocol: 1,
    serverTime: Date.now()
  });

  socket.on("room:reconnect", data => {
    if (roomOfSocket(socket)) return emitError(socket,"ALREADY_IN_ROOM","أنت داخل غرفة بالفعل.");
    const token=String(data?.reconnectToken||""); let room=null, player=null;
    for (const r of rooms.values()){ const p=r.players.find(x=>x.reconnectToken===token); if(p){room=r;player=p;break;} }
    if(!room||!player) return emitError(socket,"RECONNECT_NOT_FOUND","انتهت مهلة العودة إلى المباراة.");
    if(player.connected) return emitError(socket,"RECONNECT_ACTIVE","اللاعب ما زال متصلاً.");
    if(!player.disconnectedAt || Date.now()-player.disconnectedAt>RECONNECT_GRACE_MS) return emitError(socket,"RECONNECT_EXPIRED","انتهت مهلة العودة.");
    if(player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer=null; player.connected=true; player.socketId=socket.id; player.disconnectedAt=null;
    socketToRoom.set(socket.id,room.id); socket.join(room.id); room.lastActivity=Date.now();
    socket.emit("room:reconnected",{room:publicRoom(room),playerId:player.id,reconnectToken:player.reconnectToken,state:room.state});
    const opponent=room.players.find(p=>p.id!==player.id);
    socket.emit("match:resume",{room:publicRoom(room),playerId:player.id,opponentSnapshot:opponent?room.state.snapshots?.[opponent.id]||null:null});
    socket.to(room.id).emit("player:reconnected",{playerId:player.id}); emitRoom(room);
  });

  socket.on("room:create", data => {
    if (roomOfSocket(socket)) {
      emitError(socket, "ALREADY_IN_ROOM", "أنت داخل غرفة بالفعل.");
      return;
    }
    const room = createRoom(data || {});
    addPlayer(socket, room, data || {});
  });

  socket.on("room:join", data => {
    if (roomOfSocket(socket)) {
      emitError(socket, "ALREADY_IN_ROOM", "أنت داخل غرفة بالفعل.");
      return;
    }
    const roomId = String(data?.roomId || "").trim();
    const room = getRoom(roomId);

    if (!room) {
      emitError(socket, "ROOM_NOT_FOUND", "الغرفة غير موجودة.");
      return;
    }
    if (room.status !== "waiting") {
      emitError(socket, "MATCH_ALREADY_STARTED", "المباراة بدأت بالفعل.");
      return;
    }
    addPlayer(socket, room, data || {});
  });

  socket.on("room:quick-match", data => {
    if (roomOfSocket(socket)) {
      emitError(socket, "ALREADY_IN_ROOM", "أنت داخل غرفة بالفعل.");
      return;
    }
    let room = findJoinableRoom();
    if (!room) room = createRoom(data || {});
    addPlayer(socket, room, data || {});
  });

  socket.on("room:ready", value => {
    const room = roomOfSocket(socket);
    if (!room || room.status !== "waiting") return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.ready = Boolean(value);
    room.lastActivity = Date.now();
    emitRoom(room);

    if (startRoom(room)) {
      emitRoom(room);
    }
  });

  socket.on("room:update-settings", data => {
    const room = roomOfSocket(socket);
    if (!room || room.status !== "waiting") return;
    const player = room.players[0];
    if (!player || player.id !== socket.id) return;

    if (data && data.money !== undefined) room.settings.money = validMoney(data.money);
    if (data && data.map !== undefined) room.settings.map = String(data.map).slice(0, 32);
    room.lastActivity = Date.now();
    emitRoom(room);
  });

  socket.on("match:command", command => {
    const room = roomOfSocket(socket);
    if (!room || room.status !== "playing") return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.connected || !rateLimit(player)) return;
    if (!validateCommand(command)) {
      emitError(socket, "INVALID_COMMAND", "أمر لعب غير صالح.");
      return;
    }

    const event = {
      playerId: player.id,
      tick: room.state.tick,
      command: {
        type: command.type,
        payload: command.payload || {}
      },
      serverTime: Date.now()
    };

    // Relay the validated command to both clients.
    // To make the simulation fully authoritative later, apply the same
    // command here to room.state before broadcasting state snapshots.
    io.to(room.id).emit("match:command", event);
  });

  socket.on("match:state", snapshot => {
    const room = roomOfSocket(socket);
    if (!room || room.status !== "playing") return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.connected || !rateLimit(player)) return;

    // Only accept JSON-like bounded state snapshots from the active client.
    // This prevents accidental huge payloads and keeps the server stable.
    if (!snapshot || typeof snapshot !== "object") return;

    const json = JSON.stringify(snapshot);
    if (json.length > 180000) {
      emitError(socket, "STATE_TOO_LARGE", "حالة المباراة كبيرة جدًا.");
      return;
    }

    room.state.tick = Number(snapshot.tick) || room.state.tick + 1;
    room.state.snapshots[player.id] = {playerId:player.id,snapshot};
    room.lastActivity = Date.now();
    socket.to(room.id).emit("match:state", {playerId:player.id,snapshot,serverTime:Date.now()});
  });

  socket.on("match:end", data => {
    const room = roomOfSocket(socket);
    if (!room || room.status !== "playing") return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const winner = data?.winner === "player" || data?.winner === "enemy"
      ? data.winner
      : null;

    room.state.winner = winner;
    room.status = "finished";
    room.lastActivity = Date.now();

    io.to(room.id).emit("match:ended", {
      winner,
      state: room.state
    });
    emitRoom(room);
  });

  socket.on("match:ping", () => {
    socket.emit("match:pong", { serverTime: Date.now() });
  });

  socket.on("room:leave", () => {
    removePlayerFromRoom(socket, "left");
  });

  socket.on("disconnect", reason => {
    removePlayerFromRoom(socket, reason);
  });
});

// Broadcast a compact server tick. This gives clients a common clock and
// allows future authoritative simulation to be added without changing the
// client protocol.
setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (room.status !== "playing") continue;

    room.state.tick += 1;
    room.lastActivity = now;

    if (now - room.lastBroadcast >= STATE_RATE_MS) {
      room.lastBroadcast = now;
      io.to(room.id).emit("match:tick", {
        tick: room.state.tick,
        serverTime: now
      });
    }
  }
}, STATE_RATE_MS);

// Cleanup abandoned rooms.
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    const connected = room.players.some(p => p.connected);
    if (!connected && now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(roomId);
    }
  }
}, 60_000);

app.get("/", (_req, res) => {
  res.json({
    name: "Tank Game Multiplayer Server",
    status: "online",
    protocol: 1,
    rooms: rooms.size,
    time: Date.now()
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    rooms: rooms.size,
    time: Date.now()
  });
});

app.get("/rooms", (_req, res) => {
  res.json({
    rooms: [...rooms.values()].map(publicRoom)
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Tank Game server listening on port ${PORT}`);
});
