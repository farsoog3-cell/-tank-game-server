'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const PRESENCE_TIMEOUT = 15000;
const MAX_ROOMS = 1000;

const players = new Map(); // id -> player
const rooms = new Map();   // code -> room

function now() { return Date.now(); }
function uid() { return crypto.randomUUID(); }
function roomCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 8).toUpperCase();
  while (rooms.has(code));
  return code;
}
function cleanName(v) {
  const s = String(v || 'Commander').trim().slice(0, 24);
  return s || 'Commander';
}
function cleanColor(v) {
  const s = String(v || '#168cff');
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#168cff';
}
function cleanSettings(s = {}) {
  return {
    money: Math.max(0, Number(s.money) || 3000),
    color: cleanColor(s.color),
    colorName: String(s.colorName || 'BLUE').slice(0, 20).toUpperCase()
  };
}
function send(p, message) {
  if (!p || !p.ws || p.ws.readyState !== 1) return false;
  try { p.ws.send(JSON.stringify(message)); return true; } catch (_) { return false; }
}
function broadcast(message, filter = () => true) {
  for (const p of players.values()) if (filter(p)) send(p, message);
}
function playerView(p) {
  return {
    id: p.id,
    name: p.name,
    online: true,
    inRoom: !!p.room,
    room: p.room || null,
    settings: { ...p.settings },
    ready: !!p.ready
  };
}
function presenceList() {
  const t = now();
  return [...players.values()]
    .filter(p => p.ws && p.ws.readyState === 1 && t - p.lastSeen <= PRESENCE_TIMEOUT)
    .map(playerView);
}
function sendPresence() {
  const list = presenceList();
  broadcast({ type: 'presence_list', players: list });
}
function roomView(room) {
  const host=players.get(room.host);
  return {
    code: room.code,
    name: room.name || ('غرفة '+room.code),
    count: room.players.length,
    started: !!room.started,
    hostName: host?.name || 'Commander',
    hostColor: host?.settings?.color || '#168cff',
    hostColorName: host?.settings?.colorName || 'BLUE',
    money: host?.settings?.money || 3000
  };
}
function sendRooms() {
  const list = [...rooms.values()]
    .filter(r => !r.started && r.players.length > 0)
    .map(roomView);
  broadcast({ type: 'rooms_list', rooms: list });
}
function roomPlayers(room) {
  return room.players.map(id => players.get(id)).filter(Boolean).map(playerView);
}
function sendRoomUpdate(room) {
  const ps = roomPlayers(room);
  for (const id of room.players) {
    const p = players.get(id);
    if (!p) continue;
    send(p, {
      type: 'room_update',
      room: room.code,
      roomName: room.name || ('غرفة '+room.code),
      role: p.id === room.host ? 'host' : 'guest',
      players: ps
    });
  }
  sendRooms();
  sendPresence();
}
function leaveRoom(p, notifyPeer = true) {
  if (!p.room) return;
  const code = p.room;
  const room = rooms.get(code);
  p.room = null;
  p.ready = false;
  if (!room) return;
  room.players = room.players.filter(id => id !== p.id);
  if (notifyPeer) {
    for (const id of room.players) {
      const peer = players.get(id);
      if (peer) { peer.ready = false; send(peer, { type: 'peer_left', playerId: p.id }); }
    }
  }
  if (room.players.length === 0 || room.started) rooms.delete(code);
  else {
    room.host = room.players[0];
    sendRoomUpdate(room);
  }
  sendRooms();
  sendPresence();
}
function removePlayer(p) {
  leaveRoom(p, true);
  players.delete(p.id);
  sendPresence();
  sendRooms();
}
function getRoomFor(p) { return p.room ? rooms.get(p.room) : null; }

