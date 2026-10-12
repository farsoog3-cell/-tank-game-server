'use strict';
// CONTROL BATTLE Fully Authoritative WebSocket Match Server
// Computes movement, combat, economy, construction, and unit training on the server.

const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 10000);
const TICK_MS = 100; // 10 ticks per second
const DISCONNECT_GRACE_MS = 10 * 60 * 1000;
const ROOM_TTL_MS = 30 * 60 * 1000;

const rooms = new Map();
const clients = new Map();

const uid = (p = '') => `${p}${crypto.randomBytes(6).toString('hex')}`;
const now = () => Date.now();
const cleanName = (v, f = 'لاعب') => String(v ?? f).replace(/[<>]/g, '').trim().slice(0, 28) || f;
const cleanColor = (v, f = '#168cff') => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : f;
const num = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;

// Catalog of units and costs
const UNIT_TYPES = {
  normal: { cost: 100, hp: 500, range: 12, damage: 15, speed: 8.0, buildTimeMs: 4000 },
  infantry: { cost: 150, hp: 400, range: 10, damage: 20, speed: 9.5, buildTimeMs: 3000 },
  rocket: { cost: 250, hp: 650, range: 18, damage: 35, speed: 6.5, buildTimeMs: 6000 }
};

const BUILDING_TYPES = {
  barracks: { cost: 300, hp: 1200, buildTimeMs: 10000 },
  factory: { cost: 500, hp: 2000, buildTimeMs: 15000 }
};

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (_) {}
  }
}

function roomOf(client) { return client?.roomId ? rooms.get(client.roomId) : null; }

function publicRoom(r) {
  return { id: r.id, name: r.name, money: r.money, players: r.players.length, maxPlayers: 2, started: r.started };
}

function publicState(r) {
  return {
    id: r.id,
    name: r.name,
    money: r.money,
    hostId: r.hostId,
    started: r.started,
    players: r.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      connected: !!p.ws
    }))
  };
}

function broadcastRoom(r, msg) {
  for (const p of r.players) send(p.ws, msg);
}

function roomList(ws) {
  send(ws, { type: 'rooms', rooms: [...rooms.values()].filter(r => !r.started && r.players.some(p => p.ws)).map(publicRoom) });
}

function emitState(r) {
  if (!r.started) return;
  const packet = {
    tick: r.tick,
    serverTime: now(),
    players: r.players.map(p => ({
      id: p.id,
      color: p.color,
      name: p.name,
      connected: !!p.ws,
      state: {
        money: p.money,
        units: p.units,
        buildings: p.buildings,
        base: p.base
      }
    }))
  };
  broadcastRoom(r, { type: 'server_state', state: packet });
}

function makeStart(r, p, resumed = false) {
  const i = r.players.indexOf(p), opp = r.players[1 - i];
  send(p.ws, {
    type: 'game_start',
    roomId: r.id,
    room: publicState(r),
    playerId: i,
    playerSlot: i + 1,
    playerServerId: p.id,
    opponentServerId: opp?.id || null,
    seed: r.seed,
    serverTime: r.startedAt,
    resumeToken: p.resumeToken,
    resumed,
    config: {
      money: r.money,
      player: { id: p.id, color: p.color, colorName: p.name },
      opponent: { id: opp?.id, color: opp?.color || '#ef4444', colorName: opp?.name || 'OPPONENT' }
    }
  });
}

function initPlayerGameState(p, slot, initialMoney) {
  p.money = initialMoney;
  p.units = [];
  p.buildings = [];
  
  // Base coordinates based on player slot
  const startX = slot === 0 ? -40 : 40;
  const startZ = slot === 0 ? -40 : 40;
  
  p.base = { id: `base_${p.id}`, x: startX, z: startZ, hp: 3000, maxHp: 3000 };
  
  // Add initial builder unit
  p.units.push({
    id: `unit_${p.id}_builder`,
    type: 'builder',
    builder: true,
    x: startX + 5,
    z: startZ + 5,
    rot: 0,
    hp: 300,
    maxHp: 300,
    target: null,
    attackTargetId: null
  });
}

