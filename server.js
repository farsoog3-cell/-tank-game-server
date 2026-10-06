
'use strict';

const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS_PER_ROOM = 2;
const ROOM_CODE_LENGTH = 6;
const STATE_RATE_MS = 60;
const CLIENT_TIMEOUT_MS = 20000;
const ROOM_IDLE_MS = 30 * 60 * 1000;

const clients = new Map(); // id -> client
const rooms = new Map();   // code -> room
const presence = new Map();

function now() { return Date.now(); }

function cleanText(value, max, fallback = '') {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max) || fallback;
}

function cleanColor(value, fallback = '#168cff') {
  const s = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function cleanSettings(settings = {}) {
  return {
    money: Math.max(0, Math.min(1000000, Number(settings.money) || 3000)),
    color: cleanColor(settings.color),
    colorName: cleanText(settings.colorName, 20, 'BLUE')
  };
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(client, payload) {
  if (!client || client.ws.readyState !== WebSocket.OPEN) return;
  try { client.ws.send(JSON.stringify(payload)); } catch (_) {}
}

function roomPlayers(room) {
  return [...room.players].map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    ready: !!c.ready,
    settings: { ...c.settings }
  }));
}

function roomMessage(room) {
  return {
    type: 'room_update',
    room: room.code,
    roomName: room.name,
    hostId: room.hostId,
    players: roomPlayers(room),
    started: room.started
  };
}

function broadcastRoom(room, payload) {
  for (const c of room.players) send(c, payload);
}

function broadcastRoomUpdate(room) {
  broadcastRoom(room, roomMessage(room));
}

function getRoom(code) {
  return rooms.get(String(code || '').trim().toUpperCase());
}

function leaveRoom(client, notify = true) {
  const room = client.roomCode ? rooms.get(client.roomCode) : null;
  if (!room) {
    client.roomCode = null;
    client.role = null;
    client.ready = false;
    return;
  }

  room.players = room.players.filter(c => c !== client);
  client.roomCode = null;
  client.role = null;
  client.ready = false;

  if (room.hostId === client.id && room.players.length) {
    room.hostId = room.players[0].id;
    room.players[0].role = 'host';
  }

  if (room.players.length === 0) {
    rooms.delete(room.code);
  } else {
    room.started = false;
    for (const c of room.players) c.ready = false;
    broadcastRoomUpdate(room);
    broadcastRoom(room, { type: 'peer_left', playerId: client.id });
  }

  if (notify) send(client, { type: 'left_room' });
}

function validateRoomForStart(room) {
  if (!room) return 'الغرفة غير موجودة.';
  if (room.players.length !== 2) return 'يجب أن يوجد لاعبان في الغرفة.';
  if (!room.players.every(c => c.ready)) return 'يجب أن يكون اللاعبان جاهزين.';
  if (room.players.some(c => !cleanText(c.name, 18))) return 'اسم اللاعب غير صالح.';
  if (room.players[0].settings.color.toLowerCase() === room.players[1].settings.color.toLowerCase()) {
    return 'يجب اختيار لونين مختلفين.';
  }
  return null;
}

function startRoom(room) {
  const error = validateRoomForStart(room);
  if (error) {
    broadcastRoom(room, { type: 'room_error', message: error });
    return;
  }

  room.started = true;
  room.startedAt = now();
  room.stateSeq = 0;

  const payload = {
    type: 'battle_start',
    room: room.code,
    roomName: room.name,
    hostId: room.hostId,
    players: roomPlayers(room),
    startedAt: room.startedAt
  };

  broadcastRoom(room, payload);
}

function sendPresenceList() {
  const list = [...presence.values()].map(c => ({
    id: c.id,
    name: c.name,
    settings: { ...c.settings },
    room: c.roomCode || null,
    online: true
  }));
  for (const c of clients.values()) send(c, { type: 'presence_list', players: list });
}

function broadcastRooms() {
  const list = [...rooms.values()]
    .filter(r => !r.started)
    .map(r => ({
      room: r.code,
      roomName: r.name,
      hostId: r.hostId,
      players: roomPlayers(r),
      count: r.players.length,
      maxPlayers: MAX_PLAYERS_PER_ROOM
    }));
  for (const c of clients.values()) send(c, { type: 'rooms', rooms: list });
}

