'use strict';

// Tactical Tank Game - Render-ready authoritative room server.
// Protocol is intentionally matched to the current game's online-room runtime.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAX_PAYLOAD = 5 * 1024 * 1024;
const ROOM_LIMIT = 2;
const rooms = new Map();
const clients = new Map();

const publicDir = path.join(__dirname, 'public');

function id(prefix = '') {
  return prefix + crypto.randomBytes(10).toString('hex');
}
function roomCode() {
  let code;
  do code = crypto.randomBytes(3).toString('hex').toUpperCase();
  while (rooms.has(code));
  return code;
}
function safeColor(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}
function safeName(value, fallback) {
  const s = String(value || '').trim().replace(/[<>]/g, '').slice(0, 28);
  return s || fallback;
}
function safeMoney(value, fallback = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1000, Math.min(5000, Math.floor(n / 100) * 100));
}
function send(ws, payload) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(payload)); } catch (_) {}
  }
}
function broadcast(room, payload, except = null) {
  for (const p of room.players) if (p.ws && p.ws !== except) send(p.ws, payload);
}
function playerById(room, idValue) {
  return room.players.find(p => p.id === idValue) || null;
}
function otherPlayer(room, idValue) {
  return room.players.find(p => p.id !== idValue) || null;
}
function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    ready: !!p.ready,
    connected: !!p.ws,
    color: p.color,
    slot: p.slot
  };
}
function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    players: room.players.length,
    maxPlayers: ROOM_LIMIT,
    money: room.money,
    status: room.status
  };
}
function roomState(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    started: room.status === 'running',
    status: room.status,
    money: room.money,
    players: room.players.map(publicPlayer)
  };
}
function sendRoomState(room) {
  const state = roomState(room);
  for (const p of room.players) send(p.ws, { type: 'room_state', room: state });
}

