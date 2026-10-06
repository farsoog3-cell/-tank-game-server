/**
 * CONTROL BATTLE - Authoritative 1v1 WebSocket server
 * Render-ready: npm install && npm start
 */
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 10000);
const TICK_MS = 50; // 20 authoritative ticks/sec
const MAP = { id:'control-battle-main', seed: 731924, limit:420, spawnDistance:120 };

const UNIT_DEFS = {
  builder: {cost:300, hp:900, speed:4.2, range:0, damage:0, reload:0},
  tank:    {cost:500, hp:900, speed:3.0, range:52, damage:90, reload:900},
  rocket:  {cost:800, hp:700, speed:2.2, range:170, damage:240, reload:6500},
  scout:   {cost:500, hp:520, speed:5.0, range:30, damage:25, reload:700},
  ambulance:{cost:600,hp:650,speed:3.4,range:0,damage:0,reload:0},
  infantry:{cost:150,hp:180,speed:2.2,range:28,damage:22,reload:800}
};
const BUILD_DEFS = {
  factory:{cost:400,hp:1600,buildMs:15000},
  barracks:{cost:250,hp:900,buildMs:10000}
};
const PRODUCE = {
  factory:{tank:'tank',rocket:'rocket',scout:'scout',ambulance:'ambulance'},
  barracks:{infantry:'infantry'}
};

const rooms = new Map();

