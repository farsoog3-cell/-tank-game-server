const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 10000);
const MAX_PLAYERS = 2;
const ROOM_TTL_MS = 30 * 60 * 1000;
const ALLOWED_MONEY = new Set([1000, 2000, 3000, 5000]);
const COLORS = new Set([
  '#168cff','#ef4444','#22c55e','#f59e0b',
  '#a855f7','#06b6d4','#f472b6','#f8fafc'
]);

const rooms = new Map();
const clients = new Map();

function id(prefix = '') {
  return prefix + crypto.randomBytes(7).toString('hex');
}
function now() { return Date.now(); }
function cleanName(value) {
  const s = String(value ?? '').trim().replace(/[<>]/g, '');
  return s.slice(0, 28) || 'غرفة جماعية';
}
function validColor(value) {
  return COLORS.has(String(value).toLowerCase()) ? String(value).toLowerCase() : null;
}
function safeMoney(value) {
  const n = Number(value);
  return ALLOWED_MONEY.has(n) ? n : 3000;
}
function playerView(p) {
  return { id:p.id, name:p.name, color:p.color, ready:!!p.ready, playerId:p.playerId };
}
function roomView(r) {
  return {
    id:r.id,
    name:r.name,
    money:r.money,
    players:r.players.map(playerView),
    hostId:r.hostId,
    started:r.started,
    createdAt:r.createdAt
  };
}
function openRoomView(r) {
  return {
    id:r.id,
    name:r.name,
    money:r.money,
    players:r.players.length,
    started:false
  };
}
function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function broadcastRoom(r, message) {
  for (const p of r.players) {
    const c = clients.get(p.id);
    if (c) send(c.ws, message);
  }
}
function listRooms(ws) {
  const result = [...rooms.values()]
    .filter(r => !r.started && r.players.length < MAX_PLAYERS)
    .sort((a,b) => b.createdAt - a.createdAt)
    .map(openRoomView);
  send(ws, { type:'rooms', rooms:result });
}
function leaveClient(clientId, silent = false) {
  const c = clients.get(clientId);
  if (!c) return;
  const roomId = c.roomId;
  if (roomId && rooms.has(roomId)) {
    const r = rooms.get(roomId);
    r.players = r.players.filter(p => p.id !== clientId);
    if (r.players.length === 0) {
      rooms.delete(roomId);
    } else {
      if (r.hostId === clientId) r.hostId = r.players[0].id;
      if (!r.started) broadcastRoom(r, { type:'room_update', room:roomView(r) });
    }
  }
  c.roomId = null;
  if (!silent) send(c.ws, { type:'left_room' });
}
function reject(ws, message) { send(ws, {type:'room_error', message}); }
function roomForClient(client) {
  return client.roomId ? rooms.get(client.roomId) : null;
}
function findPlayer(r, clientId) { return r?.players.find(p => p.id === clientId) || null; }
function uniqueColor(r, requested, fallback) {
  const taken = new Set(r.players.map(p => p.color.toLowerCase()));
  const c = validColor(requested);
  if (c && !taken.has(c)) return c;
  for (const x of COLORS) if (!taken.has(x)) return x;
  return fallback || '#168cff';
}
function maybeStart(r) {
  if (!r || r.started || r.players.length !== MAX_PLAYERS) return;
  if (!r.players.every(p => p.ready)) return;
  r.started = true;
  r.startedAt = now();
  r.seed = crypto.randomInt(1, 0x7fffffff);
  const [a,b] = r.players;
  for (const p of r.players) {
    const opponent = p.id === a.id ? b : a;
    send(clients.get(p.id)?.ws, {
      type:'game_start',
      roomId:r.id,
      playerId:p.playerId,
      opponentId:opponent.playerId,
      seed:r.seed,
      serverTime:now(),
      room:roomView(r),
      config:{
        money:r.money,
        playerColor:p.color,
        playerColorName:'ONLINE',
        enemyColor:opponent.color,
        enemyColorName:'OPPONENT'
      }
    });
  }
}

const httpServer = http.createServer((req,res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ok:true,service:'tank-game-server',rooms:rooms.size,clients:clients.size}));
  }
  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'not_found'}));
});

const wss = new WebSocket.Server({server:httpServer});