function handle(p, m) {
  if (!m || typeof m !== 'object') return;
  p.lastSeen = now();

  switch (m.type) {
    case 'presence':
      if (m.name !== undefined) p.name = cleanName(m.name);
      if (m.settings) p.settings = cleanSettings(m.settings);
      sendPresence();
      return;

    case 'get_rooms':
      send(p, { type: 'rooms_list', rooms: [...rooms.values()].filter(r => !r.started && r.players.length > 0).map(roomView) });
      return;

    case 'create_room': {
      if (p.room) leaveRoom(p, false);
      if (rooms.size >= MAX_ROOMS) return send(p, { type: 'room_error', message: 'السيرفر ممتلئ حاليًا.' });
      p.name = cleanName(m.name || p.name);
      p.settings = cleanSettings(m.settings || p.settings);
      p.ready = false;
      const code = roomCode();
      const roomName = cleanName(m.roomName || 'Desert Battle').slice(0,24);
      const room = { code, name: roomName, host: p.id, players: [p.id], started: false, state: null };
      rooms.set(code, room);
      p.room = code;
      send(p, { type: 'room_created', room: code, role: 'host', players: roomPlayers(room) });
      sendRoomUpdate(room);
      return;
    }

    case 'join_room': {
      const code = String(m.room || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.started) return send(p, { type: 'room_error', message: 'الغرفة غير موجودة أو بدأت بالفعل.' });
      if (room.players.length >= 2) return send(p, { type: 'room_error', message: 'الغرفة ممتلئة.' });
      if (p.room && p.room !== code) leaveRoom(p, false);
      p.name = cleanName(m.name || p.name);
      p.settings = cleanSettings(m.settings || p.settings);
      p.ready = false;
      if (m.roomName && p.id === room.host) room.name = cleanName(m.roomName).slice(0,24);
      if (!room.players.includes(p.id)) room.players.push(p.id);
      p.room = code;
      send(p, { type: 'room_joined', room: code, roomName: room.name || ('غرفة '+code), role: p.id === room.host ? 'host' : 'guest', players: roomPlayers(room) });
      sendRoomUpdate(room);
      return;
    }

    case 'settings': {
      if (m.name !== undefined) p.name = cleanName(m.name);
      p.settings = cleanSettings(m.settings || p.settings);
      if (p.room) {
        const room = getRoomFor(p);
        if (room && !room.started) sendRoomUpdate(room);
      }
      sendPresence();
      return;
    }

    case 'ready': {
      const room = getRoomFor(p);
      if (!room || room.started) return;
      p.ready = !!m.ready;
      sendRoomUpdate(room);
      return;
    }

    case 'start_battle': {
      const room = getRoomFor(p);
      if (!room || room.started || room.host !== p.id || room.players.length !== 2) return;
      const ps = roomPlayers(room);
      if (!ps.every(x => x.ready)) return send(p, { type: 'room_error', message: 'يجب أن يكون اللاعبان جاهزين.' });
      room.started = true;
      const start = { type: 'battle_start', room: room.code, roomName: room.name || ('غرفة '+room.code), players: ps };
      for (const id of room.players) send(players.get(id), start);
      sendRooms();
      return;
    }

    case 'leave_room':
      leaveRoom(p, true);
      return;

    case 'invite': {
      const target = players.get(String(m.targetId || ''));
      if (!target || target.id === p.id || target.ws.readyState !== 1) return send(p, { type: 'room_error', message: 'اللاعب غير متصل.' });
      if (target.room) return send(p, { type: 'room_error', message: 'اللاعب داخل غرفة بالفعل.' });
      send(target, { type: 'invite', room: p.room || null, fromId: p.id, fromName: cleanName(m.name || p.name), settings: cleanSettings(m.settings || p.settings) });
      return;
    }

    case 'accept_invite': {
      const code = String(m.room || '').toUpperCase();
      const room = rooms.get(code);
      if (!room || room.started || room.players.length >= 2) return send(p, { type: 'room_error', message: 'الدعوة لم تعد متاحة.' });
      p.name = cleanName(m.name || p.name);
      p.settings = cleanSettings(m.settings || p.settings);
      if (!p.room) { room.players.push(p.id); p.room = code; p.ready = false; }
      sendRoomUpdate(room);
      return;
    }

    case 'reject_invite':
      return;

    case 'state': {
      const room = getRoomFor(p);
      if (!room || !room.started) return;
      room.state = m.state || null;
      for (const id of room.players) if (id !== p.id) {
        const peer = players.get(id);
        if (peer) send(peer, { type: 'state', state: m.state });
      }
      return;
    }

    default:
      return;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, service: 'Tank Game GameRanger Server', websocket: '/ws', database: false, rooms: rooms.size, players: presenceList().length, uptime: process.uptime(), time: Date.now() }));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  const p = { id: uid(), ws, name: 'Commander', settings: cleanSettings(), room: null, ready: false, lastSeen: now() };
  players.set(p.id, p);
  send(p, { type: 'hello', id: p.id });
  sendPresence();

  ws.on('message', data => {
    try { handle(p, JSON.parse(data.toString())); } catch (_) { send(p, { type: 'room_error', message: 'رسالة غير صالحة.' }); }
  });
  ws.on('pong', () => { p.lastSeen = now(); });
  ws.on('close', () => removePlayer(p));
  ws.on('error', () => {});
});

setInterval(() => {
  const t = now();
  for (const p of [...players.values()]) {
    if (!p.ws || p.ws.readyState !== 1 || t - p.lastSeen > PRESENCE_TIMEOUT) {
      try { p.ws?.terminate(); } catch (_) {}
      removePlayer(p);
    } else {
      try { p.ws.ping(); } catch (_) {}
    }
  }
  sendPresence();
  sendRooms();
}, 5000);

server.listen(PORT, '0.0.0.0', () => console.log(`Tank Game server listening on ${PORT}`));
