/*
 * TANK GAME — AUTHORITATIVE PvP SERVER
 * ------------------------------------
 * Responsibilities:
 *  - One authoritative room per match, max 2 players.
 *  - Room creation/joining and Quick Match.
 *  - Server-controlled ready/start state.
 *  - Server-controlled player identity and ownership.
 *  - State validation / anti-cheat checks.
 *  - Rate limiting and payload-size limits.
 *  - Heartbeat / dead-connection cleanup.
 *  - Relays only validated state to the opponent.
 *
 * IMPORTANT:
 * The current browser game still simulates movement/combat locally and
 * periodically sends snapshots. This server validates those snapshots.
 * A mathematically/physically fully authoritative game would additionally
 * require the browser client to send commands (move/attack/build/buy)
 * instead of sending simulation state. This server is designed so that
 * upgrade can be added without replacing the lobby protocol.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const WS_PATH = process.env.WS_PATH || '/ws';
const MAX_PAYLOAD = 64 * 1024;
const MAX_PLAYERS_PER_ROOM = 2;
const ROOM_TTL_MS = 10 * 60 * 1000;
const PRESENCE_TTL_MS = 45 * 1000;
const STATE_MIN_INTERVAL_MS = 70;
const MAX_STATE_RATE = 15;
const WORLD_LIMIT = 5000;

const UNIT_LIMITS = Object.freeze({
  infantry: 80,
  normal: 50,
  rocket: 20,
  ambulance: 10,
  scout: 10,
  builder: 10
});

const clients = new Map();       // id -> Client
const rooms = new Map();         // code -> Room
const matchQueue = [];           // client ids waiting for quick match

function now() { return Date.now(); }

function makeId(prefix = 'p') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(code)) return code;
  }
}

function cleanText(value, max = 18) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max) || 'Commander';
}

function safeColor(value) {
  const s = String(value ?? '');
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '#168cff';
}

function safeColorName(value) {
  return cleanText(value, 12).toUpperCase();
}

function send(ws, obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function error(ws, message, code = 'RULE_VIOLATION') {
  send(ws, { type: 'room_error', code, message });
}

function roomPlayers(room) {
  return room.players.map(id => clients.get(id)).filter(Boolean);
}

function publicPlayer(c) {
  return {
    id: c.id,
    name: c.name,
    ready: !!c.ready,
    role: c.role,
    settings: {
      money: c.settings.money,
      color: c.settings.color,
      colorName: c.settings.colorName
    }
  };
}

function publicRoom(room) {
  return {
    room: room.code,
    started: room.started,
    players: roomPlayers(room).map(publicPlayer)
  };
}

function broadcastRoom(room, payload, exceptId = null) {
  for (const id of room.players) {
    if (id === exceptId) continue;
    const c = clients.get(id);
    if (c) send(c.ws, payload);
  }
}

function broadcastRoomUpdate(room) {
  const payload = { type: 'room_update', ...publicRoom(room) };
  broadcastRoom(room, payload);
}

function leaveRoom(c, reason = 'left') {
  if (!c.roomCode) return;
  const room = rooms.get(c.roomCode);
  c.roomCode = null;
  c.role = null;
  c.ready = false;
  c.started = false;
  if (!room) return;

  room.players = room.players.filter(id => id !== c.id);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  // If host leaves, the remaining player becomes host.
  if (room.hostId === c.id) {
    room.hostId = room.players[0];
    const newHost = clients.get(room.hostId);
    if (newHost) newHost.role = 'host';
  }

  // A match is no longer active if a player leaves.
  room.started = false;
  room.lastActivity = now();

  const other = roomPlayers(room)[0];
  if (other) {
    other.ready = false;
    other.started = false;
    send(other.ws, { type: 'peer_left', reason });
    broadcastRoomUpdate(room);
  }
}

function createRoom(c, msg) {
  if (c.roomCode) {
    error(c.ws, 'أنت داخل غرفة بالفعل. غادر الغرفة أولًا.', 'ALREADY_IN_ROOM');
    return;
  }

  const room = {
    code: makeRoomCode(),
    hostId: c.id,
    players: [c.id],
    started: false,
    createdAt: now(),
    lastActivity: now()
  };

  applySettings(c, msg.settings);
  c.name = cleanText(msg.name);
  c.role = 'host';
  c.roomCode = room.code;
  c.ready = false;
  c.started = false;

  rooms.set(room.code, room);
  send(c.ws, { type: 'room_created', ...publicRoom(room), role: 'host' });
}

function joinRoom(c, msg) {
  if (c.roomCode) {
    error(c.ws, 'أنت داخل غرفة بالفعل.', 'ALREADY_IN_ROOM');
    return;
  }

  const code = cleanText(msg.room, 6).toUpperCase();
  const room = rooms.get(code);

  if (!room) {
    error(c.ws, 'الغرفة غير موجودة.', 'ROOM_NOT_FOUND');
    return;
  }
  if (room.started) {
    error(c.ws, 'المعركة بدأت بالفعل.', 'BATTLE_STARTED');
    return;
  }
  if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
    error(c.ws, 'الغرفة ممتلئة — الحد الأقصى لاعبان.', 'ROOM_FULL');
    return;
  }

  applySettings(c, msg.settings);
  c.name = cleanText(msg.name);
  c.role = 'guest';
  c.roomCode = room.code;
  c.ready = false;
  c.started = false;

  room.players.push(c.id);
  room.lastActivity = now();

  for (const p of roomPlayers(room)) {
    send(p.ws, {
      type: 'room_joined',
      ...publicRoom(room),
      role: p.id === room.hostId ? 'host' : 'guest'
    });
  }
}

function applySettings(c, settings) {
  if (!settings || typeof settings !== 'object') return;
  if (Number.isFinite(Number(settings.money))) {
    const money = Math.max(0, Math.min(1000000, Math.floor(Number(settings.money))));
    c.settings.money = money;
  }
  if (settings.color != null) c.settings.color = safeColor(settings.color);
  if (settings.colorName != null) c.settings.colorName = safeColorName(settings.colorName);
}

function updateSettings(c, msg) {
  if (!c.roomCode) {
    applySettings(c, msg.settings);
    return;
  }
  const room = rooms.get(c.roomCode);
  if (!room || room.started) {
    error(c.ws, 'لا يمكن تغيير الإعدادات بعد بدء المعركة.', 'LOCKED_SETTINGS');
    return;
  }

  applySettings(c, msg.settings);
  room.lastActivity = now();
  broadcastRoomUpdate(room);
}

function setReady(c, msg) {
  if (!c.roomCode) {
    error(c.ws, 'ادخل غرفة أولًا.', 'NOT_IN_ROOM');
    return;
  }
  const room = rooms.get(c.roomCode);
  if (!room || room.started) {
    error(c.ws, 'المعركة بدأت ولا يمكن تغيير الجاهزية.', 'BATTLE_STARTED');
    return;
  }

  c.ready = !!msg.ready;
  room.lastActivity = now();
  broadcastRoomUpdate(room);
}

function startBattle(c) {
  if (!c.roomCode) {
    error(c.ws, 'لا توجد غرفة.', 'NOT_IN_ROOM');
    return;
  }

  const room = rooms.get(c.roomCode);
  if (!room) return;

  if (room.hostId !== c.id) {
    error(c.ws, 'فقط صاحب الغرفة يستطيع بدء المعركة.', 'HOST_ONLY');
    return;
  }
  if (room.players.length !== 2) {
    error(c.ws, 'يجب أن يوجد لاعبان بالضبط.', 'NEED_TWO_PLAYERS');
    return;
  }
  if (!roomPlayers(room).every(p => p.ready)) {
    error(c.ws, 'يجب أن يكون اللاعبان في حالة استعداد.', 'PLAYERS_NOT_READY');
    return;
  }

  room.started = true;
  room.lastActivity = now();

  for (const p of roomPlayers(room)) {
    p.started = true;
    p.lastAcceptedState = null;
    p.lastStateAt = 0;
    p.stateViolations = 0;
  }

  send(c.ws, {
    type: 'battle_start',
    room: room.code,
    players: roomPlayers(room).map(publicPlayer),
    serverTime: now()
  });
  const other = roomPlayers(room).find(p => p.id !== c.id);
  if (other) {
    send(other.ws, {
      type: 'battle_start',
      room: room.code,
      players: roomPlayers(room).map(publicPlayer),
      serverTime: now()
    });
  }
}

function validateNumber(n, min, max) {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

function validateUnit(u, ownerId) {
  if (!u || typeof u !== 'object') return false;
  if (typeof u.id !== 'string' || u.id.length > 80) return false;
  if (!u.id.startsWith(ownerId + '_')) return false;

  const type = String(u.type || 'normal');
  if (!Object.prototype.hasOwnProperty.call(UNIT_LIMITS, type)) return false;

  if (!validateNumber(Number(u.x), -WORLD_LIMIT, WORLD_LIMIT)) return false;
  if (!validateNumber(Number(u.z), -WORLD_LIMIT, WORLD_LIMIT)) return false;
  if (!validateNumber(Number(u.yaw || 0), -Math.PI * 100, Math.PI * 100)) return false;

  const hp = Number(u.hp);
  const maxHp = Number(u.maxHp);
  if (!validateNumber(hp, 0, 1000000)) return false;
  if (!validateNumber(maxHp, 1, 1000000)) return false;
  if (hp > maxHp) return false;

  if (u.target != null) {
    if (typeof u.target !== 'object') return false;
    if (!validateNumber(Number(u.target.x), -WORLD_LIMIT, WORLD_LIMIT)) return false;
    if (!validateNumber(Number(u.target.z), -WORLD_LIMIT, WORLD_LIMIT)) return false;
  }
  return true;
}

function validateBuilding(b, ownerId) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || b.id.length > 80) return false;
  if (!b.id.startsWith(ownerId + '_')) return false;
  if (!['factory', 'barracks'].includes(String(b.type))) return false;

  if (!validateNumber(Number(b.x), -WORLD_LIMIT, WORLD_LIMIT)) return false;
  if (!validateNumber(Number(b.z), -WORLD_LIMIT, WORLD_LIMIT)) return false;
  if (!validateNumber(Number(b.yaw || 0), -Math.PI * 100, Math.PI * 100)) return false;

  const hp = Number(b.hp);
  const maxHp = Number(b.maxHp);
  if (!validateNumber(hp, 0, 1000000)) return false;
  if (!validateNumber(maxHp, 1, 1000000)) return false;
  if (hp > maxHp) return false;
  return true;
}

function validateState(c, state) {
  if (!state || typeof state !== 'object') return { ok: false, message: 'حالة لعبة غير صالحة.' };
  if (!Array.isArray(state.units) || !Array.isArray(state.buildings)) {
    return { ok: false, message: 'حالة اللعبة ناقصة.' };
  }

  if (state.units.length > 180) return { ok: false, message: 'عدد الوحدات تجاوز الحد المسموح.' };
  if (state.buildings.length > 30) return { ok: false, message: 'عدد المباني تجاوز الحد المسموح.' };

  const counts = Object.create(null);
  const unitIds = new Set();

  for (const u of state.units) {
    if (!validateUnit(u, c.id)) return { ok: false, message: 'وحدة غير صالحة أو لا تملكها.' };
    if (unitIds.has(u.id)) return { ok: false, message: 'معرّف وحدة مكرر.' };
    unitIds.add(u.id);
    counts[u.type] = (counts[u.type] || 0) + 1;
    if (counts[u.type] > UNIT_LIMITS[u.type]) {
      return { ok: false, message: `تجاوز حد وحدات ${u.type}.` };
    }
  }

  const buildingIds = new Set();
  for (const b of state.buildings) {
    if (!validateBuilding(b, c.id)) return { ok: false, message: 'مبنى غير صالح أو لا تملكه.' };
    if (buildingIds.has(b.id)) return { ok: false, message: 'معرّف مبنى مكرر.' };
    buildingIds.add(b.id);
  }

  const money = Number(state.money);
  if (!validateNumber(money, 0, 100000000)) {
    return { ok: false, message: 'قيمة المال غير صالحة.' };
  }

  const baseHp = Number(state.baseHp);
  if (!validateNumber(baseHp, 0, 100000000)) {
    return { ok: false, message: 'قيمة قاعدة اللاعب غير صالحة.' };
  }

  return { ok: true };
}

function processState(c, msg) {
  if (!c.roomCode) {
    error(c.ws, 'لا توجد مباراة.', 'NOT_IN_ROOM');
    return;
  }
  const room = rooms.get(c.roomCode);
  if (!room || !room.started) {
    error(c.ws, 'المباراة لم تبدأ.', 'BATTLE_NOT_STARTED');
    return;
  }

  const t = now();
  if (t - c.lastStateAt < STATE_MIN_INTERVAL_MS) {
    c.rateViolations++;
    if (c.rateViolations > 12) {
      error(c.ws, 'إرسال الحالة أسرع من المسموح.', 'RATE_LIMIT');
    }
    return;
  }
  c.lastStateAt = t;
  c.rateViolations = Math.max(0, c.rateViolations - 1);

  const result = validateState(c, msg.state);
  if (!result.ok) {
    c.stateViolations++;
    error(c.ws, result.message, 'INVALID_STATE');
    if (c.stateViolations >= 8) {
      send(c.ws, { type: 'room_error', code: 'CHEAT_DETECTED', message: 'تم رفض الاتصال بسبب تكرار حالات غير قانونية.' });
      c.ws.close(1008, 'invalid game state');
    }
    return;
  }

  // Basic monotonic sanity checks: client cannot resurrect a destroyed unit
  // or increase HP without an explicitly supported server mechanic.
  if (c.lastAcceptedState) {
    const oldUnits = new Map(c.lastAcceptedState.units.map(u => [u.id, u]));
    for (const u of msg.state.units) {
      const old = oldUnits.get(u.id);
      if (!old) continue;
      if (Number(u.hp) > Number(old.hp) + 0.001) {
        c.stateViolations++;
        error(c.ws, 'تم رفض زيادة صحة وحدة من جهة العميل.', 'HP_INCREASE_REJECTED');
        return;
      }
    }
  }

  c.lastAcceptedState = {
    units: msg.state.units.map(x => ({ ...x })),
    buildings: msg.state.buildings.map(x => ({ ...x })),
    money: Number(msg.state.money),
    baseHp: Number(msg.state.baseHp),
    color: safeColor(msg.state.color)
  };
  room.lastActivity = t;

  // Server is the only broadcaster. The sender never directly controls the
  // opponent's objects.
  const other = roomPlayers(room).find(p => p.id !== c.id);
  if (other) {
    send(other.ws, {
      type: 'state',
      state: c.lastAcceptedState,
      from: c.id,
      serverTime: t
    });
  }
}

function presenceList() {
  const t = now();
  return [...clients.values()]
    .filter(c => t - c.lastSeen < PRESENCE_TTL_MS)
    .map(c => ({
      id: c.id,
      name: c.name,
      inRoom: !!c.roomCode,
      status: c.started ? 'playing' : (c.roomCode ? 'room' : 'online'),
      settings: c.settings
    }));
}

function sendPresence() {
  const payload = { type: 'presence_list', players: presenceList() };
  for (const c of clients.values()) send(c.ws, payload);
}

function sendRooms(c) {
  const list = [...rooms.values()]
    .filter(r => !r.started && r.players.length < MAX_PLAYERS_PER_ROOM)
    .map(r => ({
      room: r.code,
      players: roomPlayers(r).map(publicPlayer),
      slots: MAX_PLAYERS_PER_ROOM - r.players.length
    }));
  send(c.ws, { type: 'rooms', rooms: list });
}

function enqueueQuickMatch(c) {
  if (c.roomCode) {
    error(c.ws, 'أنت داخل غرفة بالفعل.', 'ALREADY_IN_ROOM');
    return;
  }

  // Remove duplicate queue entries.
  while (matchQueue.includes(c.id)) {
    matchQueue.splice(matchQueue.indexOf(c.id), 1);
  }

  matchQueue.push(c.id);

  while (matchQueue.length >= 2) {
    const aId = matchQueue.shift();
    const bId = matchQueue.shift();
    const a = clients.get(aId), b = clients.get(bId);
    if (!a || !b || a.roomCode || b.roomCode) continue;

    const room = {
      code: makeRoomCode(),
      hostId: a.id,
      players: [a.id, b.id],
      started: false,
      createdAt: now(),
      lastActivity: now(),
      quickMatch: true
    };

    a.roomCode = room.code; a.role = 'host'; a.ready = false;
    b.roomCode = room.code; b.role = 'guest'; b.ready = false;
    rooms.set(room.code, room);

    for (const p of [a, b]) {
      send(p.ws, {
        type: 'room_joined',
        ...publicRoom(room),
        role: p.role,
        quickMatch: true
      });
    }
  }

  sendPresence();
}

function handleMessage(c, raw) {
  c.lastSeen = now();

  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    error(c.ws, 'رسالة غير صالحة.', 'BAD_JSON');
    return;
  }

  if (!msg || typeof msg.type !== 'string' || msg.type.length > 40) {
    error(c.ws, 'نوع رسالة غير صالح.', 'BAD_MESSAGE');
    return;
  }

  switch (msg.type) {
    case 'presence':
      if (msg.name) c.name = cleanText(msg.name);
      applySettings(c, msg.settings);
      sendPresence();
      break;

    case 'get_rooms':
      sendRooms(c);
      break;

    case 'quick_match':
      if (msg.name) c.name = cleanText(msg.name);
      applySettings(c, msg.settings);
      enqueueQuickMatch(c);
      break;

    case 'create_room':
      createRoom(c, msg);
      sendPresence();
      break;

    case 'join_room':
      joinRoom(c, msg);
      sendPresence();
      break;

    case 'settings':
      updateSettings(c, msg);
      break;

    case 'ready':
      setReady(c, msg);
      break;

    case 'start_battle':
      startBattle(c);
      break;

    case 'state':
      processState(c, msg);
      break;

    case 'leave_room':
      leaveRoom(c, 'left');
      sendPresence();
      break;

    // Invitation messages are intentionally room-only. They never bypass
    // the same two-player and ready-state rules.
    case 'invite':
      handleInvite(c, msg);
      break;

    case 'accept_invite':
      joinRoom(c, { type: 'join_room', room: msg.room, name: msg.name, settings: msg.settings });
      sendPresence();
      break;

    case 'reject_invite':
      break;

    default:
      error(c.ws, 'أمر غير مسموح به من العميل.', 'UNKNOWN_COMMAND');
  }
}

function handleInvite(c, msg) {
  if (!msg.targetId) {
    error(c.ws, 'لاعب الدعوة غير محدد.', 'BAD_TARGET');
    return;
  }
  const target = clients.get(String(msg.targetId));
  if (!target) {
    error(c.ws, 'اللاعب غير متصل.', 'TARGET_OFFLINE');
    return;
  }
  if (target.roomCode || c.roomCode) {
    error(c.ws, 'لا يمكن إرسال الدعوة أثناء الانشغال بغرفة.', 'PLAYER_BUSY');
    return;
  }

  send(target.ws, {
    type: 'invite',
    inviteId: makeId('inv'),
    room: c.roomCode || null,
    fromId: c.id,
    fromName: c.name,
    settings: c.settings
  });
  send(c.ws, { type: 'invite_sent', name: target.name });
}

function removeClient(c) {
  clients.delete(c.id);
  while (matchQueue.includes(c.id)) {
    matchQueue.splice(matchQueue.indexOf(c.id), 1);
  }
  leaveRoom(c, 'disconnect');
  sendPresence();
}

function cleanup() {
  const t = now();

  for (const [id, c] of clients) {
    if (t - c.lastSeen > PRESENCE_TTL_MS * 2) {
      try { c.ws.terminate(); } catch {}
      removeClient(c);
    }
  }

  for (const [code, room] of rooms) {
    if (room.players.length === 0 || t - room.lastActivity > ROOM_TTL_MS) {
      for (const id of room.players) {
        const c = clients.get(id);
        if (c) {
          c.roomCode = null;
          c.role = null;
          c.ready = false;
          c.started = false;
        }
      }
      rooms.delete(code);
    }
  }

  sendPresence();
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    const body = JSON.stringify({
      ok: true,
      service: 'tank-game-authoritative-server',
      rooms: rooms.size,
      players: clients.size,
      queue: matchQueue.length,
      time: new Date().toISOString()
    });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(body);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

const wss = new WebSocketServer({
  server: httpServer,
  path: WS_PATH,
  maxPayload: MAX_PAYLOAD,
  perMessageDeflate: false
});

wss.on('connection', (ws, req) => {
  const c = {
    id: makeId('p'),
    ws,
    ip: req.socket.remoteAddress || '',
    name: 'Commander',
    role: null,
    roomCode: null,
    ready: false,
    started: false,
    lastSeen: now(),
    lastStateAt: 0,
    lastAcceptedState: null,
    rateViolations: 0,
    stateViolations: 0,
    settings: {
      money: 3000,
      color: '#168cff',
      colorName: 'BLUE'
    }
  };

  clients.set(c.id, c);
  ws.isAlive = true;

  send(ws, {
    type: 'hello',
    id: c.id,
    serverTime: now(),
    rules: {
      maxPlayersPerRoom: MAX_PLAYERS_PER_ROOM,
      stateMinIntervalMs: STATE_MIN_INTERVAL_MS,
      quickMatch: true,
      authoritativeValidation: true
    }
  });

  ws.on('pong', () => {
    ws.isAlive = true;
    c.lastSeen = now();
  });

  ws.on('message', data => {
    if (Buffer.byteLength(data) > MAX_PAYLOAD) {
      error(ws, 'حجم الرسالة كبير جدًا.', 'PAYLOAD_TOO_LARGE');
      return;
    }
    handleMessage(c, data);
  });

  ws.on('close', () => removeClient(c));
  ws.on('error', () => {});
  sendPresence();
});

const heartbeat = setInterval(() => {
  for (const c of clients.values()) {
    if (c.ws.isAlive === false) {
      try { c.ws.terminate(); } catch {}
      continue;
    }
    c.ws.isAlive = false;
    try { c.ws.ping(); } catch {}
  }
  cleanup();
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Tank Game server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}${WS_PATH}`);
});
