const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    game: "TANK COMMAND",
    status: "online",
    rooms: rooms.size,
    players: io.engine.clientsCount
  });
});

// rooms:
// roomId -> {
//   hostId: string,
//   started: boolean,
//   createdAt: number,
//   players: Map<socketId, player>
// }
const rooms = new Map();

function cleanRoomId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
}

function makePlayer(socket, roomId) {
  return {
    id: socket.id,
    roomId,

    // World state
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,

    // Gameplay state
    health: 100,
    maxHealth: 100,
    alive: true,

    // Optional lobby data
    name: `Player ${socket.id.slice(-4)}`,
    color: null
  };
}

function serializePlayer(player) {
  return {
    id: player.id,
    x: player.x,
    y: player.y,
    z: player.z,
    rotY: player.rotY,
    health: player.health,
    maxHealth: player.maxHealth,
    alive: player.alive,
    name: player.name,
    color: player.color
  };
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getPlayerRoom(socket) {
  const roomId = socket.data.roomId;
  return roomId ? rooms.get(roomId) : null;
}

function leaveCurrentRoom(socket, notify = true) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  socket.data.roomId = null;

  if (!room) return;

  room.players.delete(socket.id);

  if (notify) {
    socket.to(roomId).emit("playerDisconnected", socket.id);
  }

  // Pick a new host if the old host left.
  if (room.hostId === socket.id) {
    const nextPlayer = room.players.values().next().value;
    room.hostId = nextPlayer ? nextPlayer.id : null;

    if (room.hostId) {
      io.to(roomId).emit("roomHostChanged", {
        hostId: room.hostId
      });
    }
  }

  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else {
    io.to(roomId).emit("roomPlayers", getRoomPlayers(room));
  }
}

function getRoomPlayers(room) {
  const result = {};
  for (const [id, player] of room.players) {
    result[id] = serializePlayer(player);
  }
  return result;
}

function sendRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(roomId).emit("roomPlayers", getRoomPlayers(room));
}

function createOrResetRoom(roomId, socket) {
  let room = rooms.get(roomId);

  if (!room) {
    room = {
      hostId: socket.id,
      started: false,
      createdAt: Date.now(),
      players: new Map()
    };
    rooms.set(roomId, room);
  }

  return room;
}