function createRoom(client, msg) {
  if (client.roomCode) leaveRoom(client, false);

  const code = randomCode();
  const room = {
    code,
    name: cleanText(msg.roomName, 24, 'Desert Battle'),
    hostId: client.id,
    players: [],
    started: false,
    startedAt: 0,
    stateSeq: 0,
    lastStateAt: new Map(),
    createdAt: now(),
    lastActivity: now()
  };

  client.name = cleanText(msg.name, 18, 'Commander');
  client.settings = cleanSettings(msg.settings);
  client.role = 'host';
  client.ready = false;
  client.roomCode = code;

  room.players.push(client);
  rooms.set(code, room);

  send(client, {
    type: 'hello_room',
    room: code,
    roomName: room.name,
    role: 'host'
  });
  send(client, {
    type: 'room_created',
    room: code,
    roomName: room.name,
    role: 'host',
    players: roomPlayers(room)
  });
  broadcastRoomUpdate(room);
  broadcastRooms();
}

function joinRoom(client, msg) {
  const room = getRoom(msg.room);
  if (!room) return send(client, { type: 'room_error', message: 'الغرفة غير موجودة.' });
  if (room.started) return send(client, { type: 'room_error', message: 'المعركة بدأت بالفعل.' });
  if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
    return send(client, { type: 'room_error', message: 'الغرفة ممتلئة.' });
  }

  if (client.roomCode) leaveRoom(client, false);

  client.name = cleanText(msg.name, 18, 'Commander');
  client.settings = cleanSettings(msg.settings);
  client.role = 'player';
  client.ready = false;
  client.roomCode = room.code;

  room.players.push(client);
  room.lastActivity = now();

  send(client, {
    type: 'room_joined',
    room: room.code,
    roomName: room.name,
    role: 'player',
    players: roomPlayers(room)
  });
  broadcastRoomUpdate(room);
  broadcastRooms();
}

function updateSettings(client, msg) {
  const name = cleanText(msg.name, 18, client.name || 'Commander');
  client.name = name;
  client.settings = cleanSettings({ ...client.settings, ...(msg.settings || {}) });

  if (client.roomCode) {
    const room = rooms.get(client.roomCode);
    if (room) {
      // Changing profile cancels ready so both clients explicitly confirm it.
      client.ready = false;
      room.lastActivity = now();
      broadcastRoomUpdate(room);
    }
  }
  presence.set(client.id, client);
  sendPresenceList();
}

function handleState(client, msg) {
  const room = client.roomCode ? rooms.get(client.roomCode) : null;
  if (!room || !room.started) return;

  const t = now();
  const previous = room.lastStateAt.get(client.id) || 0;
  if (t - previous < STATE_RATE_MS) return;
  room.lastStateAt.set(client.id, t);

  const state = msg && msg.state;
  if (!state || typeof state !== 'object') return;

  // Relay the sender's snapshot to the other player only.
  // The game client remains responsible for rendering/interpolation.
  const safe = {
    units: Array.isArray(state.units) ? state.units.slice(0, 500) : [],
    buildings: Array.isArray(state.buildings) ? state.buildings.slice(0, 300) : [],
    oil: Array.isArray(state.oil) ? state.oil.slice(0, 100) : [],
    baseHp: Number.isFinite(Number(state.baseHp)) ? Number(state.baseHp) : 6500,
    money: Number.isFinite(Number(state.money)) ? Number(state.money) : 0,
    color: cleanColor(state.color, client.settings.color),
    colorName: cleanText(state.colorName, 20, client.settings.colorName),
    sentAt: t
  };

  room.stateSeq++;
  room.lastActivity = t;

  for (const peer of room.players) {
    if (peer !== client) {
      send(peer, {
        type: 'state',
        from: client.id,
        seq: room.stateSeq,
        state: safe
      });
    }
  }
}

