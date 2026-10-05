'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 2 * 1024 * 1024 });
const PORT = Number(process.env.PORT || 10000);

// GameRanger-style runtime state: rooms and live matches live in the server itself.
// No Firebase, PostgreSQL, or DATABASE_URL is required.
const rooms = new Map();
const players = new Map();
const SERVER_STARTED_AT = Date.now();
const ROOM_IDLE_MS = 30 * 60 * 1000;
const MAX_ROOMS = 200;
const MAX_PLAYERS_PER_ROOM = 8;

function makeId(prefix) {
  return prefix + crypto.randomBytes(8).toString('hex');
}
function cleanName(v, fallback = 'قائد') {
  const s = String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return s || fallback;
}
function cleanColor(v) {
  const s = String(v || '#168cff').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '#168cff';
}
function hashPassword(v) {
  return crypto.createHash('sha256').update(String(v ?? '')).digest('hex');
}
function send(ws, type, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type, ...data })); } catch (_) {}
  }
}
function broadcast(room, type, data = {}, exceptId = null) {
  for (const p of room.players.values()) {
    if (p.id !== exceptId) send(p.ws, type, data);
  }
}
function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    ready: !!p.ready,
    position: Number.isInteger(p.position) ? p.position : 0,
    connected: !!p.ws && p.ws.readyState === WebSocket.OPEN
  };
}
function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    started: !!room.state.started,
    money: Number(room.state.money) || 3000,
    players: [...room.players.values()].map(publicPlayer),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}
function roomSnapshot(room) {
  return { room: publicRoom(room), state: room.state };
}
function touch(room) { room.updatedAt = Date.now(); }

function createRoom(name, password, maxPlayers, host) {
  if (rooms.size >= MAX_ROOMS) return null;
  const room = {
    id: makeId('room_'),
    name: cleanName(name, 'Battle Room'),
    passwordHash: hashPassword(password || ''),
    maxPlayers: Math.max(2, Math.min(MAX_PLAYERS_PER_ROOM, Number(maxPlayers) || 4)),
    hostId: host.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: new Map(),
    state: {
      started: false,
      tick: 0,
      gameTime: 0,
      money: 3000,
      serverTime: Date.now(),
      players: {},
      units: [],
      buildings: [],
      projectiles: [],
      effects: [],
      lastEvent: null
    }
  };
  rooms.set(room.id, room);
  return room;
}

function leaveRoom(player, reason = 'left') {
  if (!player.roomId) return null;
  const room = rooms.get(player.roomId);
  player.roomId = null;
  player.ready = false;
  if (!room) return null;

  room.players.delete(player.id);
  delete room.state.players[player.id];
  touch(room);

  if (room.hostId === player.id) {
    const next = room.players.values().next().value;
    room.hostId = next ? next.id : null;
    if (next) next.ready = false;
  }

  if (room.players.size === 0) {
    rooms.delete(room.id);
    return room;
  }

  if (room.state.started && room.players.size < 1) room.state.started = false;
  const payload = { room: publicRoom(room), playerId: player.id, reason };
  broadcast(room, 'room_update', payload);
  return room;
}

function joinRoom(room, player, password) {
  if (room.state.started) return { ok: false, error: 'GAME_ALREADY_STARTED' };
  if (room.players.size >= room.maxPlayers) return { ok: false, error: 'ROOM_FULL' };
  if (room.passwordHash !== hashPassword(password || '')) return { ok: false, error: 'BAD_PASSWORD' };

  if (player.roomId) leaveRoom(player, 'switch_room');
  room.players.set(player.id, player);
  player.roomId = room.id;
  player.ready = false;
  if (!Number.isInteger(player.position)) player.position = Math.min(room.players.size - 1, 3);
  room.state.players[player.id] = {
    id: player.id, name: player.name, color: player.color,
    position: player.position, x: 0, z: 0, hp: 100
  };
  touch(room);
  return { ok: true };
}

function listRooms() {
  return [...rooms.values()]
    .filter(r => !r.state.started && r.players.size < r.maxPlayers)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map(publicRoom);
}

