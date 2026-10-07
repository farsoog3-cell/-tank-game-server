
// TANK COMMAND FPS — multiplayer client adapter
const MULTIPLAYER_WS = "wss://YOUR-SERVICE.onrender.com/ws";
let netSocket, netId, netRoom, netPlayers = new Map();
let localHP = 100, localAlive = true, lastStateSend = 0;

function connectMultiplayer(name="Player", color="#168cff") {
  netSocket = new WebSocket(MULTIPLAYER_WS);
  netSocket.onopen = () => console.log("MULTIPLAYER CONNECTED");
  netSocket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === "welcome") netId = m.id;
    if (m.type === "room_created" || m.type === "room_joined") netRoom = m.room;
    if (m.type === "room_state" || m.type === "snapshot" || m.type === "game_started") {
      (m.players || []).forEach(p => netPlayers.set(p.id, p));
      for (const id of netPlayers.keys())
        if (!(m.players || []).some(p => p.id === id)) netPlayers.delete(id);
      const me = netPlayers.get(netId);
      if (me) { localHP = me.hp; localAlive = me.alive; }
    }
    if (m.type === "player_died" && m.victimId === netId) showDefeatScreen();
    if (m.type === "player_respawned" && m.player?.id === netId) {
      localHP = 100; localAlive = true; hideDefeatScreen();
    }
  };
}

function createOnlineRoom(name, color) {
  netSocket.send(JSON.stringify({type:"create_room", name, color}));
}
function joinOnlineRoom(room, name, color) {
  netSocket.send(JSON.stringify({type:"join_room", room, name, color}));
}
function startOnlineBattle() {
  netSocket.send(JSON.stringify({type:"start_game"}));
}
function sendPlayerState(x,y,z,yaw,pitch) {
  const now = performance.now();
  if (!netSocket || netSocket.readyState !== WebSocket.OPEN || now-lastStateSend < 50 || !localAlive) return;
  lastStateSend = now;
  netSocket.send(JSON.stringify({type:"state",x,y,z,yaw,pitch}));
}
function fireAtPlayer(targetId, yaw) {
  if (!localAlive || !netSocket || netSocket.readyState !== WebSocket.OPEN) return;
  netSocket.send(JSON.stringify({type:"shoot", targetId, yaw}));
}
function respawnOnline() {
  netSocket.send(JSON.stringify({type:"respawn"}));
}