function handle(client, msg) {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'presence':
      client.name = cleanText(msg.name, 18, client.name || 'Commander');
      client.settings = cleanSettings({ ...client.settings, ...(msg.settings || {}) });
      presence.set(client.id, client);
      send(client, {
        type: 'hello',
        id: client.id
      });
      sendPresenceList();
      break;

    case 'get_rooms':
      send(client, {
        type: 'rooms',
        rooms: [...rooms.values()].filter(r => !r.started).map(r => ({
          room: r.code,
          roomName: r.name,
          hostId: r.hostId,
          players: roomPlayers(r),
          count: r.players.length,
          maxPlayers: MAX_PLAYERS_PER_ROOM
        }))
      });
      break;

    case 'create_room':
      createRoom(client, msg);
      break;

    case 'join_room':
      joinRoom(client, msg);
      break;

    case 'settings':
      updateSettings(client, msg);
      break;

    case 'ready': {
      const room = client.roomCode ? rooms.get(client.roomCode) : null;
      if (!room || room.started) return;
      client.ready = !!msg.ready;
      room.lastActivity = now();
      broadcastRoomUpdate(room);
      break;
    }

    case 'start_battle': {
      const room = client.roomCode ? rooms.get(client.roomCode) : null;
      if (!room || room.hostId !== client.id) {
        return send(client, { type: 'room_error', message: 'فقط صاحب الغرفة يستطيع بدء المعركة.' });
      }
      startRoom(room);
      break;
    }

    case 'state':
      handleState(client, msg);
      break;

    case 'leave_room':
      leaveRoom(client, true);
      broadcastRooms();
      sendPresenceList();
      break;

    case 'ping':
      send(client, { type: 'pong', t: now() });
      break;

    case 'invite': {
      const target = clients.get(String(msg.targetId || ''));
      if (!target) return send(client, { type: 'invite_error', message: 'اللاعب غير متصل.' });
      send(target, {
        type: 'invite',
        inviteId: crypto.randomUUID(),
        room: client.roomCode || '',
        fromId: client.id,
        name: client.name,
        settings: client.settings
      });
      send(client, { type: 'invite_sent', name: target.name });
      break;
    }

    case 'accept_invite':
      // The client then sends the normal join_room message. This acknowledgement
      // keeps compatibility with the current UI.
      send(client, { type: 'invite_accepted', room: msg.room || '' });
      break;

    case 'reject_invite':
      send(client, { type: 'invite_rejected' });
      break;

    default:
      // Unknown messages are ignored instead of crashing the connection.
      break;
  }
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      service: 'tank-game-pvp-server',
      rooms: rooms.size,
      players: clients.size,
      time: new Date().toISOString()
    }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

wss.on('connection', (ws, req) => {
  const id = crypto.randomUUID();
  const client = {
    id,
    ws,
    name: 'Commander',
    settings: cleanSettings(),
    roomCode: null,
    role: null,
    ready: false,
    lastSeen: now()
  };

  clients.set(id, client);
  presence.set(id, client);

  send(client, { type: 'hello', id });
  sendPresenceList();
  broadcastRooms();

  ws.on('pong', () => { client.lastSeen = now(); });

  ws.on('message', raw => {
    client.lastSeen = now();
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }
    handle(client, msg);
  });

  ws.on('close', () => {
    leaveRoom(client, false);
    clients.delete(id);
    presence.delete(id);
    sendPresenceList();
    broadcastRooms();
  });

  ws.on('error', () => {
    try { ws.close(); } catch (_) {}
  });
});

setInterval(() => {
  const t = now();

  for (const client of clients.values()) {
    if (t - client.lastSeen > CLIENT_TIMEOUT_MS) {
      try { client.ws.terminate(); } catch (_) {}
    } else {
      try { client.ws.ping(); } catch (_) {}
    }
  }

  for (const [code, room] of rooms) {
    if (room.players.length === 0 || t - room.lastActivity > ROOM_IDLE_MS) {
      for (const c of room.players) {
        c.roomCode = null;
        c.role = null;
        c.ready = false;
      }
      rooms.delete(code);
    }
  }

  broadcastRooms();
}, 10000);

httpServer.listen(PORT, HOST, () => {
  console.log(`Tank Game PvP server listening on ${HOST}:${PORT}`);
  console.log(`WebSocket: ws://${HOST}:${PORT}/ws`);
  console.log(`Health:    http://${HOST}:${PORT}/health`);
});