wss.on('connection', ws => {
  const clientId = id('c_');
  const client = { id:clientId, ws, roomId:null };
  clients.set(clientId, client);
  send(ws, {type:'hello', clientId});

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return reject(ws,'رسالة غير صالحة من العميل.'); }
    const type = String(msg.type || '');

    if (type === 'list_rooms') return listRooms(ws);

    if (type === 'create_room') {
      if (client.roomId) return reject(ws,'أنت موجود داخل غرفة بالفعل.');
      const color = validColor(msg.color) || '#168cff';
      const room = {
        id:id('room_'),
        name:cleanName(msg.name),
        money:safeMoney(msg.money),
        hostId:clientId,
        players:[{id:clientId,name:'المضيف',color,ready:false,playerId:0}],
        started:false,
        createdAt:now(),
        seed:null
      };
      rooms.set(room.id, room);
      client.roomId = room.id;
      send(ws,{type:'room_created',room:roomView(room)});
      broadcastRoom(room,{type:'room_update',room:roomView(room)});
      return;
    }

    if (type === 'join_room') {
      if (client.roomId) return reject(ws,'أنت داخل غرفة بالفعل.');
      const room = rooms.get(String(msg.roomId));
      if (!room || room.started) return reject(ws,'الغرفة غير موجودة أو بدأت بالفعل.');
      if (room.players.length >= MAX_PLAYERS) return reject(ws,'الغرفة ممتلئة.');
      const color = uniqueColor(room,msg.color,'#ef4444');
      room.players.push({id:clientId,name:cleanName(msg.name || 'لاعب'),color,ready:false,playerId:1});
      client.roomId = room.id;
      send(ws,{type:'room_joined',room:roomView(room)});
      broadcastRoom(room,{type:'room_update',room:roomView(room)});
      return;
    }

    const room = roomForClient(client);
    if (!room) {
      if (['toggle_ready','set_color','leave_room','game_event'].includes(type)) return reject(ws,'انضم إلى غرفة أولاً.');
      return;
    }
    const player = findPlayer(room,clientId);
    if (!player) return;

    if (type === 'set_color') {
      if (room.started) return reject(ws,'لا يمكن تغيير اللون بعد بدء المباراة.');
      const c = validColor(msg.color);
      if (!c) return reject(ws,'لون غير مسموح.');
      const taken = room.players.some(p => p.id !== clientId && p.color.toLowerCase() === c);
      if (taken) return reject(ws,'هذا اللون مستخدم من اللاعب الآخر.');
      player.color = c;
      player.ready = false;
      return broadcastRoom(room,{type:'room_update',room:roomView(room)});
    }

    if (type === 'toggle_ready') {
      if (room.started) return reject(ws,'المباراة بدأت بالفعل.');
      if (room.players.length !== MAX_PLAYERS) return reject(ws,'يجب انتظار لاعب آخر قبل الاستعداد.');
      player.ready = !player.ready;
      broadcastRoom(room,{type:'room_update',room:roomView(room)});
      maybeStart(room);
      return;
    }

    if (type === 'leave_room') {
      leaveClient(clientId);
      listRooms(ws);
      return;
    }

    if (type === 'game_event') {
      if (!room.started) return reject(ws,'المباراة لم تبدأ.');
      // Relay only to the opponent. The server tags the event and room/author.
      // This is the transport layer; authoritative unit/build validation must be added to each game command.
      const payload = msg.payload ?? null;
      for (const p of room.players) {
        if (p.id === clientId) continue;
        const other = clients.get(p.id);
        if (other) send(other.ws,{type:'peer_message',roomId:room.id,from:player.playerId,payload,serverTime:now()});
      }
      return;
    }
  });

  ws.on('close', () => {
    leaveClient(clientId,true);
    clients.delete(clientId);
  });
});

setInterval(() => {
  const cutoff = now() - ROOM_TTL_MS;
  for (const [rid,r] of rooms) {
    if (!r.started && r.createdAt < cutoff) {
      for (const p of r.players) {
        const c=clients.get(p.id); if(c){c.roomId=null;send(c.ws,{type:'room_error',message:'انتهت مدة الغرفة بسبب عدم النشاط.'});}
      }
      rooms.delete(rid);
    }
  }
}, 60_000).unref();

httpServer.listen(PORT, () => console.log(`Tank game server listening on port ${PORT}`));