function errorText(code) {
  return ({
    ROOM_FULL: 'الغرفة ممتلئة.',
    BAD_PASSWORD: 'كلمة مرور الغرفة غير صحيحة.',
    ROOM_NOT_FOUND: 'الغرفة غير موجودة.',
    GAME_ALREADY_STARTED: 'المعركة بدأت بالفعل.',
    NOT_IN_ROOM: 'أنت لست داخل غرفة.',
    NOT_HOST: 'فقط قائد الغرفة يستطيع تنفيذ هذا الأمر.',
    NEED_TWO_PLAYERS: 'يجب وجود لاعبين على الأقل.',
    NOT_ALL_READY: 'يجب أن يكون جميع اللاعبين جاهزين.',
    BAD_JSON: 'بيانات غير صالحة من اللعبة.',
    UNKNOWN_MESSAGE: 'أمر غير معروف.'
  }[code] || 'حدث خطأ في سيرفر اللعبة.');
}
function sendError(ws, code, message) {
  send(ws, 'error', { code, message: message || errorText(code) });
}

app.get('/', (req, res) => res.json({
  ok: true,
  service: 'Tank Game GameRanger Server',
  database: false,
  websocket: '/ws',
  rooms: rooms.size,
  players: [...players.values()].filter(p => p.ws?.readyState === WebSocket.OPEN).length,
  uptime: process.uptime(),
  time: Date.now()
}));
app.get('/health', (req, res) => res.json({
  ok: true,
  database: false,
  mode: 'server-memory',
  rooms: rooms.size,
  players: [...players.values()].filter(p => p.ws?.readyState === WebSocket.OPEN).length,
  uptime: process.uptime(),
  startedAt: SERVER_STARTED_AT,
  time: Date.now()
}));
app.get('/api/rooms', (req, res) => res.json(listRooms()));
app.get('/api/players', (req, res) => {
  const out = [];
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      if (p.ws?.readyState === WebSocket.OPEN) out.push({ ...publicPlayer(p), room: room.name, roomId: room.id });
    }
  }
  res.json(out);
});