function startIfReady(r) {
  if (r.started || r.players.length !== 2 || !r.players.every(p => p.ready && p.ws)) return;
  r.started = true;
  r.seed = crypto.randomBytes(4).readUInt32BE(0);
  r.startedAt = now();
  r.lastActivity = now();
  r.tick = 0;

  r.players.forEach((p, idx) => {
    initPlayerGameState(p, idx, r.money);
    makeStart(r, p, false);
  });

  emitState(r);
}

function detach(ws, reason = 'disconnect') {
  const c = clients.get(ws);
  if (!c) return;
  const r = roomOf(c);
  clients.delete(ws);
  if (!r) return;

  const p = r.players.find(x => x.id === c.playerId) || r.players.find(x => x.ws === ws);
  if (!p) return;

  p.ws = null;
  p.disconnectedAt = now();
  r.lastActivity = now();

  if (r.started) {
    broadcastRoom(r, { type: 'peer_message', payload: { kind: 'player_connection', playerId: p.id, connected: false, reason, at: now() } });
    emitState(r);
  } else {
    r.players = r.players.filter(x => x !== p);
    if (!r.players.length) rooms.delete(r.id);
    else {
      if (r.hostId === p.id) r.hostId = r.players[0].id;
      broadcastRoom(r, { type: 'room_state', room: publicState(r) });
    }
  }
}

function createRoom(client, msg) {
  const r = {
    id: uid('room_'),
    name: cleanName(msg.name, 'معركة جماعية'),
    money: Math.max(1000, Math.min(10000, num(msg.money, 1000))),
    hostId: client.id,
    players: [],
    started: false,
    seed: 0,
    startedAt: 0,
    tick: 0,
    lastActivity: now()
  };

  const p = {
    id: client.id,
    name: cleanName(msg.namePlayer, 'القائد'),
    color: cleanColor(msg.color),
    ready: false,
    ws: client.ws,
    resumeToken: uid('resume_'),
    disconnectedAt: null
  };

  r.players.push(p);
  client.roomId = r.id;
  client.playerId = p.id;
  rooms.set(r.id, r);

  send(client.ws, { type: 'room_created', room: publicState(r) });
  send(client.ws, { type: 'hello', clientId: client.id, resumeToken: p.resumeToken });
  roomList(client.ws);
}

function joinRoom(client, msg) {
  const r = rooms.get(String(msg.roomId || ''));
  if (!r || r.started) { send(client.ws, { type: 'room_error', message: 'الغرفة غير متاحة' }); return; }
  if (r.players.length >= 2) { send(client.ws, { type: 'room_error', message: 'الغرفة ممتلئة' }); return; }

  const p = {
    id: client.id,
    name: cleanName(msg.name, 'اللاعب الثاني'),
    color: cleanColor(msg.color, '#ef4444'),
    ready: false,
    ws: client.ws,
    resumeToken: uid('resume_'),
    disconnectedAt: null
  };

  r.players.push(p);
  client.roomId = r.id;
  client.playerId = p.id;
  r.lastActivity = now();

  send(client.ws, { type: 'room_joined', room: publicState(r) });
  send(client.ws, { type: 'hello', clientId: client.id, resumeToken: p.resumeToken });
  broadcastRoom(r, { type: 'room_state', room: publicState(r) });
}

function resumeRoom(client, msg) {
  const token = String(msg.resumeToken || '');
  let r = null, p = null;
  for (const room of rooms.values()) {
    const found = room.players.find(x => x.resumeToken === token && x.id);
    if (found) { r = room; p = found; break; }
  }

  if (!r || !p || String(msg.roomId || r.id) !== r.id) {
    send(client.ws, { type: 'room_error', message: 'انتهت مهلة استعادة المباراة' });
    return;
  }

  p.ws = client.ws;
  p.disconnectedAt = null;
  client.roomId = r.id;
  client.playerId = p.id;
  r.lastActivity = now();

  send(client.ws, { type: 'hello', clientId: client.id, resumeToken: p.resumeToken });
  if (r.started) {
    makeStart(r, p, true);
    setTimeout(() => emitState(r), 100);
  } else {
    send(client.ws, { type: 'room_joined', room: publicState(r) });
    broadcastRoom(r, { type: 'room_state', room: publicState(r) });
  }
}