io.on("connection", (socket) => {
  console.log("CONNECTED:", socket.id);

  socket.emit("serverReady", {
    id: socket.id,
    time: Date.now()
  });

  // -------------------------
  // CREATE ROOM
  // -------------------------
  socket.on("createRoom", (rawRoomId, callback) => {
    const roomId = cleanRoomId(rawRoomId);

    if (!roomId) {
      return reply(callback, {
        ok: false,
        error: "INVALID_ROOM"
      });
    }

    // Do not silently destroy an existing room.
    if (rooms.has(roomId) && rooms.get(roomId).players.size > 0) {
      return reply(callback, {
        ok: false,
        error: "ROOM_EXISTS"
      });
    }

    leaveCurrentRoom(socket, true);

    const room = createOrResetRoom(roomId, socket);
    const player = makePlayer(socket, roomId);

    room.players.set(socket.id, player);
    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.emit("roomJoined", roomId);
    socket.emit("roomInfo", {
      roomId,
      hostId: room.hostId,
      started: room.started
    });

    sendRoomState(room);

    reply(callback, {
      ok: true,
      roomId,
      hostId: room.hostId
    });

    console.log(`ROOM CREATED: ${roomId} by ${socket.id}`);
  });

  // -------------------------
  // JOIN ROOM
  // -------------------------
  socket.on("joinRoom", (rawRoomId, callback) => {
    const roomId = cleanRoomId(rawRoomId);
    const room = rooms.get(roomId);

    if (!room) {
      return reply(callback, {
        ok: false,
        error: "ROOM_NOT_FOUND"
      });
    }

    if (room.players.size >= 2) {
      return reply(callback, {
        ok: false,
        error: "ROOM_FULL"
      });
    }

    leaveCurrentRoom(socket, true);

    const player = makePlayer(socket, roomId);
    room.players.set(socket.id, player);

    socket.join(roomId);
    socket.data.roomId = roomId;

    // IMPORTANT:
    // Send the player list before announcing the new player.
    socket.emit("currentPlayers", getRoomPlayers(room));

    socket.emit("roomJoined", roomId);
    socket.emit("roomInfo", {
      roomId,
      hostId: room.hostId,
      started: room.started
    });

    socket.to(roomId).emit("newPlayer", serializePlayer(player));
    sendRoomState(room);

    reply(callback, {
      ok: true,
      roomId,
      hostId: room.hostId
    });

    console.log(`PLAYER JOINED: ${socket.id} -> ${roomId}`);
  });

  // -------------------------
  // SET PLAYER INFO
  // Optional for future lobby:
  // name + color
  // -------------------------
  socket.on("setPlayerInfo", (data, callback) => {
    const room = getPlayerRoom(socket);
    const player = room?.players.get(socket.id);

    if (!player || !data) {
      return reply(callback, { ok: false, error: "NOT_IN_ROOM" });
    }

    if (typeof data.name === "string") {
      const name = data.name.trim().slice(0, 20);
      if (name) player.name = name;
    }

    if (typeof data.color === "string") {
      player.color = data.color.slice(0, 32);
    }

    io.to(room.hostId).emit("playerInfoChanged", serializePlayer(player));
    socket.to(player.roomId).emit("playerInfoChanged", serializePlayer(player));

    reply(callback, {
      ok: true,
      player: serializePlayer(player)
    });
  });

  // -------------------------
  // START GAME
  // -------------------------
  socket.on("startGame", (callback) => {
    const room = getPlayerRoom(socket);
    if (!room) {
      return reply(callback, {
        ok: false,
        error: "NOT_IN_ROOM"
      });
    }

    if (room.hostId !== socket.id) {
      return reply(callback, {
        ok: false,
        error: "NOT_HOST"
      });
    }

    room.started = true;

    io.to(socket.data.roomId).emit("gameStarted", {
      roomId: socket.data.roomId,
      players: getRoomPlayers(room),
      startedAt: Date.now()
    });

    reply(callback, { ok: true });
  });

  // -------------------------
  // PLAYER MOVE
  // -------------------------
  socket.on("playerMove", (data) => {
    const room = getPlayerRoom(socket);
    const player = room?.players.get(socket.id);

    if (!player || !data) return;

    const x = Number(data.x);
    const y = Number(data.y);
    const z = Number(data.z);
    const rotY = Number(data.rotY);

    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      Number.isFinite(rotY)
    ) {
      // Basic server-side sanity limits.
      player.x = clamp(x, -500, 500);
      player.y = clamp(y, 0, 100);
      player.z = clamp(z, -500, 500);
      player.rotY = clampAngle(rotY);

      socket.to(player.roomId).emit("playerMoved", {
        id: socket.id,
        x: player.x,
        y: player.y,
        z: player.z,
        rotY: player.rotY
      });
    }
  });

  // -------------------------
  // PLAYER SHOOT
  // -------------------------
  socket.on("playerShoot", (data) => {
    const room = getPlayerRoom(socket);
    const player = room?.players.get(socket.id);

    if (!player || !data || !player.alive) return;

    const dirX = Number(data.dirX);
    const dirZ = Number(data.dirZ);

    if (!Number.isFinite(dirX) || !Number.isFinite(dirZ)) return;

    // Broadcast the firing effect to everybody else.
    socket.to(player.roomId).emit("playerShot", {
      id: socket.id,
      x: player.x,
      y: player.y + 1.5,
      z: player.z,
      dirX,
      dirZ
    });
  });

  // -------------------------
  // DAMAGE PLAYER
  // -------------------------
  socket.on("damagePlayer", (data, callback) => {
    const room = getPlayerRoom(socket);

    if (!room || !data) {
      return reply(callback, { ok: false, error: "NOT_IN_ROOM" });
    }

    const targetId = String(data.targetId || "");
    const target = room.players.get(targetId);

    if (!target || !target.alive) {
      return reply(callback, { ok: false, error: "TARGET_NOT_FOUND" });
    }

    // Never trust arbitrary damage values from the browser.
    const requestedDamage = Number(data.damage);
    const damage = clamp(
      Number.isFinite(requestedDamage) ? requestedDamage : 25,
      1,
      100
    );

    target.health = Math.max(0, target.health - damage);

    io.to(targetId).emit("playerDamaged", {
      attackerId: socket.id,
      targetId,
      damage,
      health: target.health,
      maxHealth: target.maxHealth
    });

    io.to(room.hostId).emit("playerHealthChanged", {
      id: targetId,
      health: target.health,
      maxHealth: target.maxHealth
    });

    if (target.health <= 0) {
      target.alive = false;

      io.to(room.hostId).emit("playerKilled", {
        attackerId: socket.id,
        targetId
      });

      io.to(roomIdOf(target)).emit("playerDied", {
        id: targetId
      });
    }

    reply(callback, {
      ok: true,
      targetId,
      health: target.health
    });
  });

  // -------------------------
  // RESPAWN
  // -------------------------
  socket.on("respawnPlayer", (callback) => {
    const room = getPlayerRoom(socket);
    const player = room?.players.get(socket.id);

    if (!player) {
      return reply(callback, { ok: false, error: "NOT_IN_ROOM" });
    }

    player.health = player.maxHealth;
    player.alive = true;
    player.x = 0;
    player.y = 0;
    player.z = 0;
    player.rotY = 0;

    socket.emit("playerRespawned", serializePlayer(player));
    socket.to(player.roomId).emit("playerRespawned", serializePlayer(player));

    reply(callback, {
      ok: true,
      player: serializePlayer(player)
    });
  });

  // -------------------------
  // LEAVE ROOM
  // -------------------------
  socket.on("leaveRoom", () => {
    leaveCurrentRoom(socket, true);
  });

  // -------------------------
  // DISCONNECT
  // -------------------------
  socket.on("disconnect", (reason) => {
    console.log("DISCONNECTED:", socket.id, reason);
    leaveCurrentRoom(socket, true);
  });
});

function roomIdOf(player) {
  return player.roomId;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampAngle(value) {
  // Keep rotation bounded to avoid huge values.
  return ((value + Math.PI) % (Math.PI * 2)) - Math.PI;
}

function reply(callback, data) {
  if (typeof callback === "function") {
    callback(data);
  }
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`TANK COMMAND SERVER running on port ${PORT}`);
});
