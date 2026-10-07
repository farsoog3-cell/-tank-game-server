'use strict';

// Tactical Tank Game — multiplayer room/authority gateway.
// The server owns identity, room membership, match lifecycle, sequence ordering,
// reconnect grace, and economy ceilings. Three.js remains client-side presentation.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAX_PAYLOAD = 5 * 1024 * 1024;
const ROOM_LIMIT = 2;
const DISCONNECT_GRACE_MS = 90_000;
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;
const FINISHED_ROOM_MS = 30 * 60 * 1000;
const STATE_BROADCAST_MS = 100;

const rooms = new Map();
const clients = new Map();
const resumeIndex = new Map();
const publicDir = path.join(__dirname, 'public');

function id(prefix = '') { return prefix + crypto.randomBytes(10).toString('hex'); }
function roomCode() {
  let code;
  do code = crypto.randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(code));
  return code;
}
function token() { return crypto.randomBytes(32).toString('base64url'); }
function safeColor(value, fallback) { const s = String(value || '').trim(); return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback; }
function safeName(value, fallback) { const s = String(value || '').trim().replace(/[<>]/g, '').slice(0, 28); return s || fallback; }
function safeMoney(value, fallback = 1000) {
  const n = Number(value); if (!Number.isFinite(n)) return fallback;
  return Math.max(1000, Math.min(5000, Math.floor(n / 100) * 100));
}
function finite(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function nowSafe() { return Date.now(); }
function send(ws, payload) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(payload)); } catch (_) {} } }
function broadcast(room, payload, except = null) { for (const p of room.players) if (p.ws && p.ws !== except) send(p.ws, payload); }
function playerById(room, value) { return room.players.find(p => p.id === value) || null; }
function otherPlayer(room, value) { return room.players.find(p => p.id !== value) || null; }

function publicPlayer(p) {
  return { id: p.id, name: p.name, ready: !!p.ready, connected: !!p.ws, color: p.color, slot: p.slot };
}
function publicRoom(room) {
  return { id: room.id, name: room.name, players: room.players.filter(p => !p.removed).length, maxPlayers: ROOM_LIMIT, money: room.money, status: room.status };
}
function roomState(room) {
  return { id: room.id, name: room.name, hostId: room.hostId, started: room.status === 'running', status: room.status, money: room.money, players: room.players.filter(p => !p.removed).map(publicPlayer) };
}
function sendRoomState(room) { const state = roomState(room); for (const p of room.players) if (p.ws) send(p.ws, { type: 'room_state', room: state }); }