// Server-side action processing
function handlePlayerCommand(r, p, cmd) {
  if (!cmd || typeof cmd !== 'object') return;
  const action = String(cmd.action || '');

  // 1. Command to move unit(s)
  if (action === 'move' && Array.isArray(cmd.unitIds) && cmd.target) {
    for (const uid of cmd.unitIds) {
      const u = p.units.find(x => x.id === uid);
      if (u) {
        u.target = { x: num(cmd.target.x), z: num(cmd.target.z) };
        u.attackTargetId = null;
      }
    }
  }

  // 2. Command to build structure
  if (action === 'build' && cmd.buildingType && cmd.position) {
    const type = BUILDING_TYPES[cmd.buildingType];
    if (type && p.money >= type.cost) {
      p.money -= type.cost;
      const bId = `bld_${p.id}_${now()}_${Math.floor(Math.random()*1000)}`;
      p.buildings.push({
        id: bId,
        type: cmd.buildingType,
        x: num(cmd.position.x),
        z: num(cmd.position.z),
        rot: num(cmd.position.rot, 0),
        hp: type.hp,
        maxHp: type.hp,
        done: false,
        progress: 0,
        createdAt: now(),
        durationMs: type.buildTimeMs,
        production: null
      });
    }
  }

  // 3. Command to train/produce units
  if (action === 'train' && cmd.buildingId && cmd.unitType) {
    const b = p.buildings.find(x => x.id === cmd.buildingId && x.done);
    const uConfig = UNIT_TYPES[cmd.unitType];
    if (b && uConfig && !b.production && p.money >= uConfig.cost) {
      p.money -= uConfig.cost;
      b.production = {
        type: cmd.unitType,
        startedAt: now(),
        durationMs: uConfig.buildTimeMs
      };
    }
  }

  // 4. Attack target command
  if (action === 'attack' && Array.isArray(cmd.unitIds) && cmd.targetId) {
    for (const uid of cmd.unitIds) {
      const u = p.units.find(x => x.id === uid);
      if (u) u.attackTargetId = String(cmd.targetId);
    }
  }
}

// Server loop simulation (Combat, Movement, Production)
function tickRoom(r, dt, stamp) {
  if (!r.started) return;
  r.tick++;

  // Passive gold generation
  if (r.tick % 10 === 0) {
    for (const p of r.players) p.money += 5;
  }

  // Helper to find target across opponent units and buildings
  const getAllTargets = (opp) => {
    const list = [];
    if (opp.base && opp.base.hp > 0) list.push(opp.base);
    for (const u of opp.units) if (u.hp > 0) list.push(u);
    for (const b of opp.buildings) if (b.hp > 0) list.push(b);
    return list;
  };

  for (let i = 0; i < r.players.length; i++) {
    const p = r.players[i];
    const opp = r.players[1 - i];

    // --- Building Construction & Unit Training ---
    for (const b of p.buildings) {
      if (!b.done) {
        const elapsed = stamp - b.createdAt;
        b.progress = Math.min(1, elapsed / b.durationMs);
        if (b.progress >= 1) {
          b.done = true;
          b.progress = 1;
        }
      } else if (b.production) {
        const elapsed = stamp - b.production.startedAt;
        if (elapsed >= b.production.durationMs) {
          const type = b.production.type;
          const uConfig = UNIT_TYPES[type] || UNIT_TYPES.normal;
          const uId = `unit_${p.id}_${now()}_${Math.floor(Math.random()*1000)}`;
          
          p.units.push({
            id: uId,
            type: type,
            builder: false,
            x: b.x + Math.sin(b.rot) * 12,
            z: b.z + Math.cos(b.rot) * 12,
            rot: b.rot,
            hp: uConfig.hp,
            maxHp: uConfig.hp,
            target: null,
            attackTargetId: null
          });
          b.production = null;
        }
      }
    }

    // --- Unit Movement & Combat ---
    const oppTargets = opp ? getAllTargets(opp) : [];

    for (const u of p.units) {
      if (u.hp <= 0) continue;
      const uConfig = UNIT_TYPES[u.type] || UNIT_TYPES.normal;

      // 1. Combat & Targeting
      let targetEntity = null;
      if (u.attackTargetId) {
        targetEntity = oppTargets.find(t => t.id === u.attackTargetId);
      } else {
        // Auto-acquire closest target in range
        targetEntity = oppTargets
          .map(t => ({ t, dist: Math.hypot(t.x - u.x, t.z - u.z) }))
          .filter(item => item.dist <= (uConfig.range || 12))
          .sort((a, b) => a.dist - b.dist)[0]?.t;
      }

      if (targetEntity) {
        const dist = Math.hypot(targetEntity.x - u.x, targetEntity.z - u.z);
        if (dist <= uConfig.range) {
          // Deal damage according to tick
          targetEntity.hp -= (uConfig.damage * (dt / 1000));
        } else {
          // Move closer to target
          const dx = targetEntity.x - u.x, dz = targetEntity.z - u.z;
          const step = (uConfig.speed * dt) / 1000;
          u.x += (dx / dist) * step;
          u.z += (dz / dist) * step;
          u.rot = Math.atan2(dx, dz);
        }
      } else if (u.target) {
        // 2. Standard Movement
        const dx = u.target.x - u.x, dz = u.target.z - u.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.0) {
          const step = Math.min(dist, (uConfig.speed * dt) / 1000);
          u.x += (dx / dist) * step;
          u.z += (dz / dist) * step;
          u.rot = Math.atan2(dx, dz);
        } else {
          u.target = null;
        }
      }
    }

    // Cleanup dead units & destroyed buildings
    p.units = p.units.filter(u => u.hp > 0);
    p.buildings = p.buildings.filter(b => b.hp > 0);
  }

  // Broadcast updated server state
  emitState(r);
}

