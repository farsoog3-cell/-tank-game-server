const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "1mb" }));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });
const PORT = Number(process.env.PORT || 10000);
const rooms = new Map();
const sockets = new Map();

const DATABASE_ENABLED = Boolean(process.env.DATABASE_URL);
const pool = DATABASE_ENABLED ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
}) : null;

async function db(query, params = []) {
  if (!pool) throw new Error("DATABASE_URL_MISSING");
  return pool.query(query, params);
}

async function initDatabase() {
  await db(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Player',
      color TEXT NOT NULL DEFAULT '#2f7d32',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT,
      max_players INTEGER NOT NULL DEFAULT 4,
      host_id TEXT,
      started BOOLEAN NOT NULL DEFAULT FALSE,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS room_players (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      ready BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (room_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
  `);
  console.log("Database ready");
}

function id(prefix = "") { return prefix + crypto.randomBytes(8).toString("hex"); }
function cleanName(value, fallback = "Player") { const s = String(value ?? "").trim().slice(0, 24); return s || fallback; }
function send(ws, type, data = {}) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data })); }
function broadcastRoom(room, type, data = {}, except = null) { for (const p of room.players.values()) if (p.ws !== except) send(p.ws, type, data); }
function publicPlayer(p) { return { id:p.id, name:p.name, color:p.color, ready:!!p.ready, connected:!!p.ws && p.ws.readyState === WebSocket.OPEN }; }
function publicRoom(room) { return { id:room.id, name:room.name, hostId:room.hostId, maxPlayers:room.maxPlayers, players:[...room.players.values()].map(publicPlayer), createdAt:room.createdAt }; }
function hashPassword(password) { return password ? crypto.createHash("sha256").update(String(password)).digest("hex") : null; }

async function persistPlayer(p) {
  await db(`INSERT INTO players(id,name,color) VALUES($1,$2,$3)
            ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,color=EXCLUDED.color,updated_at=NOW()`, [p.id,p.name,p.color]);
}
async function persistRoom(room) {
  await db(`INSERT INTO rooms(id,name,password_hash,max_players,host_id,started,state,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,TO_TIMESTAMP($8/1000.0),NOW())
            ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,max_players=EXCLUDED.max_players,host_id=EXCLUDED.host_id,started=EXCLUDED.started,state=EXCLUDED.state,updated_at=NOW()`,
    [room.id,room.name,room.passwordHash,room.maxPlayers,room.hostId,room.state.started,JSON.stringify(room.state),room.createdAt]);
}
async function persistMembership(room,p) {
  await db(`INSERT INTO room_players(room_id,player_id,ready) VALUES($1,$2,$3)
            ON CONFLICT(room_id,player_id) DO UPDATE SET ready=EXCLUDED.ready`, [room.id,p.id,!!p.ready]);
}
async function deleteMembership(roomId,playerId) { await db(`DELETE FROM room_players WHERE room_id=$1 AND player_id=$2`,[roomId,playerId]); }

async function hydrateRoom(roomId) {
  const r = await db(`SELECT * FROM rooms WHERE id=$1`, [roomId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  const room = { id:row.id,name:row.name,passwordHash:row.password_hash,maxPlayers:row.max_players,hostId:row.host_id,createdAt:new Date(row.created_at).getTime(),players:new Map(),state:row.state || {} };
  const ps = await db(`SELECT p.*,rp.ready FROM room_players rp JOIN players p ON p.id=rp.player_id WHERE rp.room_id=$1`,[roomId]);
  for (const p of ps.rows) {
    const live = sockets.get(p.id);
    room.players.set(p.id,{id:p.id,name:p.name,color:p.color,ready:p.ready,ws:live?.ws || null,roomId:room.id});
  }
  rooms.set(room.id,room); return room;
}

async function leaveRoom(player) {
  const room = player.roomId ? rooms.get(player.roomId) : null;
  if (!room) return;
  const oldRoomId = room.id;
  room.players.delete(player.id); player.roomId = null;
  await deleteMembership(oldRoomId, player.id).catch(console.error);
  if (room.hostId === player.id) {
    const next = room.players.values().next().value;
    room.hostId = next ? next.id : null;
    if (next) send(next.ws,"room_host",{room:publicRoom(room)});
  }
  if (room.players.size === 0) {
    rooms.delete(oldRoomId);
    await db(`DELETE FROM rooms WHERE id=$1`,[oldRoomId]).catch(console.error);
  } else {
    await persistRoom(room).catch(console.error);
    broadcastRoom(room,"player_left",{playerId:player.id,room:publicRoom(room)});
    broadcastRoom(room,"room_update",{room:publicRoom(room)});
  }
}

async function joinRoom(room, player, password) {
  if (room.players.size >= room.maxPlayers) return {ok:false,error:"ROOM_FULL"};
  if (room.passwordHash && hashPassword(password) !== room.passwordHash) return {ok:false,error:"BAD_PASSWORD"};
  if (player.roomId) await leaveRoom(player);
  room.players.set(player.id,player); player.roomId=room.id;
  room.state.players = room.state.players || {};
  room.state.players[player.id] = {id:player.id,name:player.name,color:player.color,x:0,y:0,hp:100};
  await persistPlayer(player); await persistMembership(room,player); await persistRoom(room);
  return {ok:true};
}

function roomSnapshot(room) { return {room:publicRoom(room),state:room.state}; }

app.get("/",(req,res)=>res.json({ok:true,service:"Tank Game Online Server",database:"postgresql",websocket:"/ws",rooms:rooms.size,time:Date.now()}));
app.get("/health",async(req,res)=>{
  if (!DATABASE_ENABLED) return res.json({ok:true,database:false,mode:"temporary",rooms:rooms.size,players:[...sockets.values()].filter(p=>p.ws?.readyState===WebSocket.OPEN).length,uptime:process.uptime(),time:Date.now()});
  try { await db("SELECT 1"); res.json({ok:true,database:true,mode:"persistent",rooms:rooms.size,players:[...sockets.values()].filter(p=>p.ws?.readyState===WebSocket.OPEN).length,uptime:process.uptime(),time:Date.now()}); }
  catch(e){res.status(503).json({ok:false,database:false,mode:"database_error",error:e.message});}
});
app.get("/api/rooms",async(req,res)=>{
  if (!DATABASE_ENABLED) return res.json([...rooms.values()].map(r=>({id:r.id,name:r.name,maxPlayers:r.maxPlayers,hostId:r.hostId,started:!!r.state.started,createdAt:r.createdAt,players:[...r.players.values()].map(publicPlayer)})));
  try { const q=await db(`SELECT id,name,max_players,host_id,started,created_at FROM rooms ORDER BY created_at DESC LIMIT 100`); res.json(q.rows.map(r=>({id:r.id,name:r.name,maxPlayers:r.max_players,hostId:r.host_id,started:r.started,createdAt:new Date(r.created_at).getTime(),players:[]}))); } catch(e){res.status(500).json({error:"DATABASE_ERROR"});}
});

wss.on("connection",ws=>{
  const player={id:id("p_"),ws,name:"Player",color:"#2f7d32",roomId:null,ready:false};
  sockets.set(player.id,player);
  ws.isAlive=true;
  persistPlayer(player).catch(console.error);
  send(ws,"connected",{playerId:player.id,serverTime:Date.now()});
  ws.on("pong",()=>ws.isAlive=true);
  ws.on("message",async raw=>{
    let msg; try{msg=JSON.parse(raw.toString());}catch{return send(ws,"error",{code:"BAD_JSON"});}
    const type=String(msg.type||"");
    try{
      if(type==="profile"){
        player.name=cleanName(msg.name); player.color=String(msg.color||"#2f7d32").slice(0,20); await persistPlayer(player);
        if(player.roomId){const room=rooms.get(player.roomId); if(room){room.state.players[player.id]={...(room.state.players[player.id]||{}),id:player.id,name:player.name,color:player.color}; await persistRoom(room); broadcastRoom(room,"player_update",{player:publicPlayer(player),room:publicRoom(room)});}}
        return send(ws,"profile_ok",{player:publicPlayer(player)});
      }
      if(type==="list_rooms"){
        const q=await db(`SELECT r.*,COUNT(rp.player_id)::int AS player_count FROM rooms r LEFT JOIN room_players rp ON rp.room_id=r.id GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100`);
        return send(ws,"rooms",{rooms:q.rows.map(r=>({id:r.id,name:r.name,hostId:r.host_id,maxPlayers:r.max_players,players:[],playerCount:r.player_count,started:r.started,createdAt:new Date(r.created_at).getTime()}))});
      }
      if(type==="create_room"){
        const room={id:id("room_"),name:cleanName(msg.name,"Battle Room"),passwordHash:hashPassword(msg.password),maxPlayers:Math.max(2,Math.min(8,Number(msg.maxPlayers)||4)),hostId:player.id,createdAt:Date.now(),players:new Map(),state:{started:false,tick:0,gameTime:0,players:{},units:{},buildings:{},projectiles:{},effects:{}}};
        rooms.set(room.id,room); await persistRoom(room); const result=await joinRoom(room,player,msg.password); if(!result.ok){rooms.delete(room.id);return send(ws,"error",{code:result.error});}
        send(ws,"room_created",{room:publicRoom(room)}); return send(ws,"state_snapshot",roomSnapshot(room));
      }
      if(type==="join_room"){
        let room=rooms.get(String(msg.roomId||"")); if(!room) room=await hydrateRoom(String(msg.roomId||""));
        if(!room)return send(ws,"error",{code:"ROOM_NOT_FOUND"});
        const result=await joinRoom(room,player,String(msg.password||"")); if(!result.ok)return send(ws,"error",{code:result.error});
        broadcastRoom(room,"player_joined",{player:publicPlayer(player),room:publicRoom(room)}); send(ws,"joined_room",{room:publicRoom(room)}); return send(ws,"state_snapshot",roomSnapshot(room));
      }
      if(type==="leave_room"){await leaveRoom(player);return send(ws,"left_room",{});}
      if(type==="ready"){
        player.ready=!!msg.ready; const room=player.roomId?rooms.get(player.roomId):null; if(!room)return; await persistMembership(room,player); broadcastRoom(room,"player_update",{player:publicPlayer(player),room:publicRoom(room)}); return;
      }
      if(type==="start_game"){
        const room=player.roomId?rooms.get(player.roomId):null; if(!room)return send(ws,"error",{code:"NOT_IN_ROOM"}); if(room.hostId!==player.id)return send(ws,"error",{code:"NOT_HOST"});
        room.state.started=true;room.state.gameTime=0;room.state.tick=0;await persistRoom(room);return broadcastRoom(room,"game_started",{state:room.state,room:publicRoom(room)});
      }
      if(type==="state_patch"){
        const room=player.roomId?rooms.get(player.roomId):null;if(!room)return send(ws,"error",{code:"NOT_IN_ROOM"});
        const patch=msg.patch&&typeof msg.patch==="object"?msg.patch:{};for(const key of ["players","units","buildings","projectiles","effects"])if(patch[key]!==undefined)room.state[key]=patch[key];room.state.tick=(room.state.tick||0)+1;room.state.serverTime=Date.now();
        await persistRoom(room);return broadcastRoom(room,"state_patch",{from:player.id,tick:room.state.tick,serverTime:room.state.serverTime,patch},ws);
      }
      if(type==="game_event"){
        const room=player.roomId?rooms.get(player.roomId):null;if(!room)return send(ws,"error",{code:"NOT_IN_ROOM"});
        // Keep the latest event in persistent state so it survives a reconnect.
        room.state.lastEvent={from:player.id,event:msg.event||{},serverTime:Date.now()};await persistRoom(room);return broadcastRoom(room,"game_event",{from:player.id,event:msg.event||{},serverTime:room.state.lastEvent.serverTime});
      }
      if(type==="ping")return send(ws,"pong",{clientTime:msg.clientTime||null,serverTime:Date.now()});
      send(ws,"error",{code:"UNKNOWN_MESSAGE",message:`Unknown message type: ${type}`});
    }catch(err){console.error("message error",err);send(ws,"error",{code:"SERVER_ERROR",message:"Server error"});}
  });
  ws.on("close",()=>{leaveRoom(player).catch(console.error);sockets.delete(player.id);});
  ws.on("error",err=>console.error("WebSocket error:",err.message));
});

const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);wss.on("close",()=>clearInterval(heartbeat));

async function start() {
  if (DATABASE_ENABLED) {
    let ready = false;
    for (let attempt = 1; attempt <= 8 && !ready; attempt++) {
      try { await initDatabase(); ready = true; }
      catch (err) { console.error(`Database attempt ${attempt}/8 failed:`, err.message); if (attempt < 8) await new Promise(r => setTimeout(r, Math.min(1500 * attempt, 8000))); }
    }
    if (!ready) console.error("PostgreSQL is unavailable; server will stay online in temporary mode until DATABASE_URL becomes available on restart.");
  } else {
    console.warn("DATABASE_URL is missing. Server is running in temporary memory mode. Add DATABASE_URL on Render to enable persistence.");
  }
  server.listen(PORT,"0.0.0.0",()=>console.log(`Tank Game Server listening on ${PORT}`));
}
start().catch(err=>{ console.error("Fatal startup error:",err); server.listen(PORT,"0.0.0.0",()=>console.log(`Tank Game Server listening on ${PORT} (degraded mode)`)); });
