const http = require("http");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 10000);
const MAX_PLAYERS = 2;
const rooms = new Map();
const sockets = new Map();

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}
function cleanName(v) {
  return String(v || "Commander").replace(/[<>]/g, "").trim().slice(0, 18) || "Commander";
}
function cleanSettings(s) {
  const money = [1000,2000,3000,4000].includes(Number(s?.money)) ? Number(s.money) : 3000;
  const color = /^#[0-9a-fA-F]{6}$/.test(String(s?.color||"")) ? String(s.color) : "#168cff";
  const colorName = String(s?.colorName||"BLUE").replace(/[<>]/g,"").slice(0,12);
  return {money,color,colorName};
}
function send(ws,msg){if(ws&&ws.readyState===1)ws.send(JSON.stringify(msg));}
function currentPlayer(id){return sockets.get(id);}
function publicPresence() {
  return [...sockets.values()]
    .filter(p=>p && p.ws && p.ws.readyState===1 && p.name)
    .map(p=>({
      id:p.id,name:p.name,settings:p.settings||cleanSettings(),inRoom:!!p.room,
      status:p.room && rooms.get(p.room)?.started ? "playing" : (p.room ? "room" : "online")
    }));
}
function broadcastPresence(){
  const payload={type:"presence_list",players:publicPresence()};
  for(const p of sockets.values())send(p.ws,payload);
}
function publicPlayers(room) {
  return [...room.players.values()].map(p=>({
    id:p.id,name:p.name,role:p.role,ready:p.ready,settings:p.settings
  }));
}
function broadcastRoom(room) {
  const payload={type:"room_update",room:room.code,players:publicPlayers(room)};
  for(const p of room.players.values())send(p.ws,payload);
  broadcastPresence();
}
function removeFromRoom(p,reason="left"){
  if(!p?.room)return;
  const room=rooms.get(p.room); if(!room){p.room=null;return;}
  room.players.delete(p.id);p.room=null;p.ready=false;
  if(room.hostId===p.id){
    const next=room.players.values().next().value;
    if(next){next.role="host";room.hostId=next.id;}
  }
  for(const other of room.players.values())send(other.ws,{type:"peer_left",reason});
  if(room.players.size===0)rooms.delete(room.code); else broadcastRoom(room);
  broadcastPresence();
}
function ensurePresence(ws,id,name,settings){
  let p=sockets.get(id);
  if(!p){
    p={id,ws,name:cleanName(name),settings:cleanSettings(settings),ready:false,room:null,role:null};
    sockets.set(id,p);
  } else {
    p.ws=ws;
    if(name!==undefined)p.name=cleanName(name);
    if(settings)p.settings=cleanSettings(settings);
  }
  return p;
}
function createRoomFor(p){
  if(p.room){
    const old=rooms.get(p.room);
    if(old)return old;
  }
  const code=roomCode();
  const room={code,hostId:p.id,players:new Map(),started:false};
  rooms.set(code,room);
  p.room=code;p.role="host";p.ready=false;
  room.players.set(p.id,p);
  return room;
}
function startBattle(room){
  if(room.players.size!==2 || ![...room.players.values()].every(p=>p.ready))return;
  room.started=true;
  const payload={type:"battle_start",room:room.code,players:publicPlayers(room)};
  for(const p of room.players.values())send(p.ws,payload);
  broadcastPresence();
}

const server=http.createServer((req,res)=>{
  if(req.url==="/"||req.url==="/health"){
    res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8","Access-Control-Allow-Origin":"*"});
    res.end("Tank Game Multiplayer Server is running");
    return;
  }
  res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("Not found");
});
const wss=new WebSocketServer({server,path:"/ws"});

wss.on("connection",ws=>{
  const id=crypto.randomUUID();
  const temp={id,ws,name:null,settings:cleanSettings(),ready:false,room:null,role:null};
  sockets.set(id,temp);
  send(ws,{type:"hello",id});
  broadcastPresence();

  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}
    let p=sockets.get(id);
    if(m.type==="presence"){
      p=ensurePresence(ws,id,m.name,m.settings);
      send(ws,{type:"presence_list",players:publicPresence()});
      broadcastPresence();
      return;
    }
    if(m.type==="create_room"){
      p=ensurePresence(ws,id,m.name,m.settings);
      if(p.room)removeFromRoom(p);
      const room=createRoomFor(p);
      send(ws,{type:"room_created",room:room.code,role:"host",players:publicPlayers(room)});
      broadcastPresence();
      return;
    }
    if(m.type==="join_room"||m.type==="accept_invite"){
      p=ensurePresence(ws,id,m.name,m.settings);
      const code=String(m.room||"").toUpperCase(),room=rooms.get(code);
      if(!room)return send(ws,{type:"room_error",message:"الغرفة غير موجودة."});
      if(room.started)return send(ws,{type:"room_error",message:"المعركة بدأت بالفعل."});
      if(room.players.size>=MAX_PLAYERS)return send(ws,{type:"room_error",message:"الغرفة ممتلئة."});
      if(p.room)removeFromRoom(p);
      p.room=code;p.role="guest";p.ready=false;room.players.set(p.id,p);
      send(ws,{type:"room_joined",room:code,role:"guest",players:publicPlayers(room)});
      broadcastRoom(room);return;
    }

    p=sockets.get(id);
    const room=p?.room?rooms.get(p.room):null;

    if(m.type==="settings"&&p){
      p.settings=cleanSettings(m.settings);
      if(room)broadcastRoom(room);else broadcastPresence();
      return;
    }
    if(m.type==="ready"&&p&&room){
      p.ready=!!m.ready;broadcastRoom(room);return;
    }
    if(m.type==="start_battle"&&p&&room){
      if(p.id!==room.hostId)return;
      startBattle(room);return;
    }
    if(m.type==="invite"&&p){
      const target=sockets.get(String(m.targetId||""));
      if(!target||!target.ws||target.ws.readyState!==1||target.id===p.id)
        return send(ws,{type:"invite_error",message:"اللاعب غير متصل."});
      if(target.room)return send(ws,{type:"invite_error",message:"اللاعب داخل غرفة أو معركة حاليًا."});
      const room2=createRoomFor(p);
      const inviteId=crypto.randomUUID();
      send(target.ws,{type:"invite",inviteId,room:room2.code,fromId:p.id,fromName:p.name,settings:p.settings});
      send(ws,{type:"invite_sent",name:target.name,room:room2.code});
      broadcastPresence();
      return;
    }
    if(m.type==="reject_invite"){
      // Invitations are non-blocking; nothing else is required.
      return;
    }
    if(m.type==="state"&&p&&room&&room.started){
      for(const other of room.players.values()){
        if(other.id!==p.id)send(other.ws,{type:"state",from:p.id,state:m.state||{}});
      }
      return;
    }
    if(m.type==="leave_room"&&p){removeFromRoom(p);return;}
  });

  ws.on("close",()=>{
    const p=sockets.get(id);
    if(p)removeFromRoom(p,"disconnect");
    sockets.delete(id);
    broadcastPresence();
  });
});

server.listen(PORT,()=>console.log(`Tank Game Multiplayer Server listening on ${PORT}`));