function onMessage(client, msg) {
  const type = String(msg.type || '');
  if (type === 'list_rooms') { roomList(client.ws); return; }
  if (type === 'create_room') {
    if (client.roomId) { const old = roomOf(client); if (old && !old.started) detach(client.ws, 'replace_room'); }
    createRoom(client, msg);
    return;
  }
  if (type === 'join_room') { joinRoom(client, msg); return; }
  if (type === 'resume_room') { resumeRoom(client, msg); return; }

  const r = roomOf(client), p = r && r.players.find(x => x.id === client.playerId);
  if (!r || !p) return;

  if (type === 'set_color') {
    p.color = cleanColor(msg.color, p.color);
    broadcastRoom(r, { type: 'room_state', room: publicState(r) });
    return;
  }
  if (type === 'toggle_ready' && !r.started) {
    p.ready = !p.ready;
    broadcastRoom(r, { type: 'room_state', room: publicState(r) });
    startIfReady(r);
    return;
  }
  if (type === 'leave_room') {
    if (r.started) {
      p.ws = null;
      p.disconnectedAt = now();
      client.roomId = null;
      client.playerId = null;
      broadcastRoom(r, { type: 'peer_message', payload: { kind: 'player_connection', playerId: p.id, connected: false, reason: 'left', at: now() } });
      emitState(r);
    } else detach(client.ws, 'left');
    return;
  }

  // Process game action commands
  if (type === 'game_event' && r.started) {
    const payload = msg.payload;
    if (payload && payload.kind === 'player_command') {
      handlePlayerCommand(r, p, payload.command);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'control-battle-authoritative-server', rooms: rooms.size, clients: clients.size }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server, maxPayload: 1024 * 1024 });

wss.on('connection', ws => {
  const c = { id: uid('c_'), ws, roomId: null, playerId: null };
  clients.set(ws, c);
  send(ws, { type: 'hello', clientId: c.id });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    try { onMessage(c, m); } catch (e) {
      console.error('message error', e);
      send(ws, { type: 'room_error', message: 'حدث خطأ في معالجة طلب الشبكة' });
    }
  });

  ws.on('close', () => detach(ws, 'disconnect'));
  ws.on('error', () => {});
});

// Main Server Game Loop
setInterval(() => {
  const stamp = now();
  for (const r of rooms.values()) {
    if (r.started) {
      tickRoom(r, TICK_MS, stamp);
    } else if (stamp - r.lastActivity > ROOM_TTL_MS && !r.players.some(p => p.ws)) {
      rooms.delete(r.id);
    }
  }
}, TICK_MS);

server.listen(PORT, () => console.log(`CONTROL BATTLE Authoritative Server listening on ${PORT}`));
