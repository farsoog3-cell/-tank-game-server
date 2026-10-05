// مثال الاتصال من index.html
const SERVER_HTTP = "https://tank-game-server-o650.onrender.com";
const SERVER_WS = "wss://tank-game-server-o650.onrender.com/ws";

let gameSocket = null;

function connectGameServer() {
  gameSocket = new WebSocket(SERVER_WS);

  gameSocket.onopen = () => {
    console.log("Connected to Tank Game Server");

    gameSocket.send(JSON.stringify({
      type: "profile",
      name: window.playerName || "Player",
      color: window.playerColor || "#2f7d32"
    }));
  };

  gameSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "connected":
        console.log("Server player id:", msg.playerId);
        break;

      case "rooms":
        console.log("Rooms:", msg.rooms);
        break;

      case "state_snapshot":
        // استقبل الحالة الكاملة عند الدخول
        window.applyOnlineState?.(msg.state, msg.room);
        break;

      case "state_patch":
        // استقبل تحديثات اللاعبين والوحدات والمباني
        window.applyOnlinePatch?.(msg.patch, msg);
        break;

      case "game_event":
        // استقبل إطلاق النار/الضرر/البناء/الاستخراج...
        window.applyOnlineGameEvent?.(msg.event, msg);
        break;

      case "error":
        console.error("Game server:", msg.code, msg.message || "");
        break;
    }
  };

  gameSocket.onclose = () => {
    console.warn("Disconnected. Reconnect here.");
  };

  gameSocket.onerror = (err) => {
    console.error("WebSocket error", err);
  };
}

function sendGameMessage(message) {
  if (gameSocket?.readyState === WebSocket.OPEN) {
    gameSocket.send(JSON.stringify(message));
  }
}