function makePlayer(ws, data, slot) {
  const playerId = id('p_');
  const resumeToken = token();
  const p = {
    id: playerId,
    hiddenPlayerId: id('u_'),
    resumeToken,
    ws,
    name: safeName(data.name, slot === 1 ? 'لاعب 1' : 'لاعب 2'),
    color: safeColor(data.color, slot === 1 ? '#168cff' : '#ef4444'),
    ready: false,
    slot,
    state: null,
    lastStateAt: 0,
    lastSeq: -1,
    disconnectAt: 0,
    removed: false,
    money: 0,
    lastMoney: 0,
    economyAt: Date.now(),
    serverOil: new Map(),
    lastUnits: new Map()
  };
  resumeIndex.set(resumeToken, { roomId: null, playerId });
  return p;
}
function makeRoom(host, requestedMoney) {
  const room = {
    id: roomCode(), name: host.name, hostId: host.id, status: 'lobby',
    money: safeMoney(requestedMoney, 1000), seed: crypto.randomInt(1, 0x7fffffff),
    createdAt: Date.now(), startedAt: 0, players: [host]
  };
  host.money = room.money; host.lastMoney = room.money;
  const ref = resumeIndex.get(host.resumeToken); if (ref) ref.roomId = room.id;
  rooms.set(room.id, room);
  return room;
}
function bindSocket(ws, room, player) {
  player.ws = ws; player.disconnectAt = 0; player.removed = false;
  ws.__roomId = room.id; ws.__playerId = player.id;
  clients.set(player.id, ws);
  const ref = resumeIndex.get(player.resumeToken); if (ref) ref.roomId = room.id;
  send(ws, { type: 'hello', clientId: player.id, hiddenPlayerId: player.hiddenPlayerId, resumeToken: player.resumeToken });
}
function sendGameStart(room, player) {
  const opponent = otherPlayer(room, player.id);
  if (!opponent) return;
  send(player.ws, {
    type: 'game_start', roomId: room.id,
    playerSlot: player.slot, slot: player.slot,
    playerId: player.slot, // canonical slot compatibility
    playerServerId: player.id, opponentServerId: opponent.id, opponentId: opponent.id,
    hiddenPlayerId: player.hiddenPlayerId,
    protocolVersion: 3, seed: room.seed, serverTime: Date.now(), resumeToken: player.resumeToken,
    config: {
      money: room.money,
      player: { id: player.id, color: player.color, colorName: player.color.toUpperCase() },
      opponent: { id: opponent.id, color: opponent.color, colorName: opponent.color.toUpperCase() },
      map: 'main'
    }
  });
}
function startRoom(room) {
  if (room.status !== 'lobby' || room.players.length !== ROOM_LIMIT || !room.players.every(p => p.ready && !p.removed)) return false;
  room.status = 'running'; room.startedAt = Date.now();
  for (const p of room.players) { p.state = null; p.lastStateAt = 0; p.lastSeq = -1; p.money = room.money; p.lastMoney = room.money; sendGameStart(room, p); }
  sendRoomState(room); return true;
}