function now(){ return Date.now(); }
function id(prefix){ return prefix+'_'+crypto.randomBytes(6).toString('hex'); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(a,b){ return Math.hypot(a.x-b.x,a.z-b.z); }
function cleanNum(v,d=0){ return Number.isFinite(Number(v)) ? Number(v) : d; }

function makeRoom(){
  const room = {
    id:id('room'),
    createdAt:now(),
    startedAt:null,
    status:'waiting',
    seed:MAP.seed,
    players:new Map(),
    units:new Map(),
    buildings:new Map(),
    bases:{
      p1:{x:120,z:120,hp:5000,maxHp:5000},
      p2:{x:-120,z:-120,hp:5000,maxHp:5000}
    },
    lastBroadcast:0,
    seq:0
  };
  rooms.set(room.id,room);
  return room;
}

function teamOf(room, ws){ for(const p of room.players.values()) if(p.ws===ws) return p.team; return null; }
function playerOf(room, team){ for(const p of room.players.values()) if(p.team===team) return p; return null; }

function send(ws,msg){
  if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(room,msg){
  const s=JSON.stringify(msg);
  for(const p of room.players.values()) if(p.ws.readyState===WebSocket.OPEN) p.ws.send(s);
}

function snapshot(room){
  const units=[...room.units.values()].map(u=>({
    id:u.id, owner:u.owner, type:u.type, x:u.x,z:u.z,rot:u.rot,
    hp:u.hp,maxHp:u.maxHp, state:u.state, targetId:u.targetId||null,
    production:u.production ? {
      type:u.production.type, startedAt:u.production.startedAt,
      readyAt:u.production.readyAt
    }:null
  }));
  const buildings=[...room.buildings.values()].map(b=>({
    id:b.id,owner:b.owner,type:b.type,x:b.x,z:b.z,rot:b.rot,
    hp:b.hp,maxHp:b.maxHp,done:b.done,buildStartedAt:b.buildStartedAt,buildReadyAt:b.buildReadyAt,
    production:b.production?{type:b.production.type,startedAt:b.production.startedAt,readyAt:b.production.readyAt}:null
  }));
  const players={};
  for(const p of room.players.values()) players[p.team]={
    id:p.id,name:p.name,color:p.color,money:p.money,connected:p.ws.readyState===WebSocket.OPEN
  };
  return {
    seq:++room.seq, serverTime:now(), roomId:room.id,status:room.status,
    seed:room.seed,map:MAP,players,bases:room.bases,units,buildings,
    winner:room.winner||null
  };
}

function spawnInitial(room, team){
  const b=team==='p1'?room.bases.p1:room.bases.p2;
  const u={
    id:id('u'),owner:team,type:'builder',x:b.x+(team==='p1'?-28:28),z:b.z+(team==='p1'?-28:28),
    rot:team==='p1'?-Math.PI/4:Math.PI/4,
    hp:UNIT_DEFS.builder.hp,maxHp:UNIT_DEFS.builder.hp,state:'idle',targetId:null,
    lastShot:0,production:null
  };
  room.units.set(u.id,u);
}

function startRoom(room){
  if(room.players.size!==2 || room.status==='running') return;
  room.status='running'; room.startedAt=now();
  for(const p of room.players.values()){ p.money=p.startMoney; }
  spawnInitial(room,'p1'); spawnInitial(room,'p2');
  broadcast(room,{type:'match_start',serverTime:now(),roomId:room.id,map:{...MAP},players:[...room.players.values()].map(p=>({id:p.id,team:p.team,color:p.color,name:p.name}))});
  broadcast(room,{type:'state',state:snapshot(room)});
}

function reject(ws,reason){ send(ws,{type:'error',reason}); }

function ownUnit(room,team,uid){ const u=room.units.get(uid); return u&&u.owner===team&&!u.dead?u:null; }
function ownBuilding(room,team,bid){ const b=room.buildings.get(bid); return b&&b.owner===team&&!b.destroyed?b:null; }

function handleCommand(room,ws,msg){
  const team=teamOf(room,ws);
  if(!team) return;
  if(msg.type==='ping'){send(ws,{type:'pong',serverTime:now()});return;}
  if(room.status!=='running') return;

  if(msg.type==='move'){
    const ids=Array.isArray(msg.unitIds)?msg.unitIds:[msg.unitId];
    const x=clamp(cleanNum(msg.x),-MAP.limit,MAP.limit), z=clamp(cleanNum(msg.z),-MAP.limit,MAP.limit);
    let n=0;
    for(const uid of ids){
      const u=ownUnit(room,team,uid); if(!u) continue;
      u.target={x,z};u.state='moving';n++;
    }
    if(!n) reject(ws,'لا توجد وحدة صالحة لهذا الأمر');
    return;
  }

  if(msg.type==='attack'){
    const u=ownUnit(room,team,msg.unitId);
    if(!u) return reject(ws,'الوحدة غير صالحة');
    const target=room.units.get(msg.targetId);
    if(target){
      if(target.owner===team||target.dead) return reject(ws,'هدف غير صالح');
      u.targetId=target.id;u.targetBuildingId=null;u.state='attacking';return;
    }
    const b=room.buildings.get(msg.targetId);
    if(b){
      if(b.owner===team||b.destroyed) return reject(ws,'هدف غير صالح');
      u.targetBuildingId=b.id;u.targetId=null;u.state='attacking';return;
    }
    if(String(msg.targetId||'').startsWith('base:')){
      const targetTeam=String(msg.targetId).slice(5);
      if(targetTeam===team||!room.bases[targetTeam]) return reject(ws,'هدف غير صالح');
      u.targetBase=targetTeam;u.targetId=null;u.targetBuildingId=null;u.state='attacking';return;
    }
    return reject(ws,'هدف غير صالح');
  }

  if(msg.type==='build'){
    const type=msg.buildingType;
    const def=BUILD_DEFS[type];
    const p=playerOf(room,team);
    if(!def||!p) return;
    if(p.money<def.cost) return reject(ws,'الرصيد غير كاف');
    const builder=ownUnit(room,team,msg.builderId);
    if(!builder||builder.type!=='builder') return reject(ws,'يجب اختيار تركس البناء');
    const x=clamp(cleanNum(msg.x),-MAP.limit,MAP.limit), z=clamp(cleanNum(msg.z),-MAP.limit,MAP.limit);
    if(dist(builder,{x,z})>35) return reject(ws,'موقع البناء بعيد عن التركس');
    for(const b of room.buildings.values()) if(dist(b,{x,z})<15 && !b.destroyed) return reject(ws,'المكان مشغول');
    p.money-=def.cost;
    const t=now();
    const b={id:id('b'),owner:team,type,x,z,rot:cleanNum(msg.rot),hp:def.hp,maxHp:def.hp,done:false,
      buildStartedAt:t,buildReadyAt:t+def.buildMs,production:null,destroyed:false};
    room.buildings.set(b.id,b);
    builder.target={x,z};builder.state='building';builder.buildingId=b.id;
    return;
  }

  if(msg.type==='produce'){
    const type=msg.unitType, bid=msg.buildingId, b=ownBuilding(room,team,bid), p=playerOf(room,team);
    if(!b||!b.done||!p) return reject(ws,'منشأة غير جاهزة');
    const defKey=b.type==='factory'?PRODUCE.factory[type]:PRODUCE.barracks[type];
    if(!defKey) return reject(ws,'وحدة غير متاحة');
    if(b.production) return reject(ws,'المنشأة مشغولة');
    const def=UNIT_DEFS[defKey];
    if(p.money<def.cost) return reject(ws,'الرصيد غير كاف');
    p.money-=def.cost;
    const duration=defKey==='infantry'?7000:(defKey==='rocket'?15000:10000);
    const t=now();
    b.production={type:defKey,startedAt:t,readyAt:t+duration};
    return;
  }

  if(msg.type==='fire_scud'){
    const u=ownUnit(room,team,msg.unitId);
    if(!u||u.type!=='rocket') return reject(ws,'هذه ليست عربة صاروخية');
    if(now()-u.lastShot<6500) return reject(ws,'الصاروخ ما زال في التهدئة');
    u.lastShot=now();u.rocketTarget={x:cleanNum(msg.x),z:cleanNum(msg.z)};
    // server-side area damage is applied immediately at impact time.
    u.rocketImpactAt=now()+2200; u.state='rocket';
    return;
  }
}

function finishBuilds(room,t){
  for(const b of room.buildings.values()){
    if(!b.destroyed&&!b.done&&t>=b.buildReadyAt){
      b.done=true;
      const near=[...room.units.values()].find(u=>u.owner===b.owner&&u.type==='builder'&&u.buildingId===b.id);
      if(near){near.buildingId=null;near.state='idle';near.target=null;}
    }
    if(b.done&&b.production&&t>=b.production.readyAt){
      const type=b.production.type; b.production=null;
      const spawn={x:b.x,z:b.z+(b.owner==='p1'?9:-9)};
      const def=UNIT_DEFS[type];
      const u={id:id('u'),owner:b.owner,type,x:spawn.x,z:spawn.z,rot:b.owner==='p1'?0:Math.PI,
        hp:def.hp,maxHp:def.hp,state:'idle',targetId:null,lastShot:0,production:null};
      room.units.set(u.id,u);
    }
  }
}

function tickUnits(room,t){
  for(const u of room.units.values()){
    if(u.dead) continue;
    if(u.rocketImpactAt&&t>=u.rocketImpactAt){
      const p=u.rocketTarget; delete u.rocketImpactAt;
      for(const v of room.units.values()){
        if(v.dead||v.owner===u.owner) continue;
        const d=dist(v,p); if(d<=30){v.hp-=Math.max(40,Math.floor(240*(1-d/30)));if(v.hp<=0)v.dead=true;}
      }
      for(const b of room.buildings.values()){
        if(b.destroyed||b.owner===u.owner)continue;
        const d=dist(b,p);if(d<=28){b.hp-=Math.max(80,Math.floor(350*(1-d/28)));if(b.hp<=0)b.destroyed=true;}
      }
      continue;
    }
    if(u.target){
      const d=dist(u,u.target);
      if(d<1.5){u.target=null;u.state='idle';}
      else{
        const s=UNIT_DEFS[u.type].speed*(TICK_MS/1000);
        const dx=(u.target.x-u.x)/d,dz=(u.target.z-u.z)/d;
        u.x=clamp(u.x+dx*Math.min(s,d),-MAP.limit,MAP.limit);
        u.z=clamp(u.z+dz*Math.min(s,d),-MAP.limit,MAP.limit);
        u.rot=Math.atan2(dx,dz);
      }
    }
    if(u.targetId){
      const target=room.units.get(u.targetId);
      if(!target||target.dead||target.owner===u.owner){u.targetId=null;u.state='idle';continue;}
      const d=dist(u,target), def=UNIT_DEFS[u.type];
      if(d<=def.range){
        if(t-u.lastShot>=def.reload){
          u.lastShot=t; target.hp-=def.damage;
          if(target.hp<=0){target.hp=0;target.dead=true;}
        }
      }else{u.target={x:target.x,z:target.z};u.state='attacking';}
    }
    if(u.targetBuildingId){
      const b=room.buildings.get(u.targetBuildingId);
      if(!b||b.destroyed||b.owner===u.owner){u.targetBuildingId=null;u.state='idle';continue;}
      const d=dist(u,b),def=UNIT_DEFS[u.type];
      if(d<=Math.max(def.range,24)){
        if(t-u.lastShot>=def.reload){u.lastShot=t;b.hp-=def.damage;if(b.hp<=0){b.hp=0;b.destroyed=true;}}
      }else{u.target={x:b.x,z:b.z};u.state='attacking';}
    }
    if(u.targetBase){
      const base=room.bases[u.targetBase];
      if(!base||u.targetBase===u.owner){u.targetBase=null;u.state='idle';continue;}
      const d=dist(u,base),def=UNIT_DEFS[u.type];
      if(d<=Math.max(def.range,30)){
        if(t-u.lastShot>=def.reload){u.lastShot=t;base.hp-=def.damage;if(base.hp<=0){base.hp=0;room.winner=u.owner;room.status='finished';broadcast(room,{type:'state',state:snapshot(room)});}}
      }else{u.target={x:base.x,z:base.z};u.state='attacking';}
    }
  }
}

function cleanup(room){
  for(const [uid,u] of room.units) if(u.dead) room.units.delete(uid);
  for(const [bid,b] of room.buildings) if(b.destroyed&&b.hp<=0) room.buildings.delete(bid);
  for(const team of ['p1','p2']){
    const base=room.bases[team];
    const alive=[...room.units.values()].some(u=>u.owner===team);
    // bases are not destroyed by ordinary units in this core until an explicit base-targeting extension.
    void alive;
  }
}

function tick(){
  const t=now();
  for(const room of rooms.values()){
    if(room.status!=='running') continue;
    finishBuilds(room,t);
    tickUnits(room,t);
    cleanup(room);
    if(t-room.lastBroadcast>=100){room.lastBroadcast=t;broadcast(room,{type:'state',state:snapshot(room)});}
  }
}
setInterval(tick,TICK_MS);

const server=http.createServer((req,res)=>{
  if(req.url==='/health'||req.url==='/'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:true,name:'CONTROL BATTLE Multiplayer Server',protocol:1,rooms:rooms.size,time:now()}));
    return;
  }
  res.writeHead(404);res.end('Not found');
});
const wss=new WebSocket.Server({server});

