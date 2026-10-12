'use strict';
// CONTROL BATTLE WebSocket match server. Compatible with the game's raw WebSocket protocol.
// The server aggregates snapshots from both players and continues construction/production
// for a disconnected player so the opponent's view does not freeze at the last frame.
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const PORT = Number(process.env.PORT || 10000);
const TICK_MS = 100;
const DISCONNECT_GRACE_MS = 10 * 60 * 1000;
const ROOM_TTL_MS = 30 * 60 * 1000;
const rooms = new Map();
const clients = new Map();
const uid = p => `${p||''}${crypto.randomBytes(6).toString('hex')}`;
const now = () => Date.now();
const cleanName = (v, f='لاعب') => String(v ?? f).replace(/[<>]/g,'').trim().slice(0,28) || f;
const cleanColor = (v, f='#168cff') => /^#[0-9a-f]{6}$/i.test(String(v||'')) ? String(v) : f;
const num = (v, f=0) => Number.isFinite(Number(v)) ? Number(v) : f;
function send(ws, obj){ if(ws && ws.readyState===WebSocket.OPEN) try{ws.send(JSON.stringify(obj));}catch(_){} }
function roomOf(client){return client?.roomId ? rooms.get(client.roomId) : null;}
function publicRoom(r){return {id:r.id,name:r.name,money:r.money,players:r.players.length,maxPlayers:2,started:r.started};}
function publicState(r){return {id:r.id,name:r.name,money:r.money,hostId:r.hostId,started:r.started,players:r.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:p.ready,connected:!!p.ws}))};}
function broadcastRoom(r,msg){for(const p of r.players)send(p.ws,msg);}
function roomList(ws){send(ws,{type:'rooms',rooms:[...rooms.values()].filter(r=>!r.started&&r.players.some(p=>p.ws)).map(publicRoom)});}
function emitState(r){
  if(!r.started)return;
  const packet={tick:r.tick,serverTime:now(),players:r.players.map(p=>({id:p.id,color:p.color,name:p.name,connected:!!p.ws,state:p.state||{money:r.money,units:[],buildings:[],oil:[],base:null}}))};
  broadcastRoom(r,{type:'server_state',state:packet});
}
function makeStart(r,p,resumed=false){
  const i=r.players.indexOf(p),opp=r.players[1-i];
  send(p.ws,{type:'game_start',roomId:r.id,room:publicState(r),playerId:i,playerSlot:i+1,playerServerId:p.id,opponentServerId:opp?.id||null,seed:r.seed,serverTime:r.startedAt,resumeToken:p.resumeToken,resumed,config:{money:r.money,player:{id:p.id,color:p.color,colorName:p.name},opponent:{id:opp?.id,color:opp?.color||'#ef4444',colorName:opp?.name||'OPPONENT'},playerColor:p.color,playerColorName:p.name,enemyColor:opp?.color||'#ef4444',enemyColorName:opp?.name||'OPPONENT'}});
}
function startIfReady(r){
  if(r.started||r.players.length!==2||!r.players.every(p=>p.ready&&p.ws))return;
  r.started=true;r.seed=crypto.randomBytes(4).readUInt32BE(0);r.startedAt=now();r.lastActivity=now();r.tick=0;
  for(const p of r.players)makeStart(r,p,false);
  emitState(r);
}
function detach(ws, reason='disconnect'){
  const c=clients.get(ws);if(!c)return;
  const r=roomOf(c);clients.delete(ws);
  if(!r){return;}
  const p=r.players.find(x=>x.id===c.playerId)||r.players.find(x=>x.ws===ws);
  if(!p)return;
  p.ws=null;p.disconnectedAt=now();r.lastActivity=now();
  if(r.started){
    broadcastRoom(r,{type:'peer_message',payload:{kind:'player_connection',playerId:p.id,connected:false,reason,at:now()}});
    emitState(r);
  }else{
    r.players=r.players.filter(x=>x!==p);
    if(!r.players.length)rooms.delete(r.id);else{if(r.hostId===p.id)r.hostId=r.players[0].id;broadcastRoom(r,{type:'room_state',room:publicState(r)});}
  }
}
function createRoom(client,msg){
  const r={id:uid('room_'),name:cleanName(msg.name,'معركة جماعية'),money:Math.max(1000,Math.min(5000,num(msg.money,1000))),hostId:client.id,players:[],started:false,seed:0,startedAt:0,tick:0,lastActivity:now()};
  const p={id:client.id,name:cleanName(msg.namePlayer,'القائد'),color:cleanColor(msg.color),ready:false,ws:client.ws,resumeToken:uid('resume_'),state:null,disconnectedAt:null,generatedUnits:[],offlineBuilds:{},offlineProduction:{}};
  r.players.push(p);client.roomId=r.id;client.playerId=p.id;rooms.set(r.id,r);
  send(client.ws,{type:'room_created',room:publicState(r)});send(client.ws,{type:'hello',clientId:client.id,resumeToken:p.resumeToken});roomList(client.ws);
}
function joinRoom(client,msg){
  const r=rooms.get(String(msg.roomId||''));
  if(!r||r.started){send(client.ws,{type:'room_error',message:'الغرفة غير متاحة'});return;}
  if(r.players.length>=2){send(client.ws,{type:'room_error',message:'الغرفة ممتلئة'});return;}
  const p={id:client.id,name:cleanName(msg.name,'اللاعب الثاني'),color:cleanColor(msg.color,'#ef4444'),ready:false,ws:client.ws,resumeToken:uid('resume_'),state:null,disconnectedAt:null,generatedUnits:[],offlineBuilds:{},offlineProduction:{}};
  r.players.push(p);client.roomId=r.id;client.playerId=p.id;r.lastActivity=now();
  send(client.ws,{type:'room_joined',room:publicState(r)});send(client.ws,{type:'hello',clientId:client.id,resumeToken:p.resumeToken});broadcastRoom(r,{type:'room_state',room:publicState(r)});
}
function resumeRoom(client,msg){
  const token=String(msg.resumeToken||'');let r=null,p=null;
  for(const room of rooms.values()){const found=room.players.find(x=>x.resumeToken===token&&x.id);if(found){r=room;p=found;break;}}
  if(!r||!p||String(msg.roomId||r.id)!==r.id){send(client.ws,{type:'room_error',message:'انتهت مهلة استعادة المباراة'});return;}
  if(p.ws&&p.ws!==client.ws){send(client.ws,{type:'room_error',message:'هذه الجلسة متصلة بالفعل'});return;}
  p.ws=client.ws;p.disconnectedAt=null;client.roomId=r.id;client.playerId=p.id;r.lastActivity=now();
  send(client.ws,{type:'hello',clientId:client.id,resumeToken:p.resumeToken});
  if(r.started){makeStart(r,p,true);setTimeout(()=>emitState(r),120);}
  else{send(client.ws,{type:'room_joined',room:publicState(r)});broadcastRoom(r,{type:'room_state',room:publicState(r)});}
  broadcastRoom(r,{type:'peer_message',payload:{kind:'player_connection',playerId:p.id,connected:true,at:now()}});
}
function mergeClientState(player,incoming){
  if(!incoming||typeof incoming!=='object')return;
  const old=player.state||{};
  const oldBuildings=new Map((old.buildings||[]).map(b=>[b.id,b]));
  const newBuildings=(Array.isArray(incoming.buildings)?incoming.buildings:[]).map(b=>{
    const prev=oldBuildings.get(b.id);if(!prev)return b;
    // Never let a stale tab rewind a construction that the server completed while it was disconnected.
    if(prev.__serverDone)return {...b,done:true,progress:1,__serverDone:true,__serverBuildStartedAt:prev.__serverBuildStartedAt,__serverBuildDurationMs:prev.__serverBuildDurationMs};
    if(prev.__serverBuildStartedAt)return {...b,__serverBuildStartedAt:prev.__serverBuildStartedAt,__serverBuildDurationMs:prev.__serverBuildDurationMs,progress:Math.max(num(b.progress),num(prev.progress)),done:!!prev.done||!!b.done};
    // Production clock lives on the job, not on the building. Preserve that clock across stale snapshots.
    const oldJob=prev.production;
    if(oldJob?.__serverProductionStartedAt && b.production && oldJob.type===b.production.type){
      const incomingStarted=num(b.production.startedAt,0), completedAt=num(prev.__serverLastProduction?.completedAt,0);
      if(completedAt && incomingStarted && incomingStarted<=completedAt)return {...b,production:null,__serverLastProduction:prev.__serverLastProduction};
      return {...b,production:{...b.production,__serverProductionStartedAt:oldJob.__serverProductionStartedAt,__serverProductionDurationMs:oldJob.__serverProductionDurationMs,elapsed:Math.max(num(b.production.elapsed),num(oldJob.elapsed))},__serverLastProduction:prev.__serverLastProduction};
    }
    if(prev.__serverLastProduction && b.production){
      const incomingStarted=num(b.production.startedAt,0);
      if(incomingStarted && incomingStarted<=num(prev.__serverLastProduction.completedAt,0))return {...b,production:null,__serverLastProduction:prev.__serverLastProduction};
    }
    return {...b,__serverLastProduction:prev.__serverLastProduction};
  });
  const incomingUnits=Array.isArray(incoming.units)?incoming.units.slice():[];
  const ids=new Set(incomingUnits.map(u=>u.id));
  for(const u of (player.generatedUnits||[]))if(!ids.has(u.id))incomingUnits.push(u);
  player.state={...incoming,buildings:newBuildings,units:incomingUnits};
}
function advanceOfflineState(player,dt,stamp){
  const state=player.state;if(!state)return;
  state.units=Array.isArray(state.units)?state.units:[];state.buildings=Array.isArray(state.buildings)?state.buildings:[];
  const builders=state.units.filter(u=>u&&u.builder&&!u.destroyed);
  for(const b of state.buildings){
    if(!b||b.destroyed)continue;
    if(!b.done){
      const durationMs=b.__serverBuildDurationMs||(b.type==='barracks'?12000:20000);
      let startedAt=Number(b.__serverBuildStartedAt)||0;
      const builder=builders.sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(c.x-b.x,c.z-b.z))[0];
      if(!startedAt&&builder){
        const rot=num(b.rot),tx=num(b.x)-Math.sin(rot)*18,tz=num(b.z)-Math.cos(rot)*18;
        const dx=tx-num(builder.x),dz=tz-num(builder.z),dist=Math.hypot(dx,dz);
        if(dist>4.8){const step=Math.min(dist-4.2,Math.max(.12,5.2*dt/1000));builder.x+=dx/dist*step;builder.z+=dz/dist*step;builder.rot=Math.atan2(dx,dz);builder.target={x:tx,z:tz};}
        else{startedAt=stamp;b.__serverBuildStartedAt=startedAt;b.__serverBuildDurationMs=durationMs;}
      }
      if(startedAt){const progress=Math.max(num(b.progress),Math.min(1,(stamp-startedAt)/durationMs));b.progress=progress;b.__serverBuildStartedAt=startedAt;b.__serverBuildDurationMs=durationMs;if(progress>=1){b.done=true;b.progress=1;b.__serverDone=true;if(builder){builder.target={x:num(b.x)-Math.sin(num(b.rot))*30,z:num(b.z)-Math.cos(num(b.rot))*30};}}}
    }
    if(b.done&&b.production){
      const job=b.production;const durationMs=Math.max(1000,num(job.durationMs,num(job.duration,60)/60*1000));
      if(!job.__serverProductionStartedAt){job.__serverProductionStartedAt=stamp-Math.max(0,num(job.elapsed))/60*1000;job.__serverProductionDurationMs=durationMs;}
      const elapsedMs=Math.max(0,stamp-job.__serverProductionStartedAt);job.elapsed=Math.min(num(job.duration,60),elapsedMs/1000*60);job.durationMs=durationMs;
      if(elapsedMs>=durationMs){
        const rot=num(b.rot),type=String(job.type||'normal'),startedAt=num(job.startedAt,job.__serverProductionStartedAt),id=`server-production:${player.id}:${b.id}:${startedAt}`;
        const already=(player.generatedUnits||[]).some(u=>u.id===id);
        if(!already){
          const forward=25;const unit={id,type,infantry:type==='infantry',builder:false,x:num(b.x)+Math.sin(rot)*forward,z:num(b.z)+Math.cos(rot)*forward,y:num(b.y),rot,hp:type==='rocket'?650:500,maxHp:type==='rocket'?650:500,destroyed:false,target:null,serverProduced:true};
          player.generatedUnits=player.generatedUnits||[];player.generatedUnits.push(unit);if(player.generatedUnits.length>200)player.generatedUnits=player.generatedUnits.slice(-200);
          state.units.push(unit);
        }
        b.__serverLastProduction={type,startedAt,completedAt:stamp};b.production=null;
      }
    }
  }
}
function onMessage(client,msg){
  const type=String(msg.type||'');
  if(type==='list_rooms'){roomList(client.ws);return;}
  if(type==='create_room'){if(client.roomId){const old=roomOf(client);if(old&&!old.started)detach(client.ws,'replace_room');}createRoom(client,msg);return;}
  if(type==='join_room'){joinRoom(client,msg);return;}
  if(type==='resume_room'){resumeRoom(client,msg);return;}
  const r=roomOf(client),p=r&&r.players.find(x=>x.id===client.playerId);
  if(type==='set_color'&&r&&p){p.color=cleanColor(msg.color,p.color);broadcastRoom(r,{type:'room_state',room:publicState(r)});return;}
  if(type==='toggle_ready'&&r&&!r.started&&p){p.ready=!p.ready;broadcastRoom(r,{type:'room_state',room:publicState(r)});startIfReady(r);return;}
  if(type==='leave_room'&&r&&p){if(r.started){p.ws=null;p.disconnectedAt=now();client.roomId=null;client.playerId=null;broadcastRoom(r,{type:'peer_message',payload:{kind:'player_connection',playerId:p.id,connected:false,reason:'left',at:now()}});emitState(r);}else detach(client.ws,'left');return;}
  if(type==='game_event'&&r&&r.started&&p){const payload=msg.payload;if(!payload||typeof payload!=='object')return;if(payload.kind==='authoritative_snapshot'&&payload.state){mergeClientState(p,payload.state);p.lastSnapshotAt=now();r.lastActivity=now();emitState(r);}else if(payload.kind==='player_command'){broadcastRoom(r,{type:'peer_message',payload:{...payload,playerId:p.id,at:now()}});}return;}
}
const server=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/health'){res.writeHead(200,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({ok:true,service:'control-battle-sync',rooms:rooms.size,clients:clients.size}));return;}res.writeHead(404);res.end('Not found');});
const wss=new WebSocket.Server({server,maxPayload:1024*1024});
wss.on('connection',ws=>{const c={id:uid('c_'),ws,roomId:null,playerId:null};clients.set(ws,c);send(ws,{type:'hello',clientId:c.id});ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString());}catch(_){return;}try{onMessage(c,m);}catch(e){console.error('message error',e);send(ws,{type:'room_error',message:'حدث خطأ في معالجة طلب الشبكة'});}});ws.on('close',()=>detach(ws,'disconnect'));ws.on('error',()=>{});});
setInterval(()=>{const stamp=now();for(const r of rooms.values()){if(r.started){r.tick++;for(const p of r.players)if(!p.ws)advanceOfflineState(p,TICK_MS,stamp);emitState(r);}else if(stamp-r.lastActivity>ROOM_TTL_MS&&!r.players.some(p=>p.ws))rooms.delete(r.id);for(const p of r.players){if(!p.ws&&p.disconnectedAt&&stamp-p.disconnectedAt>DISCONNECT_GRACE_MS){/* retain match state; a later reconnect may still resume until room TTL */}}}},TICK_MS);
server.listen(PORT,()=>console.log(`CONTROL BATTLE sync server listening on ${PORT}`));
