/* tank-multiplayer-client.js
   أضف Socket.IO client قبل هذا الملف:
   <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
   ثم أضف هذا الملف.
*/
(function () {
  const SERVER_URL =
    window.TANK_SERVER_URL ||
    "https://tank-game-server-o650.onrender.com";

  const mp = {
    socket: null,
    room: null,
    playerId: null,
    reconnectToken: null,
    connected: false,
    started: false
  };

  window.TankMP = mp;

  function ensureSocket() {
    if (mp.socket) return mp.socket;

    mp.socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    mp.socket.on("connect", () => {
      mp.connected = true;
      console.log("[TankMP] connected", mp.socket.id);
    });

    mp.socket.on("disconnect", () => {
      mp.connected = false;
      console.log("[TankMP] disconnected");
    });

    mp.socket.on("server:error", e => {
      console.error("[TankMP]", e);
      if (typeof window.toast === "function") window.toast(e.message || "Server error");
    });

    mp.socket.on("room:joined", data => {
      mp.room = data.room;
      mp.playerId = data.playerId;
      mp.reconnectToken = data.reconnectToken;
      console.log("[TankMP] room joined", data.room);
      if (window.onTankRoomUpdate) window.onTankRoomUpdate(data.room);
    });

    mp.socket.on("room:update", room => {
      mp.room = room;
      if (window.onTankRoomUpdate) window.onTankRoomUpdate(room);
    });

    mp.socket.on("match:started", data => {
      mp.started = true;
      mp.room = data.room;
      if (window.onTankMatchStarted) window.onTankMatchStarted(data);
    });

    mp.socket.on("match:command", event => {
      if (event.playerId === mp.playerId) return;
      if (window.onTankRemoteCommand) window.onTankRemoteCommand(event);
    });

    mp.socket.on("match:tick", tick => {
      if (window.onTankServerTick) window.onTankServerTick(tick);
    });

    mp.socket.on("match:ended", data => {
      mp.started = false;
      if (window.onTankMatchEnded) window.onTankMatchEnded(data);
    });

    mp.socket.on("player:disconnected", data => {
      if (window.onTankPlayerDisconnected) window.onTankPlayerDisconnected(data);
    });

    return mp.socket;
  }

  mp.connect = function () {
    ensureSocket();
  };

  mp.createRoom = function ({ name, color, money = 3000, map = "default" } = {}) {
    const s = ensureSocket();
    s.emit("room:create", { name, color, money, map });
  };

  mp.joinRoom = function ({ roomId, name, color } = {}) {
    const s = ensureSocket();
    s.emit("room:join", { roomId, name, color });
  };

  mp.quickMatch = function ({ name, color, money = 3000, map = "default" } = {}) {
    const s = ensureSocket();
    s.emit("room:quick-match", { name, color, money, map });
  };

  mp.setReady = function (ready) {
    if (mp.socket) mp.socket.emit("room:ready", !!ready);
  };

  mp.updateSettings = function (settings) {
    if (mp.socket) mp.socket.emit("room:update-settings", settings || {});
  };

  mp.sendCommand = function (type, payload) {
    if (!mp.socket || !mp.started) return;
    mp.socket.emit("match:command", { type, payload: payload || {} });
  };

  mp.sendState = function (snapshot) {
    if (!mp.socket || !mp.started) return;
    mp.socket.emit("match:state", snapshot);
  };

  mp.endMatch = function (winner) {
    if (!mp.socket) return;
    mp.socket.emit("match:end", { winner });
  };

  mp.leave = function () {
    if (mp.socket) mp.socket.emit("room:leave");
  };

  ensureSocket();
})();
