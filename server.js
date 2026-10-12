'use strict';

const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 10000);
const MAX_ROOMS = 200;
const MAX_PLAYERS = 2;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const DISCONNECT_GRACE_MS = 20 * 1000;
const SNAPSHOT_MIN_MS = 33;
const MAX_PAYLOAD = 1024 * 1024;
const MAP_LIMIT = 420;
const PROTOCOL_VERSION = 5;

const rooms = new Map();
const clients = new Map();
const COLORS = new Set([
  '#168cff','#ef4444','#22c55e','#f59e0b','#a855f7','#06b6d4','#f97316','#e11d48'
]);

function id(prefix='id'){ return prefix+'_'+crypto.randomBytes(9).toString('base64url'); }
function token(){ return crypto.randomBytes(24).toString('base64url'); }
function now(){ return Date.now(); }
function safeName(v){ const s=String(v??'').replace(/[<>\u0000-\u001f]/g,'').trim(); return s.slice(0,32)||'لاعب'; }
function safeColor(v){ const s=String(v||'').toLowerCase(); return /^#[0-9a-f]{6}$/.test(s)&&COLORS.has(s)?s:'#168cff'; }
function safeMoney(v){ const n=Number(v); return [1000,2000,3000,4000].includes(n)?n:1000; }
function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
function finite(v,f=0){ return Number.isFinite(Number(v))?Number(v):f; }

// IMPORTANT: disconnected players remain in the room.
// ws may be null after a browser closes, so send() must never dereference null.
function send(c,msg){
  if(!c || !c.ws || c.ws.readyState!==WebSocket.OPEN) return false;
  try{ c.ws.send(JSON.stringify(msg)); return true; }catch{ return false; }
}
function broadcastRoom(room,msg){ for(const p of room.players.values()) send(p,msg); }
function publicPlayer(p){ return {id:p.id,name:p.name,color:p.color,ready:!!p.ready,connected:!!p.connected}; }
function publicRoom(room){
  return {id:room.id,name:room.name,players:room.players.size,maxPlayers:MAX_PLAYERS,money:room.money,started:room.started,createdAt:room.createdAt,public:true};
}
function lobbyRoom(room){ return {...publicRoom(room),players:[...room.players.values()].map(publicPlayer)}; }
function listRooms(){ return [...rooms.values()].filter(r=>!r.started&&r.players.size<MAX_PLAYERS&&now()-r.createdAt<ROOM_TTL_MS).map(publicRoom); }

function createRoom(c,payload){
  if(c.room) return send(c,{type:'room_error',message:'أنت داخل غرفة بالفعل'});
  if(rooms.size>=MAX_ROOMS) return send(c,{type:'room_error',message:'السيرفر ممتلئ حاليًا'});
  const room={id:id('room'),name:safeName(payload.name||'غرفة جماعية'),money:safeMoney(payload.money),createdAt:now(),lastActivity:now(),started:false,startAt:0,seed:crypto.randomInt(1,0x7fffffff),players:new Map(),snapshots:new Map(),disconnectTimers:new Map()};
  c.room=room;c.slot=1;c.ready=false;c.name=safeName(payload.name||'لاعب');c.color=safeColor(payload.color);c.resumeToken=token();c.connected=true;
  room.players.set(c.id,c);rooms.set(room.id,room);
  send(c,{type:'room_created',room:lobbyRoom(room),resumeToken:c.resumeToken,protocolVersion:PROTOCOL_VERSION});
  broadcastRoom(room,{type:'room_state',room:lobbyRoom(room)});
}

function joinRoom(c,payload){
  if(c.room) return send(c,{type:'room_error',message:'أنت داخل غرفة بالفعل'});
  const room=rooms.get(String(payload.roomId||''));
  if(!room) return send(c,{type:'room_error',message:'الغرفة غير موجودة'});
  if(room.started) return send(c,{type:'room_error',message:'المباراة بدأت بالفعل'});
  if(room.players.size>=MAX_PLAYERS) return send(c,{type:'room_error',message:'الغرفة ممتلئة'});
  room.lastActivity=now();c.room=room;c.slot=2;c.ready=false;c.name=safeName(payload.name||'لاعب');c.color=safeColor(payload.color);c.resumeToken=token();c.connected=true;room.players.set(c.id,c);
  send(c,{type:'room_joined',room:lobbyRoom(room),resumeToken:c.resumeToken,protocolVersion:PROTOCOL_VERSION});broadcastRoom(room,{type:'room_state',room:lobbyRoom(room)});
}

function endRoomForPlayer(c){
  const room=c.room;if(!room)return;
  room.players.delete(c.id);room.snapshots.delete(c.id);room.disconnectTimers.delete(c.id);
  c.room=null;c.slot=0;c.ready=false;c.connected=false;
  if(room.players.size===0){rooms.delete(room.id);return;}
  if(room.started) broadcastRoom(room,{type:'match_end',result:{winnerId:[...room.players.keys()][0],reason:'player_left_explicit'}});
  else broadcastRoom(room,{type:'room_state',room:lobbyRoom(room)});
}

function leaveRoom(c){
  const room=c.room;if(!room)return;
  // During an active match a normal leave is treated as an explicit surrender.
  endRoomForPlayer(c);
}

function toggleReady(c){
  const room=c.room;if(!room)return send(c,{type:'room_error',message:'أنت لست داخل غرفة'});
  if(room.started)return;c.ready=!c.ready;room.lastActivity=now();broadcastRoom(room,{type:'room_state',room:lobbyRoom(room)});
  if(room.players.size===MAX_PLAYERS&&[...room.players.values()].every(p=>p.ready))startMatch(room);
}
function setColor(c,payload){ if(!c.room||c.room.started)return;c.color=safeColor(payload.color);c.room.lastActivity=now();broadcastRoom(c.room,{type:'room_state',room:lobbyRoom(c.room)}); }

function startMatch(room){
  if(room.started||room.players.size!==MAX_PLAYERS)return;
  const players=[...room.players.values()].sort((a,b)=>a.slot-b.slot);if(!players.every(p=>p.ready))return;
  room.started=true;room.startAt=now()+1200;room.lastActivity=now();
  for(const p of players){p.ready=true;p.connected=!!p.ws;room.snapshots.set(p.id,{seq:0,state:null,receivedAt:0});}
  for(const p of players){const opponent=players.find(x=>x.id!==p.id);send(p,{type:'game_start',roomId:room.id,playerSlot:p.slot,playerServerId:p.id,opponentServerId:opponent.id,opponentId:opponent.id,seed:room.seed,serverTime:room.startAt,resumeToken:p.resumeToken,protocolVersion:PROTOCOL_VERSION,config:{money:room.money,player:{id:p.id,name:p.name,color:p.color,colorName:'PLAYER'},opponent:{id:opponent.id,name:opponent.name,color:opponent.color,colorName:'OPPONENT'}}});}
}

function sanitizeUnit(u){
  if(!u||typeof u!=='object')return null;const idv=String(u.id||'').slice(0,80);if(!idv)return null;
  return {id:idv,type:String(u.type||'normal').slice(0,24),infantry:!!u.infantry,builder:!!u.builder,x:clamp(finite(u.x),-MAP_LIMIT,MAP_LIMIT),z:clamp(finite(u.z),-MAP_LIMIT,MAP_LIMIT),y:clamp(finite(u.y),-100,100),rot:finite(u.rot),hp:clamp(finite(u.hp,100),0,100000),maxHp:clamp(finite(u.maxHp,100),1,100000),destroyed:!!u.destroyed,target:u.target&&typeof u.target==='object'?{x:clamp(finite(u.target.x),-MAP_LIMIT,MAP_LIMIT),z:clamp(finite(u.target.z),-MAP_LIMIT,MAP_LIMIT)}:null,guard:u.guard&&typeof u.guard==='object'?{x:clamp(finite(u.guard.x),-MAP_LIMIT,MAP_LIMIT),z:clamp(finite(u.guard.z),-MAP_LIMIT,MAP_LIMIT)}:null};
}
function sanitizeBuilding(b){
  if(!b||typeof b!=='object'||!b.id)return null;const out={id:String(b.id).slice(0,80),type:String(b.type||'building').slice(0,24),x:clamp(finite(b.x),-MAP_LIMIT,MAP_LIMIT),z:clamp(finite(b.z),-MAP_LIMIT,MAP_LIMIT),y:clamp(finite(b.y),-100,100),rot:finite(b.rot),hp:clamp(finite(b.hp,1000),0,100000),maxHp:clamp(finite(b.maxHp,1000),1,100000),done:b.done!==false,destroyed:!!b.destroyed,owner:'player',progress:clamp(finite(b.progress,b.done===false?0:1),0,1)};
  if(b.production&&typeof b.production==='object')out.production={type:String(b.production.type||'unknown').slice(0,30),elapsed:clamp(finite(b.production.elapsed),0,3600000),duration:clamp(finite(b.production.duration,1),1,3600000)};return out;
}
function sanitizeState(state){
  if(!state||typeof state!=='object')return null;
  const units=Array.isArray(state.units)?state.units.slice(0,200).map(sanitizeUnit).filter(Boolean):[];
  const buildings=Array.isArray(state.buildings)?state.buildings.slice(0,100).map(sanitizeBuilding).filter(Boolean):[];
  const oil=Array.isArray(state.oil)?state.oil.slice(0,16).map(r=>({id:String(r.id||'').slice(0,80),x:clamp(finite(r.x),-MAP_LIMIT,MAP_LIMIT),z:clamp(finite(r.z),-MAP_LIMIT,MAP_LIMIT),hp:clamp(finite(r.hp,700),0,100000),maxHp:clamp(finite(r.maxHp,700),1,100000),owner:['player','enemy','none'].includes(r.owner)?r.owner:'none',captureProgress:clamp(finite(r.captureProgress),0,1)})):[];
  return {money:clamp(Math.floor(finite(state.money)),0,100000000),units,buildings,oil,base:state.base?{hp:clamp(finite(state.base.hp,1600),0,1000000),maxHp:clamp(finite(state.base.maxHp,1600),1,1000000)}:null,__seq:Math.max(0,Math.floor(finite(state.__seq))),__clientTime:finite(state.__clientTime)};
}
function buildServerState(room){
  const packet={tick:Math.floor((now()-room.startAt)/50),serverTime:now(),players:[]};
  for(const p of room.players.values()){const s=room.snapshots.get(p.id);if(!s?.state)continue;packet.players.push({id:p.id,name:p.name,color:p.color,slot:p.slot,connected:!!p.connected,state:s.state});}
  return packet;
}
function broadcastServerState(room){broadcastRoom(room,{type:'server_state',state:buildServerState(room)});}

function receiveGameEvent(c,payload){
  const room=c.room;if(!room||!room.started||!payload||typeof payload!=='object')return;
  if(payload.kind==='authoritative_snapshot'){
    const nowMs=now(),rec=room.snapshots.get(c.id)||{seq:0,state:null,receivedAt:0};if(nowMs-rec.receivedAt<SNAPSHOT_MIN_MS)return;
    const state=sanitizeState(payload.state);if(!state)return;if(state.__seq<rec.seq)return;
    rec.seq=state.__seq;rec.state=state;rec.receivedAt=nowMs;room.snapshots.set(c.id,rec);room.lastActivity=nowMs;broadcastServerState(room);return;
  }
  const raw=JSON.stringify(payload);if(raw.length>50000)return;for(const p of room.players.values())if(p.id!==c.id)send(p,{type:'peer_message',payload:{...payload,from:c.id}});
}
function sendCachedState(c){if(c.room&&c.room.started){send(c,{type:'server_state',state:buildServerState(c.room)});}}

function resumeRoom(c,payload){
  const room=rooms.get(String(payload.roomId||''));if(!room)return send(c,{type:'room_error',message:'جلسة الغرفة انتهت'});
  const old=[...room.players.values()].find(p=>p.resumeToken===String(payload.resumeToken||''));if(!old)return send(c,{type:'room_error',message:'رمز الاستعادة غير صالح'});
  if(old.ws&&old.ws!==c.ws)try{old.ws.close();}catch{}
  if(old.disconnectTimer)clearTimeout(old.disconnectTimer);room.disconnectTimers.delete(old.id);
  clients.delete(old.id);c.id=old.id;c.name=old.name;c.color=old.color;c.slot=old.slot;c.ready=old.ready;c.resumeToken=old.resumeToken;c.room=room;c.connected=true;
  room.players.set(c.id,c);clients.set(c.id,c);
  send(c,{type:'room_state',room:lobbyRoom(room),resumeToken:c.resumeToken,protocolVersion:PROTOCOL_VERSION});
  const opponent=[...room.players.values()].find(p=>p.id!==c.id);
  if(room.started&&opponent){send(c,{type:'game_start',roomId:room.id,playerSlot:c.slot,playerServerId:c.id,opponentServerId:opponent.id,opponentId:opponent.id,seed:room.seed,serverTime:room.startAt,resumeToken:c.resumeToken,protocolVersion:PROTOCOL_VERSION,config:{money:room.money,player:{id:c.id,name:c.name,color:c.color,colorName:'PLAYER'},opponent:{id:opponent.id,name:opponent.name,color:opponent.color,colorName:'OPPONENT'}}});sendCachedState(c);broadcastRoom(room,{type:'player_connection',playerId:c.id,connected:true});}
}

function handle(c,msg){
  if(!msg||typeof msg!=='object'||typeof msg.type!=='string')return;
  switch(msg.type){case 'list_rooms':send(c,{type:'rooms',rooms:listRooms()});break;case 'create_room':createRoom(c,msg);break;case 'join_room':joinRoom(c,msg);break;case 'leave_room':leaveRoom(c);break;case 'toggle_ready':toggleReady(c);break;case 'set_color':setColor(c,msg);break;case 'resume_room':resumeRoom(c,msg);break;case 'game_event':receiveGameEvent(c,msg.payload);break;case 'request_state':sendCachedState(c);break;case 'ping':send(c,{type:'pong',serverTime:now()});break;default:send(c,{type:'room_error',message:'أمر غير معروف'});}
}

const httpServer=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/health'){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,service:'tactical-rts-online',rooms:rooms.size,clients:clients.size,protocolVersion:PROTOCOL_VERSION,time:now()}));}res.writeHead(404);res.end('Not found');});
const wss=new WebSocket.Server({server:httpServer,maxPayload:MAX_PAYLOAD,perMessageDeflate:true});
wss.on('connection',(ws)=>{
  const c={id:id('player'),ws,room:null,slot:0,name:'لاعب',color:'#168cff',ready:false,resumeToken:token(),connectedAt:now(),connected:true};clients.set(c.id,c);
  send(c,{type:'connected',protocolVersion:PROTOCOL_VERSION});send(c,{type:'hello',clientId:c.id,resumeToken:c.resumeToken,protocolVersion:PROTOCOL_VERSION});
  ws.on('message',(data,isBinary)=>{if(isBinary)return;try{handle(c,JSON.parse(data.toString()));}catch{send(c,{type:'room_error',message:'بيانات غير صالحة'});}});
  ws.on('close',()=>{clients.delete(c.id);const room=c.room;if(!room)return;c.ws=null;c.connected=false;
    if(room.started){broadcastRoom(room,{type:'player_connection',playerId:c.id,connected:false});if(c.disconnectTimer)clearTimeout(c.disconnectTimer);const timer=setTimeout(()=>{if(c.room===room&&(!c.ws||c.ws.readyState!==WebSocket.OPEN)){/* keep match + snapshot; do not end it */}},DISCONNECT_GRACE_MS);c.disconnectTimer=timer;room.disconnectTimers.set(c.id,timer);room.lastActivity=now();}
    else endRoomForPlayer(c);
  });
  ws.on('error',()=>{});
});
setInterval(()=>{const t=now();for(const [rid,room] of rooms){if(room.players.size===0){rooms.delete(rid);continue;}if(!room.started&&t-room.createdAt>ROOM_TTL_MS)rooms.delete(rid);if(room.started&&t-room.lastActivity>ROOM_TTL_MS)rooms.delete(rid);}},60000).unref();
httpServer.listen(PORT,()=>console.log(`Tactical RTS server listening on ${PORT}`));