function sanitizeUnit(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string') return null;
  return {
    id: x.id.slice(0, 100), type: String(x.type || 'normal').slice(0, 30), infantry: !!x.infantry,
    x: clamp(finite(x.x), -10000, 10000), z: clamp(finite(x.z), -10000, 10000), y: clamp(finite(x.y), -100, 1000),
    rot: clamp(finite(x.rot), -1000, 1000), hp: clamp(finite(x.hp, 100), 0, 100000), maxHp: clamp(finite(x.maxHp, 100), 1, 100000),
    destroyed: !!x.destroyed, target: x.target ? { x: clamp(finite(x.target.x), -10000, 10000), z: clamp(finite(x.target.z), -10000, 10000) } : null,
    guard: x.guard ? { x: clamp(finite(x.guard.x), -10000, 10000), z: clamp(finite(x.guard.z), -10000, 10000) } : null
  };
}
function sanitizeBuilding(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string') return null;
  return { id: x.id.slice(0, 100), type: String(x.type || 'building').slice(0, 30), x: clamp(finite(x.x), -10000, 10000), z: clamp(finite(x.z), -10000, 10000), y: clamp(finite(x.y), -100, 1000), rot: clamp(finite(x.rot), -1000, 1000), hp: clamp(finite(x.hp, 1000), 0, 100000), maxHp: clamp(finite(x.maxHp, 1000), 1, 100000), done: x.done !== false, destroyed: !!x.destroyed, owner: 'player' };
}
function sanitizeOil(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string') return null;
  return { id: x.id.slice(0, 100), x: clamp(finite(x.x), -10000, 10000), z: clamp(finite(x.z), -10000, 10000), hp: clamp(finite(x.hp, 700), 0, 100000), maxHp: clamp(finite(x.maxHp, 700), 1, 100000), owner: ['player','enemy','none'].includes(x.owner) ? x.owner : 'none', captureProgress: clamp(finite(x.captureProgress), -100, 100) };
}
function sanitizeSnapshot(room, player, incoming) {
  if (!incoming || typeof incoming !== 'object') return null;
  let units = Array.isArray(incoming.units) ? incoming.units.slice(0, 250).map(sanitizeUnit).filter(Boolean) : [];
  const buildings = Array.isArray(incoming.buildings) ? incoming.buildings.slice(0, 100).map(sanitizeBuilding).filter(Boolean) : [];
  // Keep the original movement engine, but reject impossible network teleports.
  const previousAt = player.lastStateAt || nowSafe();
  const movementDt = Math.max(0.05, Math.min(2.5, (nowSafe() - previousAt) / 1000));
  const maxDistance = 12 * movementDt + 4;
  units = units.map(u => {
    const prev = player.lastUnits.get(u.id);
    if (!prev) return u;
    const dx = u.x - prev.x, dz = u.z - prev.z;
    const d = Math.hypot(dx, dz);
    if (d <= maxDistance) return u;
    const k = maxDistance / Math.max(d, 0.001);
    u.x = prev.x + dx * k; u.z = prev.z + dz * k;
    return u;
  });
  player.lastUnits.clear(); for (const u of units) player.lastUnits.set(u.id, {x:u.x,z:u.z});
  const oil = Array.isArray(incoming.oil) ? incoming.oil.slice(0, 20).map(sanitizeOil).filter(Boolean) : [];
  // Economy is server-clocked. Captured oil produces the same $10/second/rige rule
  // as the original game; a snapshot can request spending, but cannot mint money.
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(5, (now - (player.economyAt || now)) / 1000));
  let ownedRigs = 0;
  for (const r of player.serverOil.values()) if (r.owner === 'player') ownedRigs++;
  if (ownedRigs > 0) player.money += Math.floor(ownedRigs * 10 * elapsed);
  player.economyAt = now;
  for (const r of oil) {
    const prev = player.serverOil.get(r.id) || { owner: 'none', captureProgress: 0 };
    let progress = clamp(r.captureProgress, -100, 100);
    const maxDelta = Math.max(0.5, elapsed * 20);
    progress = prev.captureProgress + clamp(progress - prev.captureProgress, -maxDelta, maxDelta);
    let owner = prev.owner;
    if (progress >= 100) { owner = 'player'; progress = 100; }
    else if (progress <= -100) { owner = 'enemy'; progress = -100; }
    else if (owner === 'player' && progress < 0) owner = 'none';
    else if (owner === 'enemy' && progress > 0) owner = 'none';
    player.serverOil.set(r.id, { owner, captureProgress: progress });
    r.owner = owner; r.captureProgress = progress;
  }
  const reportedMoney = clamp(Math.floor(finite(incoming.money, player.money)), 0, 500000);
  player.money = Math.min(player.money, reportedMoney);
  return {
    money: player.money, units, buildings, oil,
    base: incoming.base ? { hp: clamp(finite(incoming.base.hp, 1600), 0, 100000), maxHp: clamp(finite(incoming.base.maxHp, 1600), 1, 100000) } : null,
    __seq: Math.max(0, Math.floor(finite(incoming.__seq, 0))),
    __serverTime: Date.now()
  };
}
function mergeAndBroadcastState(room) {
  if (room.status !== 'running') return;
  const players = room.players.filter(p => !p.removed).map(p => ({
    id: p.id, slot: p.slot, color: p.color, name: p.name,
    connected: !!p.ws,
    state: p.state || { money: p.money, units: [], buildings: [], oil: [], base: null, __seq: -1 },
    receivedAt: p.lastStateAt || 0,
    staleMs: p.lastStateAt ? Math.max(0, Date.now() - p.lastStateAt) : null
  }));
  const packet = { tick: Date.now(), roomId: room.id, players };
  for (const p of room.players) if (p.ws) send(p.ws, { type: 'server_state', state: packet });
}
function endMatch(room, loser, reason) {
  if (!room || room.status !== 'running') return;
  room.status = 'finished';
  const winner = otherPlayer(room, loser.id);
  if (winner && winner.ws) send(winner.ws, { type: 'match_end', result: { winnerId: winner.id, loserId: loser.id, reason } });
  if (loser.ws) send(loser.ws, { type: 'match_end', result: { winnerId: winner && winner.id, loserId: loser.id, reason } });
  sendRoomState(room);
}
function disconnectPlayer(room, player, reason = 'disconnect') {
  if (!room || !player || player.ws === null) return;
  const ws = player.ws; player.ws = null; player.disconnectAt = Date.now(); clients.delete(player.id);
  if (ws) { ws.__roomId = null; ws.__playerId = null; }
  if (room.status === 'lobby') {
    room.players = room.players.filter(p => p.id !== player.id);
    resumeIndex.delete(player.resumeToken);
    if (!room.players.length) rooms.delete(room.id); else { room.hostId = room.players[0].id; room.players[0].slot = 1; sendRoomState(room); }
  } else if (room.status === 'running') {
    broadcast(room, { type: 'opponent_connection', playerId: player.id, connected: false, graceMs: DISCONNECT_GRACE_MS }, null);
    sendRoomState(room);
  }
}
function leaveRoom(room, player, reason = 'leave') {
  if (!room || !player) return;
  if (room.status === 'running') { if (reason === 'leave') endMatch(room, player, 'leave'); else disconnectPlayer(room, player, reason); }
  else disconnectPlayer(room, player, reason);
}