wss.on('connection', (ws, req) => {
  const player = {
    id: makeId('p_'), ws,
    name: 'قائد', color: '#168cff',
    roomId: null, ready: false, position: 0,
    lastSeen: Date.now()
  };
  players.set(player.id, player);
  ws.isAlive = true;

  send(ws, 'connected', { playerId: player.id, serverTime: Date.now(), mode: 'server-memory' });

  ws.on('pong', () => { ws.isAlive = true; player.lastSeen = Date.now(); });
  ws.on('message', raw => {
    player.lastSeen = Date.now();
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch (_) { return sendError(ws, 'BAD_JSON'); }
    const type = String(msg.type || '');

    try {
      if (type === 'profile') {
        player.name = cleanName(msg.name);
        player.color = cleanColor(msg.color);
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (room) {
          const rp = room.state.players[player.id] || {};
          room.state.players[player.id] = { ...rp, id: player.id, name: player.name, color: player.color, position: player.position };
          touch(room);
          broadcast(room, 'room_update', { room: publicRoom(room), player: publicPlayer(player) });
        }
        return send(ws, 'profile_ok', { player: publicPlayer(player) });
      }

      if (type === 'list_rooms') return send(ws, 'rooms', { rooms: listRooms() });

      if (type === 'create_room') {
        const room = createRoom(msg.name, msg.password, msg.maxPlayers, player);
        if (!room) return sendError(ws, 'ROOM_LIMIT', 'وصل السيرفر إلى الحد الأقصى من الغرف حالياً.');
        const joined = joinRoom(room, player, msg.password);
        if (!joined.ok) { rooms.delete(room.id); return sendError(ws, joined.error); }
        send(ws, 'room_created', { room: publicRoom(room) });
        return send(ws, 'state_snapshot', roomSnapshot(room));
      }

      if (type === 'join_room') {
        const room = rooms.get(String(msg.roomId || ''));
        if (!room) return sendError(ws, 'ROOM_NOT_FOUND');
        const joined = joinRoom(room, player, String(msg.password || ''));
        if (!joined.ok) return sendError(ws, joined.error);
        broadcast(room, 'player_joined', { player: publicPlayer(player), room: publicRoom(room) }, player.id);
        send(ws, 'joined_room', { room: publicRoom(room) });
        return send(ws, 'state_snapshot', roomSnapshot(room));
      }

      if (type === 'leave_room') {
        leaveRoom(player, 'manual');
        return send(ws, 'left_room', {});
      }

      if (type === 'ready') {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return sendError(ws, 'NOT_IN_ROOM');
        if (room.state.started) return sendError(ws, 'GAME_ALREADY_STARTED');
        player.ready = !!msg.ready;
        touch(room);
        return broadcast(room, 'room_update', { room: publicRoom(room), player: publicPlayer(player) });
      }

      if (type === 'start_game') {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return sendError(ws, 'NOT_IN_ROOM');
        if (room.hostId !== player.id) return sendError(ws, 'NOT_HOST');
        if (room.players.size < 2) return sendError(ws, 'NEED_TWO_PLAYERS');
        if (![...room.players.values()].some(p => p.id !== player.id) || ![...room.players.values()].every(p => p.ready)) return sendError(ws, 'NOT_ALL_READY');
        room.state.started = true;
        room.state.tick = 0;
        room.state.gameTime = 0;
        room.state.serverTime = Date.now();
        touch(room);
        return broadcast(room, 'game_started', { state: room.state, room: publicRoom(room) });
      }

      if (type === 'game_event') {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return sendError(ws, 'NOT_IN_ROOM');
        const event = (msg.event && typeof msg.event === 'object') ? msg.event : {};

        if (event.action === 'choose_position' && !room.state.started) {
          const pos = Math.max(0, Math.min(3, Number(event.position) || 0));
          const taken = [...room.players.values()].some(p => p.id !== player.id && p.position === pos);
          if (taken) return sendError(ws, 'POSITION_TAKEN', 'هذا الموقع اختاره لاعب آخر.');
          player.position = pos;
          room.state.players[player.id] = { ...(room.state.players[player.id] || {}), position: pos };
          touch(room);
          return broadcast(room, 'room_update', { room: publicRoom(room), player: publicPlayer(player) });
        }

        if (event.action === 'set_money' && !room.state.started) {
          if (room.hostId !== player.id) return sendError(ws, 'NOT_HOST');
          const money = [1000, 2000, 3000, 4000].includes(Number(event.money)) ? Number(event.money) : 3000;
          room.state.money = money;
          touch(room);
          return broadcast(room, 'room_update', { room: publicRoom(room), money, player: publicPlayer(player) });
        }

        room.state.lastEvent = { from: player.id, event, serverTime: Date.now() };
        room.state.serverTime = Date.now();
        touch(room);
        return broadcast(room, 'game_event', { from: player.id, event, serverTime: room.state.serverTime }, player.id);
      }

      if (type === 'state_patch') {
        const room = player.roomId ? rooms.get(player.roomId) : null;
        if (!room) return sendError(ws, 'NOT_IN_ROOM');
        if (!room.state.started) return;
        const patch = (msg.patch && typeof msg.patch === 'object') ? msg.patch : {};
        for (const key of ['players', 'units', 'buildings', 'projectiles', 'effects']) {
          if (patch[key] !== undefined) room.state[key] = patch[key];
        }
        room.state.tick = (room.state.tick || 0) + 1;
        room.state.serverTime = Date.now();
        touch(room);
        return broadcast(room, 'state_patch', {
          from: player.id,
          tick: room.state.tick,
          serverTime: room.state.serverTime,
          patch
        }, player.id);
      }

      if (type === 'ping') return send(ws, 'pong', { clientTime: msg.clientTime || null, serverTime: Date.now() });
      return sendError(ws, 'UNKNOWN_MESSAGE', `Unknown message type: ${type}`);
    } catch (err) {
      console.error('message error', err);
      sendError(ws, 'SERVER_ERROR');
    }
  });

  ws.on('close', () => {
    leaveRoom(player, 'disconnect');
    players.delete(player.id);
  });
  ws.on('error', err => console.error('WebSocket error:', err.message));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (_) {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.players.size === 0 || (!room.state.started && now - room.updatedAt > ROOM_IDLE_MS)) rooms.delete(id);
  }
}, 15000);
heartbeat.unref?.();

process.on('SIGTERM', () => { clearInterval(heartbeat); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { clearInterval(heartbeat); server.close(() => process.exit(0)); });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tank Game GameRanger Server listening on ${PORT}`);
  console.log('Mode: server-memory (no Firebase, no PostgreSQL, no DATABASE_URL)');
});