wss.on('connection',(ws)=>{
  const room=[...rooms.values()].find(r=>r.status==='waiting'&&r.players.size<2)||makeRoom();
  const team=room.players.size===0?'p1':'p2';
  const player={id:id('p'),ws,team,name:`PLAYER ${team==='p1'?'1':'2'}`,color:team==='p1'?'#168cff':'#f43f5e',money:3000,startMoney:3000};
  room.players.set(player.id,player);
  ws.roomId=room.id;ws.playerId=player.id;
  send(ws,{type:'welcome',playerId:player.id,team,roomId:room.id,serverTime:now(),map:MAP});
  if(room.players.size===1){
    send(ws,{type:'waiting',message:'بانتظار اللاعب الثاني...'});
  }else{
    startRoom(room);
  }
  ws.on('message',(raw)=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==='configure'){
        player.name=String(msg.name||player.name).slice(0,24);
        player.color=/^#[0-9a-f]{6}$/i.test(msg.color||'')?msg.color:player.color;
        player.startMoney=clamp(cleanNum(msg.money,3000),1000,5000);
        if(room.status==='waiting'&&room.players.size===2)startRoom(room);
        return;
      }
      handleCommand(room,ws,msg);
    }catch(e){send(ws,{type:'error',reason:'رسالة غير صالحة'});}
  });
  ws.on('close',()=>{
    player.ws=ws;
    // Keep the room for a short reconnect window.
    player.disconnectedAt=now();
    setTimeout(()=>{
      if(player.disconnectedAt&&now()-player.disconnectedAt>=15000){
        room.players.delete(player.id);
        if(room.players.size===0) rooms.delete(room.id);
        else if(room.status==='running'){room.status='paused';broadcast(room,{type:'waiting',message:'انقطع أحد اللاعبين. بانتظار عودته...' });}
      }
    },16000);
  });
});

server.listen(PORT,()=>console.log(`CONTROL BATTLE server listening on ${PORT}`));