function makePlayer(ws, data, slot) {
  const playerId = id('p_');
  const hiddenPlayerId = id('u_');
  return {
    id: playerId,
    hiddenPlayerId,
    ws,
    name: safeName(data.name, slot === 1 ? 'لاعب 1' : 'لاعب 2'),
    color: safeColor(data.color, slot === 1 ? '#168cff' : '#ef4444'),
    ready: false,
    slot,
    connected: true,
    state: null,
    lastStateAt: 0,
    disconnectAt: 0
  };
}
function makeRoom(host) {
  const room = {
    id: roomCode(),
    name: host.name,
    hostId: host.id,
    status: 'lobby',
    money: safeMoney(host.requestedMoney, 1000),
    seed: crypto.randomInt(1, 0x7fffffff),
    createdAt: Date.now(),
    startedAt: 0,
    players: [host]
  };
  rooms.set(room.id, room);
  return room;
}
function attach(ws, room, player) {
  player.ws = ws;
  player.connected = true;
  player.disconnectAt = 0;
  ws.__roomId = room.id;
  ws.__playerId = player.id;
  clients.set(player.id, ws);
  send(ws, { type: 'hello', clientId: player.id, hiddenPlayerId: player.hiddenPlayerId });
  sendRoomState(room);
  if (room.status === 'running') sendGameStart(room, player);
  sendServerState(room);
}
function sendGameStart(room, player) {
  const opponent = otherPlayer(room, player.id);
  if (!opponent) return;
  send(player.ws, {
    type: 'game_start',
    roomId: room.id,
    playerId: player.slot - 1,
    opponentId: opponent.id,
    hiddenPlayerId: player.hiddenPlayerId,
    opponentHiddenId: opponent.hiddenPlayerId,
    seed: room.seed,
    serverTime: Date.now(),
    m: room.money,
    config: {
      money: room.money,
      player: { id: player.id, color: player.color, colorName: player.color.toUpperCase() },
      opponent: { id: opponent.id, color: opponent.color, colorName: opponent.color.toUpperCase() },
      map: 'main'
    }
  });
}
function startRoom(room) {
  if (room.status !== 'lobby' || room.players.length !== ROOM_LIMIT) return false;
  if (!room.players.every(p => p.ready)) return false;
  room.status = 'running';
  room.startedAt = Date.now();
  room.seed = crypto.randomInt(1, 0x7fffffff);
  for (const p of room.players) {
    p.state = null;
    p.lastStateAt = 0;
    sendGameStart(room, p);
  }
  sendRoomState(room);
  return true;
}
function mergeAndBroadcastState(room) {
  if (room.status !== 'running') return;
  const players = room.players.map(p => ({
    id: p.id,
    slot: p.slot,
    color: p.color,
    name: p.name,
    state: p.state || { money: room.money, units: [], buildings: [], oil: [], base: null },
    receivedAt: p.lastStateAt || 0
  }));
  const packet = { tick: Date.now(), roomId: room.id, players };
  for (const p of room.players) send(p.ws, { type: 'server_state', state: packet });
}
function sendServerState(room) {
  if (room.status === 'running') mergeAndBroadcastState(room);
}
function leaveRoom(room, player, reason = 'leave') {
  if (!room || !player) return;
  const opponent = otherPlayer(room, player.id);
  clients.delete(player.id);
  player.ws = null;
  player.connected = false;
  player.disconnectAt = Date.now();

  if (room.status === 'running') {
    room.status = 'finished';
    if (opponent && opponent.ws) {
      send(opponent.ws, {
        type: 'match_end',
        result: { winnerId: opponent.id, loserId: player.id, reason }
      });
    }
  } else {
    room.players = room.players.filter(p => p.id !== player.id);
    if (!room.players.length) rooms.delete(room.id);
    else {
      room.hostId = room.players[0].id;
      room.players[0].slot = 1;
      sendRoomState(room);
    }
  }
}
function handleMessage(ws, raw) {
  if (raw.length > MAX_PAYLOAD) return send(ws, { type: 'room_error', message: 'الرسالة كبيرة جداً.' });
  let msg;
  try { msg = JSON.parse(raw); } catch (_) { return send(ws, { type: 'room_error', message: 'بيانات غير صالحة.' }); }
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'ping') return send(ws, { type: 'pong', t: msg.t || Date.now() });
  if (msg.type === 'list_rooms') {
    return send(ws, { type: 'rooms', rooms: [...rooms.values()].filter(r => r.status === 'lobby' && r.players.length < ROOM_LIMIT).map(publicRoom) });
  }

  if (msg.type === 'create_room') {
    if (ws.__roomId) return send(ws, { type: 'room_error', message: 'أنت داخل غرفة بالفعل.' });
    const host = makePlayer(ws, { name: msg.name, color: msg.color }, 1);
    host.requestedMoney = msg.money;
    const room = makeRoom(host);
    ws.__roomId = room.id;
    ws.__playerId = host.id;
    clients.set(host.id, ws);
    send(ws, { type: 'hello', clientId: host.id, hiddenPlayerId: host.hiddenPlayerId });
    send(ws, { type: 'room_created', room: roomState(room) });
    sendRoomState(room);
    return;
  }

  // Joining is allowed before a socket has a room association.
  if (msg.type === 'join_room') {
    if (ws.__roomId) return send(ws, { type: 'room_error', message: 'أنت داخل غرفة بالفعل.' });
    const target = rooms.get(String(msg.roomId || '').toUpperCase());
    if (!target || target.status !== 'lobby' || target.players.length >= ROOM_LIMIT) {
      return send(ws, { type: 'room_error', message: 'الغرفة غير متاحة.' });
    }
    const player = makePlayer(ws, { name: msg.name, color: msg.color }, 2);
    player.requestedMoney = target.money;
    target.players.push(player);
    ws.__roomId = target.id;
    ws.__playerId = player.id;
    clients.set(player.id, ws);
    send(ws, { type: 'hello', clientId: player.id, hiddenPlayerId: player.hiddenPlayerId });
    send(ws, { type: 'room_joined', room: roomState(target) });
    sendRoomState(target);
    return;
  }

  const room = rooms.get(ws.__roomId);
  const self = room && playerById(room, ws.__playerId);
  if (!room || !self) return send(ws, { type: 'room_error', message: 'لست داخل غرفة.' });

  if (msg.type === 'set_color') {
    if (room.status !== 'lobby') return;
    self.color = safeColor(msg.color, self.color);
    sendRoomState(room);
    return;
  }

  if (msg.type === 'toggle_ready') {
    if (room.status !== 'lobby') return;
    self.ready = !self.ready;
    if (self.slot === 1 && msg.money != null) room.money = safeMoney(msg.money, room.money);
    sendRoomState(room);
    startRoom(room);
    return;
  }

  if (msg.type === 'set_profile') {
    if (typeof msg.name === 'string') self.name = safeName(msg.name, self.name);
    if (typeof msg.color === 'string') self.color = safeColor(msg.color, self.color);
    sendRoomState(room);
    return;
  }

  if (msg.type === 'game_event') {
    if (room.status !== 'running') return;
    const payload = msg.payload;
    if (!payload || typeof payload !== 'object') return;
    if (payload.kind === 'authoritative_snapshot' && payload.state && typeof payload.state === 'object') {
      self.state = payload.state;
      self.lastStateAt = Date.now();
      mergeAndBroadcastState(room);
      return;
    }
    // Other gameplay events are relayed only to the opponent.
    const opponent = otherPlayer(room, self.id);
    if (opponent && opponent.ws) send(opponent.ws, { type: 'peer_message', payload, fromId: self.id });
    return;
  }

  if (msg.type === 'leave_room') {
    leaveRoom(room, self, 'leave');
    return;
  }
}

function onConnection(ws) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => handleMessage(ws, data.toString()));
  ws.on('close', () => {
    const room = rooms.get(ws.__roomId);
    const player = room && playerById(room, ws.__playerId);
    if (player && player.ws === ws) leaveRoom(room, player, 'disconnect');
  });
  ws.on('error', () => {});
  send(ws, { type: 'connected', serverTime: Date.now() });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' || url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'tank-game-server', rooms: rooms.size, players: clients.size, uptime: process.uptime() }));
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const file = path.join(publicDir, 'index.html');
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Tank Game Server is running.'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });
wss.on('connection', onConnection);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.status === 'finished' && now - room.createdAt > 30 * 60 * 1000) rooms.delete(code);
    else if (room.status === 'lobby' && now - room.createdAt > 2 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Tank Game Server listening on ${HOST}:${PORT}`);
});
