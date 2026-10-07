
const http = require("http");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const TICK = 50;
const MAP_LIMIT = 145;
const PLAYER_MAX_HP = 100;
const SHOT_DAMAGE = 25;
const SHOT_RANGE = 75;
const SHOT_COOLDOWN = 220;

const rooms = new Map();

function id() {
  return crypto.randomBytes(8).toString("hex");
}

function cleanName(v) {
  return String(v || "Player").replace(/[^\w\u0600-\u06FF ._-]/g, "").slice(0, 18) || "Player";
}

function roomState(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z,
    yaw: p.yaw, pitch: p.pitch, hp: p.hp, maxHp: PLAYER_MAX_HP,
    alive: p.alive, color: p.color
  }));
}

function broadcast(room, packet) {
  const data = JSON.stringify(packet);
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}

function createRoom() {
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const room = { code, players: new Map(), started: false };
  rooms.set(code, room);
  return room;
}

function getOrCreateRoom(code) {
  return rooms.get(code) || null;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function validNumber(n, fallback = 0) {
  return Number.isFinite(Number(n)) ? Number(n) : fallback;
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {"content-type":"application/json"});
    return res.end(JSON.stringify({
      ok: true,
      service: "tank-fps-multiplayer",
      rooms: rooms.size,
      time: Date.now()
    }));
  }
  res.writeHead(200, {"content-type":"text/plain; charset=utf-8"});
  res.end("TANK COMMAND multiplayer server is running.");
});

const wss = new WebSocket.Server({ server: httpServer, path: "/ws" });

wss.on("connection", ws => {
  const p = {
    ws, id: id(), name: "Player",
    room: null, x: 0, y: 0, z: 8,
    yaw: 0, pitch: 0, hp: PLAYER_MAX_HP,
    alive: true, color: "#168cff",
    lastShot: 0
  };

  function send(packet) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(packet));
  }

  send({type:"welcome", id:p.id, maxHp:PLAYER_MAX_HP});

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === "create_room") {
      if (p.room) return;
      const room = createRoom();
      p.room = room;
      p.name = cleanName(m.name);
      p.color = m.color || "#168cff";
      room.players.set(p.id, p);
      send({type:"room_created", room:room.code, playerId:p.id});
      broadcast(room, {type:"room_state", room:room.code, players:roomState(room), started:room.started});
      return;
    }

    if (m.type === "join_room") {
      if (p.room) return;
      const room = getOrCreateRoom(String(m.room || "").toUpperCase());
      if (!room) return send({type:"error", code:"ROOM_NOT_FOUND", message:"الغرفة غير موجودة"});
      if (room.players.size >= 16) return send({type:"error", code:"ROOM_FULL", message:"الغرفة ممتلئة"});
      p.room = room;
      p.name = cleanName(m.name);
      p.color = m.color || "#ef3d4e";
      const spawn = room.players.size;
      p.x = ((spawn % 4) - 1.5) * 8;
      p.z = 8 + Math.floor(spawn / 4) * 8;
      room.players.set(p.id, p);
      send({type:"room_joined", room:room.code, playerId:p.id});
      broadcast(room, {type:"room_state", room:room.code, players:roomState(room), started:room.started});
      return;
    }

    if (m.type === "start_game") {
      if (!p.room) return;
      p.room.started = true;
      for (const q of p.room.players.values()) {
        q.hp = PLAYER_MAX_HP;
        q.alive = true;
      }
      broadcast(p.room, {type:"game_started", players:roomState(p.room)});
      return;
    }

    if (m.type === "state") {
      if (!p.room || !p.alive) return;
      p.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, validNumber(m.x, p.x)));
      p.y = Math.max(0, Math.min(30, validNumber(m.y, p.y)));
      p.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, validNumber(m.z, p.z)));
      p.yaw = validNumber(m.yaw, p.yaw);
      p.pitch = validNumber(m.pitch, p.pitch);
      return;
    }

    if (m.type === "shoot") {
      if (!p.room || !p.room.started || !p.alive) return;
      const now = Date.now();
      if (now - p.lastShot < SHOT_COOLDOWN) return;
      p.lastShot = now;

      const target = p.room.players.get(String(m.targetId || ""));
      if (!target || target.id === p.id || !target.alive) return;

      const d = distance(p, target);
      if (d > SHOT_RANGE) return;

      // Server-authoritative hit check. Client cannot directly set target HP.
      const yaw = validNumber(m.yaw, p.yaw);
      const dirX = Math.sin(yaw);
      const dirZ = Math.cos(yaw);
      const tx = target.x - p.x;
      const tz = target.z - p.z;
      const len = Math.hypot(tx, tz) || 1;
      const dot = (tx / len) * dirX + (tz / len) * dirZ;
      if (dot < 0.965) return;

      target.hp = Math.max(0, target.hp - SHOT_DAMAGE);

      broadcast(p.room, {
        type:"shot",
        shooterId:p.id,
        targetId:target.id,
        damage:SHOT_DAMAGE,
        x:target.x, y:target.y, z:target.z
      });

      if (target.hp <= 0) {
        target.alive = false;
        broadcast(p.room, {
          type:"player_died",
          victimId:target.id,
          killerId:p.id,
          message:"لقد خسرت"
        });
      }
      broadcast(p.room, {
        type:"room_state",
        room:p.room.code,
        players:roomState(p.room),
        started:p.room.started
      });
      return;
    }

    if (m.type === "respawn") {
      if (!p.room) return;
      p.hp = PLAYER_MAX_HP;
      p.alive = true;
      p.x = 0; p.y = 0; p.z = 8;
      broadcast(p.room, {type:"player_respawned", player: {
        id:p.id, x:p.x, y:p.y, z:p.z, hp:p.hp, maxHp:PLAYER_MAX_HP, alive:true
      }});
      return;
    }
  });

  ws.on("close", () => {
    if (!p.room) return;
    const room = p.room;
    room.players.delete(p.id);
    broadcast(room, {type:"player_left", playerId:p.id, players:roomState(room)});
    if (room.players.size === 0) rooms.delete(room.code);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started) continue;
    broadcast(room, {type:"snapshot", players:roomState(room), serverTime:Date.now()});
  }
}, TICK);

httpServer.listen(PORT, () => {
  console.log(`TANK COMMAND server listening on port ${PORT}`);
});
