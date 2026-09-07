const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

app.get("/", (req, res) => {
  res.send("Tank Game Matchmaking Server is running.");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    waitingPlayers: waitingPlayers.length,
    rooms: rooms.size
  });
});

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

// اللاعبون الذين ينتظرون لاعبًا آخر
const waitingPlayers = [];

// الغرف
const rooms = new Map();

let nextPlayerId = 1;
let nextRoomId = 1;


// ===============================
// أدوات مساعدة
// ===============================

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function removeFromWaiting(ws) {
  const index = waitingPlayers.indexOf(ws);

  if (index !== -1) {
    waitingPlayers.splice(index, 1);
    return true;
  }

  return false;
}

function broadcastRoom(room, data) {
  if (!room) return;

  send(room.player1, data);
  send(room.player2, data);
}


// ===============================
// البحث عن لاعب
// ===============================

function searchForPlayer(ws) {

  // لا تسمح بإضافة نفس اللاعب مرتين
  removeFromWaiting(ws);

  // ابحث عن لاعب صالح ينتظر
  let opponent = null;

  while (waitingPlayers.length > 0) {
    const candidate = waitingPlayers.shift();

    if (
      candidate &&
      candidate !== ws &&
      candidate.readyState === WebSocket.OPEN
    ) {
      opponent = candidate;
      break;
    }
  }

  // لا يوجد لاعب آخر
  if (!opponent) {

    waitingPlayers.push(ws);

    send(ws, {
      type: "waiting",
      message: "جاري البحث عن لاعب..."
    });

    return;
  }

  // وجدنا لاعبًا
  const roomId = "room_" + nextRoomId++;

  const room = {
    id: roomId,
    player1: opponent,
    player2: ws,
    createdAt: Date.now()
  };

  rooms.set(roomId, room);

  opponent.roomId = roomId;
  ws.roomId = roomId;

  opponent.team = "red";
  ws.team = "blue";

  // إرسال نتيجة المطابقة للاعب الأول
  send(opponent, {
    type: "match_found",
    roomId: roomId,
    playerId: opponent.playerId,
    opponentId: ws.playerId,
    team: "red"
  });

  // إرسال نتيجة المطابقة للاعب الثاني
  send(ws, {
    type: "match_found",
    roomId: roomId,
    playerId: ws.playerId,
    opponentId: opponent.playerId,
    team: "blue"
  });

  console.log(
    `MATCH FOUND: ${opponent.playerId} vs ${ws.playerId} -> ${roomId}`
  );
}


// ===============================
// WebSocket
// ===============================

wss.on("connection", (ws) => {

  ws.playerId = "player_" + nextPlayerId++;
  ws.roomId = null;
  ws.team = null;
  ws.isAlive = true;

  console.log("Player connected:", ws.playerId);

  send(ws, {
    type: "connected",
    playerId: ws.playerId
  });


  // =============================
  // استقبال الرسائل
  // =============================

  ws.on("message", (raw) => {

    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch (error) {
      console.log("Invalid JSON from", ws.playerId);
      return;
    }

    if (!data || !data.type) {
      return;
    }


    // -----------------------------
    // البحث عن لاعب
    // يدعم نسخة اللعبة الحالية
    // -----------------------------

    if (
      data.type === "find_match" ||
      data.type === "search_player"
    ) {

      searchForPlayer(ws);
      return;
    }


    // -----------------------------
    // إلغاء البحث
    // -----------------------------

    if (
      data.type === "cancel_match" ||
      data.type === "cancel_search"
    ) {

      const removed = removeFromWaiting(ws);

      if (removed) {
        send(ws, {
          type: "search_cancelled",
          message: "تم إلغاء البحث"
        });
      }

      return;
    }


    // -----------------------------
    // اختيار الدولة
    // -----------------------------

    if (data.type === "choose_country") {

      const room = rooms.get(ws.roomId);

      if (!room) return;

      ws.country = data.country || null;

      send(ws, {
        type: "country_selected",
        country: ws.country
      });

      if (room.player1.country && room.player2.country) {

        broadcastRoom(room, {
          type: "game_start",
          roomId: room.id,

          player1: {
            id: room.player1.playerId,
            country: room.player1.country,
            team: room.player1.team
          },

          player2: {
            id: room.player2.playerId,
            country: room.player2.country,
            team: room.player2.team
          }
        });

        console.log("GAME START:", room.id);
      }

      return;
    }


    // -----------------------------
    // تحديثات اللعبة
    // -----------------------------

    if (data.type === "game_update") {

      const room = rooms.get(ws.roomId);

      if (!room) return;

      const opponent =
        room.player1 === ws
          ? room.player2
          : room.player1;

      if (opponent.readyState === WebSocket.OPEN) {

        send(opponent, {
          type: "game_update",
          from: ws.playerId,
          data: data.data
        });
      }

      return;
    }


    // -----------------------------
    // Ping من العميل
    // -----------------------------

    if (data.type === "ping") {

      send(ws, {
        type: "pong"
      });

      return;
    }
  });


  // =============================
  // إغلاق الاتصال
  // =============================

  ws.on("close", () => {

    console.log("Player disconnected:", ws.playerId);

    // إذا كان ينتظر لاعبًا
    removeFromWaiting(ws);

    // إذا كان داخل غرفة
    if (ws.roomId) {

      const room = rooms.get(ws.roomId);

      if (room) {

        const opponent =
          room.player1 === ws
            ? room.player2
            : room.player1;

        send(opponent, {
          type: "opponent_left",
          message: "غادر اللاعب الآخر المباراة"
        });

        rooms.delete(ws.roomId);
      }
    }
  });


  ws.on("error", (error) => {
    console.log(
      "WebSocket error:",
      ws.playerId,
      error.message
    );
  });
});


// ===============================
// Heartbeat
// يمنع Render من اعتبار الاتصال
// ميتًا
// ===============================

const heartbeatInterval = setInterval(() => {

  wss.clients.forEach((ws) => {

    if (ws.isAlive === false) {

      console.log("Terminating dead connection:", ws.playerId);

      removeFromWaiting(ws);
      ws.terminate();

      return;
    }

    ws.isAlive = false;

    try {
      ws.ping();
    } catch (error) {}
  });

}, 30000);


wss.on("close", () => {
  clearInterval(heartbeatInterval);
});


// استقبال Pong
wss.on("connection", (ws) => {

  ws.on("pong", () => {
    ws.isAlive = true;
  });

});


// ===============================
// تشغيل السيرفر
// ===============================

server.listen(PORT, HOST, () => {

  console.log("--------------------------------");
  console.log("Tank Game Server Started");
  console.log("--------------------------------");
  console.log("Port:", PORT);
  console.log("WebSocket:");
  console.log(`/ws`);
  console.log("--------------------------------");
});