function handleMessage(ws, raw) {
  if (raw.length > MAX_PAYLOAD) return send(ws, { type: 'room_error', message: 'الرسالة كبيرة جداً.' });
  let msg; try { msg = JSON.parse(raw); } catch (_) { return send(ws, { type: 'room_error', message: 'بيانات غير صالحة.' }); }
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'ping') return send(ws, { type: 'pong', t: msg.t || Date.now() });
  if (msg.type === 'list_rooms') return send(ws, { type: 'rooms', rooms: [...rooms.values()].filter(r => r.status === 'lobby' && r.players.length < ROOM_LIMIT).map(publicRoom) });

  if (msg.type === 'resume_room') {
    const rid = String(msg.roomId || '').toUpperCase(); const ref = resumeIndex.get(String(msg.resumeToken || '')); const room = rooms.get(rid);
    if (!ref || ref.roomId !== rid || !room || room.status !== 'running') return send(ws, { type: 'room_error', message: 'لا يمكن استعادة هذه المباراة.' });
    const player = playerById(room, ref.playerId);
    if (!player || player.removed || (player.disconnectAt && Date.now() - player.disconnectAt > DISCONNECT_GRACE_MS)) return send(ws, { type: 'room_error', message: 'انتهت مهلة استعادة المباراة.' });
    bindSocket(ws, room, player); sendRoomState(room); sendGameStart(room, player); mergeAndBroadcastState(room); return;
  }

  if (msg.type === 'create_room') {
    if (ws.__roomId) return send(ws, { type: 'room_error', message: 'أنت داخل غرفة بالفعل.' });
    const host = makePlayer(ws, { name: msg.name, color: msg.color }, 1); const room = makeRoom(host, msg.money);
    ws.__roomId = room.id; ws.__playerId = host.id; clients.set(host.id, ws);
    send(ws, { type: 'hello', clientId: host.id, hiddenPlayerId: host.hiddenPlayerId, resumeToken: host.resumeToken });
    send(ws, { type: 'room_created', room: roomState(room) }); sendRoomState(room); return;
  }
  if (msg.type === 'join_room') {
    if (ws.__roomId) return send(ws, { type: 'room_error', message: 'أنت داخل غرفة بالفعل.' });
    const target = rooms.get(String(msg.roomId || '').toUpperCase());
    if (!target || target.status !== 'lobby' || target.players.length >= ROOM_LIMIT) return send(ws, { type: 'room_error', message: 'الغرفة غير متاحة.' });
    const player = makePlayer(ws, { name: msg.name, color: msg.color }, 2); player.money = target.money; player.lastMoney = target.money;
    target.players.push(player); const ref = resumeIndex.get(player.resumeToken); if (ref) ref.roomId = target.id;
    ws.__roomId = target.id; ws.__playerId = player.id; clients.set(player.id, ws);
    send(ws, { type: 'hello', clientId: player.id, hiddenPlayerId: player.hiddenPlayerId, resumeToken: player.resumeToken });
    send(ws, { type: 'room_joined', room: roomState(target) }); sendRoomState(target); return;
  }

  const room = rooms.get(ws.__roomId); const self = room && playerById(room, ws.__playerId);
  if (!room || !self) return send(ws, { type: 'room_error', message: 'لست داخل غرفة.' });
  if (msg.type === 'set_color') { if (room.status !== 'lobby') return; self.color = safeColor(msg.color, self.color); sendRoomState(room); return; }
  if (msg.type === 'set_profile') { if (typeof msg.name === 'string') self.name = safeName(msg.name, self.name); if (typeof msg.color === 'string') self.color = safeColor(msg.color, self.color); sendRoomState(room); return; }
  if (msg.type === 'toggle_ready') {
    if (room.status !== 'lobby') return; self.ready = !self.ready;
    if (self.slot === 1 && msg.money != null) { room.money = safeMoney(msg.money, room.money); for (const p of room.players) { p.money = room.money; p.lastMoney = room.money; } }
    sendRoomState(room); startRoom(room); return;
  }
  if (msg.type === 'game_event') {
    if (room.status !== 'running') return;
    const payload = msg.payload; if (!payload || typeof payload !== 'object') return;
    if (payload.kind === 'authoritative_snapshot' && payload.state && typeof payload.state === 'object') {
      const seq = Math.floor(finite(payload.state.__seq, -1));
      if (seq <= self.lastSeq) return;
      self.lastSeq = seq;
      const state = sanitizeSnapshot(room, self, payload.state); if (!state) return;
      self.state = state; self.lastStateAt = Date.now(); mergeAndBroadcastState(room); return;
    }
    const opponent = otherPlayer(room, self.id); if (opponent && opponent.ws) send(opponent.ws, { type: 'peer_message', payload, fromId: self.id });
    return;
  }
  if (msg.type === 'leave_room') return leaveRoom(room, self, 'leave');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' || url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'tank-game-server', rooms: rooms.size, players: clients.size, uptime: process.uptime(), protocol: 3 }));
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const file = path.join(publicDir, 'index.html');
    return fs.readFile(file, (err, data) => { if (err) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Tank Game Server is running.'); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(data); });
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => handleMessage(ws, data.toString()));
  ws.on('close', () => { const room = rooms.get(ws.__roomId); const player = room && playerById(room, ws.__playerId); if (player && player.ws === ws) disconnectPlayer(room, player, 'disconnect'); });
  ws.on('error', () => {});
  send(ws, { type: 'connected', serverTime: Date.now(), protocol: 3 });
});

setInterval(() => { for (const room of rooms.values()) if (room.status === 'running') mergeAndBroadcastState(room); }, STATE_BROADCAST_MS).unref();
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === 'running') {
      for (const p of room.players) if (!p.ws && p.disconnectAt && now - p.disconnectAt > DISCONNECT_GRACE_MS) { endMatch(room, p, 'disconnect_timeout'); break; }
    } else if (room.status === 'finished' && now - room.createdAt > FINISHED_ROOM_MS) rooms.delete(room.id);
    else if (room.status === 'lobby' && now - room.createdAt > ROOM_IDLE_MS) rooms.delete(room.id);
  }
}, 1000).unref();
setInterval(() => {
  for (const ws of wss.clients) { if (ws.isAlive === false) { try { ws.terminate(); } catch (_) {} continue; } ws.isAlive = false; try { ws.ping(); } catch (_) {} }
}, 30000).unref();

server.listen(PORT, HOST, () => console.log(`Tank Game Server listening on ${HOST}:${PORT}`));
