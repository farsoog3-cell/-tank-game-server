/*
 * CONTROL BATTLE — Authoritative Multiplayer Server
 * Node.js + ws
 *
 * Run:
 *   npm install
 *   npm start
 *
 * Local:
 *   ws://localhost:8080
 *
 * Production:
 *   put the server behind a TLS reverse proxy and use wss://...
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const MAX_ROOMS = 500;
const MAX_ROOMS_LIST = 100;
const MAX_NAME = 28;
const MAX_MESSAGE_BYTES = 180000;
const MAX_UNITS = 300;
const MAX_BUILDINGS = 100;
const MAX_OIL = 32;
const WORLD_LIMIT = 600;
const UNIT_SPEEDS = { normal: 8.0, rocket: 7.0, scout: 9.0, ambulance: 8.0, infantry: 6.0, builder: 5.5 };
const UNIT_COSTS = { normal: 500, rocket: 800, scout: 500, ambulance: 600, infantry: 250, builder: 300 };
const UNIT_HP = { normal: 1000, rocket: 1100, scout: 100, ambulance: 500, infantry: 100, builder: 700 };
const UNIT_DAMAGE = { normal: 220, rocket: 450, scout: 0, ambulance: 0, infantry: 24, builder: 0 };
const UNIT_RANGE = { normal: 68, rocket: 220, scout: 0, ambulance: 0, infantry: 22, builder: 0 };
const UNIT_COOLDOWN = { normal: 5000, rocket: 5000, infantry: 1000 };

const rooms = new Map();
const clients = new Map();

function now() { return Date.now(); }
function id(prefix='id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
function clamp(n, a, b) {
  n = Number(n);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}
function finite(n, fallback=0) {
  n = Number(n);
  return Number.isFinite(n) ? n : fallback;
}
function cleanName(v) {
  return String(v ?? '').replace(/[<>]/g,'').trim().slice(0,MAX_NAME) || 'لاعب';
}
function cleanColor(v) {
  const s=String(v||'').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#168cff';
}
function distance(a,b) {
  return Math.hypot(finite(a.x)-finite(b.x), finite(a.z)-finite(b.z));
}

function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    players: room.players.size,
    money: room.config.money,
    started: room.started,
    maxPlayers: 2
  };
}

function publicRoomState(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    started: room.started,
    players: [...room.players.values()].map(p=>({
      id:p.id,
      name:p.name,
      color:p.color,
      ready:!!p.ready
    })),
    config:room.config
  };
}

function makeMatchState(room) {
  return {
    tick: 0,
    serverTime: now(),
    seed: room.seed,
    players: [...room.players.values()].map((p,index)=>({
      id:p.id,
      slot:index,
      name:p.name,
      color:p.color,
      state:{
        money:room.config.money,
        units:[],
        buildings:[],
        oil:[],
        base:{hp:1600,maxHp:1600}
      }
    }))
  };
}

function send(ws, msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const s=JSON.stringify(msg);
    if(Buffer.byteLength(s,'utf8') > MAX_MESSAGE_BYTES) return;
    ws.send(s);
  } catch {}
}

function broadcast(room, msg, exceptId=null) {
  for(const p of room.players.values()){
    if(p.id===exceptId) continue;
    send(p.ws,msg);
  }
}

function fail(ws, message, code='BAD_REQUEST') {
  send(ws,{type:'room_error',code,message});
}

function leaveRoom(client) {
  if(!client || !client.roomId) return;
  const room=rooms.get(client.roomId);
  client.roomId=null;
  if(!room) return;

  room.players.delete(client.id);

  if(room.players.size===0){
    rooms.delete(room.id);
    return;
  }

  if(room.hostId===client.id){
    room.hostId=[...room.players.keys()][0];
  }

  room.started=false;
  room.match=null;
  for(const p of room.players.values()) p.ready=false;
  broadcast(room,{type:'room_update',room:publicRoomState(room)});
}

function sanitizeUnit(u, previous) {
  if(!u || typeof u!=='object') return null;
  const idv=String(u.id||'').slice(0,80);
  if(!idv) return null;

  const out={
    id:idv,
    type:String(u.type||'normal').slice(0,20),
    infantry:!!u.infantry,
    x:clamp(finite(u.x),-600,600),
    z:clamp(finite(u.z),-600,600),
    y:clamp(finite(u.y),-20,100),
    rot:finite(u.rot),
    hp:clamp(finite(u.hp,100),0,100000),
    maxHp:clamp(finite(u.maxHp,100),1,100000),
    destroyed:!!u.destroyed,
    target:null,
    guard:null
  };

  if(u.target && typeof u.target==='object')
    out.target={x:clamp(finite(u.target.x),-600,600),z:clamp(finite(u.target.z),-600,600)};
  if(u.guard && typeof u.guard==='object')
    out.guard={x:clamp(finite(u.guard.x),-600,600),z:clamp(finite(u.guard.z),-600,600)};

  // Anti-teleport: a client may not move one unit an arbitrary distance
  // between two authoritative uploads. Large gaps are accepted after a
  // short disconnect, but still clamped.
  if(previous && !previous.destroyed && !out.destroyed){
    const dt=Math.max(0.05,(now()-previous.receivedAt)/1000);
    const maxDistance=12*dt+8; // generous for the existing game scale
    const d=distance(out,previous);
    if(d>maxDistance){
      const k=maxDistance/d;
      out.x=previous.x+(out.x-previous.x)*k;
      out.z=previous.z+(out.z-previous.z)*k;
    }
    // HP cannot increase by an arbitrary client claim.
    if(out.hp>previous.hp+250) out.hp=previous.hp;
  }
  out.receivedAt=now();
  return out;
}

function sanitizeBuilding(b) {
  if(!b || typeof b!=='object') return null;
  const idv=String(b.id||'').slice(0,80);
  if(!idv) return null;
  return {
    id:idv,
    type:String(b.type||'building').slice(0,20),
    x:clamp(finite(b.x),-600,600),
    z:clamp(finite(b.z),-600,600),
    y:clamp(finite(b.y),-20,100),
    rot:finite(b.rot),
    hp:clamp(finite(b.hp,1000),0,100000),
    maxHp:clamp(finite(b.maxHp,1000),1,100000),
    done:b.done!==false,
    destroyed:!!b.destroyed
  };
}

function sanitizeOil(o) {
  if(!o || typeof o!=='object') return null;
  return {
    id:String(o.id||'').slice(0,80),
    x:clamp(finite(o.x),-600,600),
    z:clamp(finite(o.z),-600,600),
    hp:clamp(finite(o.hp,700),0,100000),
    maxHp:clamp(finite(o.maxHp,700),1,100000),
    owner:['player','enemy','none'].includes(o.owner)?o.owner:'none',
    captureProgress:clamp(finite(o.captureProgress),0,100)
  };
}


function defaultState(room) {
  return { money: room.config.money, units: [], buildings: [], oil: [], base: {hp:1600,maxHp:1600} };
}
function unitCost(type){ return UNIT_COSTS[type] || 500; }
function unitHp(type){ return UNIT_HP[type] || 100; }
function normalizeUnitType(u){
  if(u && u.infantry) return 'infantry';
  const t=String(u && u.type || 'normal');
  return ['normal','rocket','scout','ambulance','infantry','builder'].includes(t)?t:'normal';
}
function findUnit(state,idv){ return (state.units||[]).find(u=>u.id===idv); }
function findPlayerByUnit(room, unitId){
  for(const p of room.players.values()) if(findUnit(p.state||{},unitId)) return p;
  return null;
}
function sanitizeTarget(t){
  if(!t || typeof t!=='object') return null;
  return {x:clamp(finite(t.x),-WORLD_LIMIT,WORLD_LIMIT),z:clamp(finite(t.z),-WORLD_LIMIT,WORLD_LIMIT)};
}
function registerNewUnits(client, list){
  const room=rooms.get(client.roomId); const p=room&&room.players.get(client.id);
  if(!room||!p||!room.started||!Array.isArray(list)) return;
  if(!p.state) p.state=defaultState(room);
  const byId=new Map((p.state.units||[]).map(u=>[u.id,u]));
  let added=0;
  for(const raw of list.slice(0,50)){
    const idv=String(raw&&raw.id||'').slice(0,80); if(!idv||byId.has(idv)) continue;
    const type=normalizeUnitType(raw);
    const cost=unitCost(type);
    // A newly registered unit is treated as a server-side purchase. The browser's
    // local money is never trusted; the server deducts the authoritative cost.
    if(p.state.money<cost) continue;
    if((p.state.units||[]).length>=MAX_UNITS) break;
    const u=sanitizeUnit({...raw,type,infantry:type==='infantry',hp:unitHp(type),maxHp:unitHp(type)},null);
    if(!u) continue;
    u.hp=unitHp(type); u.maxHp=unitHp(type); u.destroyed=false;
    u.target=null; u.guard=null; u.serverControlled=true; u.lastShotAt=0;
    p.state.units.push(u); p.state.money-=cost; byId.set(idv,u); added++;
  }
  return added;
}
function registerNewBuildings(client, list){
  const room=rooms.get(client.roomId); const p=room&&room.players.get(client.id);
  if(!room||!p||!room.started||!Array.isArray(list)) return;
  if(!p.state) p.state=defaultState(room);
  const existing=new Set((p.state.buildings||[]).map(b=>b.id));
  for(const raw of list.slice(0,30)){
    const idv=String(raw&&raw.id||'').slice(0,80); if(!idv||existing.has(idv)) continue;
    const b=sanitizeBuilding(raw); if(!b) continue;
    const cost=b.type==='barracks'?700:1500;
    if(p.state.money<cost) continue;
    p.state.money-=cost; p.state.buildings.push(b); existing.add(idv);
  }
}
function applyCommand(client, cmd){
  const room=rooms.get(client.roomId); const p=room&&room.players.get(client.id);
  if(!room||!p||!room.started||!cmd||typeof cmd!=='object') return;
  if(!p.state) p.state=defaultState(room);
  const unit=findUnit(p.state,String(cmd.unitId||''));
  if(cmd.kind==='move' || cmd.kind==='guard'){
    if(!unit||unit.destroyed) return;
    const target=sanitizeTarget(cmd.target); if(!target) return;
    unit.target=target; if(cmd.kind==='guard') unit.guard=target;
    return;
  }
  if(cmd.kind==='stop'){
    if(unit){unit.target=null;unit.guard=null;} return;
  }
  if(cmd.kind==='attack'){
    if(!unit||unit.destroyed) return;
    const targetId=String(cmd.targetId||'');
    const enemyOwner=findPlayerByUnit(room,targetId);
    if(enemyOwner && enemyOwner.id!==client.id){ unit.attackTarget=targetId; return; }
    if(targetId==='base:'+[...room.players.keys()].find(id=>id!==client.id)){ unit.attackTarget=targetId; }
  }
}
function distanceToTarget(u,t){ return Math.hypot(u.x-t.x,u.z-t.z); }
function nearestEnemy(room, ownerId, u){
  let best=null,bd=Infinity;
  for(const p of room.players.values()) if(p.id!==ownerId){
    for(const e of (p.state&&p.state.units)||[]) if(!e.destroyed){ const d=distanceToTarget(u,e); if(d<bd){bd=d;best={p,e,d};} }
    for(const b of (p.state&&p.state.buildings)||[]) if(!b.destroyed){ const d=distanceToTarget(u,b); if(d<bd){bd=d;best={p,e:b,d,building:true};} }
    const base=p.state&&p.state.base; if(base&&base.hp>0){ const d=distanceToTarget(u,{x:p.id===room.hostId?-90:90,z:p.id===room.hostId?-90:90}); if(d<bd){bd=d;best={p,e:{id:'base:'+p.id,x:p.id===room.hostId?-90:90,z:p.id===room.hostId?-90:90,hp:base.hp,maxHp:base.maxHp},d,base:true};} }
  }
  return best;
}
function simulateRoom(room, dt){
  const players=[...room.players.values()];
  for(const p of players){
    const state=p.state||defaultState(room); p.state=state;
    for(const u of state.units||[]){
      if(u.destroyed) continue;
      const type=normalizeUnitType(u); const speed=UNIT_SPEEDS[type]||8;
      if(u.target){
        const dx=u.target.x-u.x,dz=u.target.z-u.z,d=Math.hypot(dx,dz);
        if(d<=0.8){u.x=u.target.x;u.z=u.target.z;u.target=null;}
        else { const step=Math.min(d,speed*dt); u.x+=dx/d*step;u.z+=dz/d*step;u.rot=Math.atan2(dx,dz); }
      }
      u.x=clamp(u.x,-WORLD_LIMIT,WORLD_LIMIT);u.z=clamp(u.z,-WORLD_LIMIT,WORLD_LIMIT);
      const range=UNIT_RANGE[type]||0; const damage=UNIT_DAMAGE[type]||0; const cd=UNIT_COOLDOWN[type]||5000;
      if(damage>0){
        let target=null;
        if(u.attackTarget){
          for(const ep of players) if(ep.id!==p.id){target=(ep.state.units||[]).find(x=>x.id===u.attackTarget&&!x.destroyed); if(target) break;}
        }
        if(!target){ const near=nearestEnemy(room,p.id,u); if(near&&near.d<=range){target=near.e; if(near.base) target.__baseOwner=near.p.id;} }
        if(target){
          const d=distanceToTarget(u,target);
          if(d<=range && now()-(u.lastShotAt||0)>=cd){
            u.lastShotAt=now();
            if(target.__baseOwner){const bp=players.find(x=>x.id===target.__baseOwner); if(bp&&bp.state.base) bp.state.base.hp=Math.max(0,bp.state.base.hp-damage);}
            else target.hp=Math.max(0,(target.hp||0)-damage);
            if(target.hp<=0) target.destroyed=true;
          }
        }
      }
    }
    // Simple server economy: oil controlled by this player yields income.
    const owned=(state.oil||[]).filter(o=>o.owner===p.id||o.owner==='player').length;
    if(owned>0) state.money=Math.min(100000000,state.money+owned*dt*1.5);
  }
}

function acceptSnapshot(client, payload) {
  const room=rooms.get(client.roomId); if(!room||!room.started||!room.match) return;
  const incoming=payload&&payload.state; const p=room.players.get(client.id); if(!p||!incoming||typeof incoming!=='object') return;
  if(!p.state || !p.state.initialized){
    const units=Array.isArray(incoming.units)?incoming.units.slice(0,MAX_UNITS).map(u=>sanitizeUnit(u,null)).filter(Boolean):[];
    units.forEach(u=>{u.type=normalizeUnitType(u);u.serverControlled=true;u.lastShotAt=0;u.target=null;u.guard=null;});
    p.state={money:room.config.money,units,buildings:Array.isArray(incoming.buildings)?incoming.buildings.slice(0,MAX_BUILDINGS).map(sanitizeBuilding).filter(Boolean):[],oil:Array.isArray(incoming.oil)?incoming.oil.slice(0,MAX_OIL).map(sanitizeOil).filter(Boolean):[],base:{hp:clamp(finite(incoming.base&&incoming.base.hp,1600),0,1600),maxHp:1600},initialized:true};
  } else {
    // After initialization, client snapshots may only register entities that the
    // renderer created. Existing server transforms/HP/money remain authoritative.
    registerNewUnits(client,Array.isArray(incoming.units)?incoming.units:[]);
    registerNewBuildings(client,Array.isArray(incoming.buildings)?incoming.buildings:[]);
  }
  p.lastClientTick=finite(payload.clientTick,0);p.lastStateAt=now();
}

function startRoom(room) {
  room.started=true;
  room.seed=crypto.randomBytes(4).readUInt32LE(0);
  room.match=makeMatchState(room);

  const players=[...room.players.values()];
  players.forEach((p,i)=>{
    p.ready=true;
    p.state=room.match.players[i].state;
  });

  players.forEach((p,i)=>{
    const other=players[1-i];
    send(p.ws,{
      type:'game_start',
      roomId:room.id,
      playerId:i,
      opponentId:other ? other.id : null,
      seed:room.seed,
      serverTime:now(),
      config:{
        money:room.config.money,
        playerColor:p.color,
        playerColorName:'ONLINE',
        enemyColor:other ? other.color : '#ef4444',
        enemyColorName:'OPPONENT'
      },
      room:publicRoomState(room)
    });
  });
}

function broadcastState(room) {
  if(!room.match) return;
  room.match.tick++;
  room.match.serverTime=now();

  room.match.players=[...room.players.values()].map((p,index)=>({
    id:p.id,
    slot:index,
    name:p.name,
    color:p.color,
    state:p.state || {
      money:room.config.money,
      units:[],
      buildings:[],
      oil:[],
      base:{hp:1600,maxHp:1600}
    }
  }));

  for(const p of room.players.values()){
    send(p.ws,{
      type:'server_state',
      tick:room.match.tick,
      serverTime:room.match.serverTime,
      seed:room.seed,
      players:room.match.players
    });
  }
}

function handle(ws,msg) {
  const client=clients.get(ws);
  if(!client || !msg || typeof msg!=='object') return;

  switch(msg.type){
    case 'list_rooms': {
      send(ws,{type:'rooms',rooms:[...rooms.values()]
        .filter(r=>!r.started && r.players.size<2)
        .slice(0,MAX_ROOMS_LIST)
        .map(publicRoom)});
      break;
    }

    case 'create_room': {
      if(client.roomId) leaveRoom(client);
      if(rooms.size>=MAX_ROOMS) return fail(ws,'السيرفر ممتلئ حالياً');
      const name=cleanName(msg.name || 'غرفة جماعية');
      const money=[1000,2000,3000,5000].includes(Number(msg.money)) ? Number(msg.money) : 3000;
      const room={
        id:id('room'),
        name,
        hostId:client.id,
        config:{money},
        seed:0,
        started:false,
        match:null,
        players:new Map()
      };
      const player={
        id:client.id, ws, name:cleanName(msg.playerName||'لاعب 1'),
        color:cleanColor(msg.color), ready:false,
        state:null, lastStateAt:0, lastClientTick:0
      };
      room.players.set(client.id,player);
      client.roomId=room.id;
      rooms.set(room.id,room);
      send(ws,{type:'room_created',room:publicRoomState(room)});
      break;
    }

    case 'join_room': {
      const room=rooms.get(String(msg.roomId||''));
      if(!room) return fail(ws,'الغرفة غير موجودة');
      if(room.started) return fail(ws,'المباراة بدأت بالفعل');
      if(room.players.size>=2) return fail(ws,'الغرفة ممتلئة');
      if(client.roomId) leaveRoom(client);

      const player={
        id:client.id, ws, name:cleanName(msg.name||'لاعب 2'),
        color:cleanColor(msg.color), ready:false,
        state:null,lastStateAt:0,lastClientTick:0
      };
      room.players.set(client.id,player);
      client.roomId=room.id;
      send(ws,{type:'room_joined',room:publicRoomState(room)});
      broadcast(room,{type:'room_update',room:publicRoomState(room)});
      break;
    }

    case 'set_color': {
      const room=rooms.get(client.roomId);
      const p=room&&room.players.get(client.id);
      if(!p || room.started) return;
      p.color=cleanColor(msg.color);
      broadcast(room,{type:'room_update',room:publicRoomState(room)});
      break;
    }

    case 'toggle_ready': {
      const room=rooms.get(client.roomId);
      const p=room&&room.players.get(client.id);
      if(!p || room.started) return;
      p.ready=!p.ready;
      broadcast(room,{type:'room_update',room:publicRoomState(room)});
      if(room.players.size===2 && [...room.players.values()].every(x=>x.ready)){
        startRoom(room);
      }
      break;
    }

    case 'leave_room':
      leaveRoom(client);
      break;

    case 'game_event': {
      const room=rooms.get(client.roomId);
      if(!room || !room.started) return;
      const payload=msg.payload;
      if(payload && payload.kind==='authoritative_snapshot'){
        acceptSnapshot(client,payload);
      } else if(payload && payload.kind==='command'){
        applyCommand(client,payload.command||payload);
      } else if(payload && payload.kind==='register_entities'){
        registerNewUnits(client,payload.units||[]);
        registerNewBuildings(client,payload.buildings||[]);
      }
      break;
    }

    default:
      fail(ws,'أمر غير معروف: '+String(msg.type||'').slice(0,40));
  }
}

const httpServer=http.createServer((req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({
      ok:true,
      service:'control-battle-authoritative-server',
      rooms:rooms.size,
      players:[...clients.values()].length,
      uptime:process.uptime()
    }));
  }
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
  res.end('CONTROL BATTLE multiplayer server is running.\n');
});

const wss=new WebSocket.Server({
  server:httpServer,
  maxPayload:MAX_MESSAGE_BYTES,
  perMessageDeflate:true
});

wss.on('connection',(ws,req)=>{
  const client={
    id:id('client'),
    ws,
    roomId:null,
    ip:req.headers['x-forwarded-for']||req.socket.remoteAddress||''
  };
  clients.set(ws,client);
  send(ws,{type:'hello',clientId:client.id,serverTime:now(),tickRate:TICK_RATE});

  ws.on('message',(raw)=>{
    try{
      const msg=JSON.parse(raw.toString());
      handle(ws,msg);
    }catch{
      fail(ws,'بيانات غير صالحة');
    }
  });

  ws.on('close',()=>{
    leaveRoom(client);
    clients.delete(ws);
  });

  ws.on('error',()=>{});
});

setInterval(()=>{
  for(const room of rooms.values()){
    if(room.started){ simulateRoom(room,TICK_MS/1000); broadcastState(room); }
  }
},TICK_MS);

httpServer.listen(PORT,HOST,()=>{
  console.log(`CONTROL BATTLE server listening on ${HOST}:${PORT}`);
});
