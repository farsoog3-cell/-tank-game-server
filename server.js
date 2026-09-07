const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

app.get("/", (req, res) => {
  res.send("Tank Game Multiplayer Server is running");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    players: wss.clients.size
  });
});

const waitingPlayers = [];
const rooms = new Map();

const FLAGS = [
  "usa",
  "russia",
  "china",
  "germany",
  "france",
  "uk",
  "italy",
  "japan",
  "turkey"
];

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function randomFlags() {
  const shuffled = [...FLAGS].sort(() => Math.random() - 0.5);

  return {
    player1: shuffled[0],
    player2: shuffled[1]
  };
}

function removeFromWaiting(ws) {
  const index = waitingPlayers.indexOf(ws);

  if (index !== -1) {
    waitingPlayers.splice(index, 1);
  }
}

function leaveRoom(ws) {
  if (!ws.roomId) return;

  const room = rooms.get(ws.roomId);

  if (!room) {
    ws.roomId = null;
    return;
  }

  room.players.delete(ws);

  for (const player of room.players) {
    send(player, {
      type: "opponent_left"
    });
  }

  if (room.players.size === 0) {
    rooms.delete(ws.roomId);
  }

  ws.roomId = null;
}

function createMatch(player1, player2) {
  const roomId =
    "room_" +
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 8);

  const flags = randomFlags();

  const player1Id =
    "p_" + Math.random().toString(36).substring(2, 10);

  const player2Id =
    "p_" + Math.random().toString(36).substring(2, 10);

  const room = {
    id: roomId,
    players: new Set([player1, player2]),
    createdAt: Date.now()
  };

  rooms.set(roomId, room);

  player1.roomId = roomId;
  player2.roomId = roomId;

  player1.playerId = player1Id;
  player2.playerId = player2Id;

  send(player1, {
    type: "match_found",
    roomId,
    playerId: player1Id,
    opponentId: player2Id,

    team: "player",
    opponentTeam: "enemy",

    // العلم يتم اختياره تلقائياً
    flagId: flags.player1,
    opponentFlagId: flags.player2,

    players: {
      you: {
        id: player1Id,
        team: "player",
        flagId: flags.player1
      },

      opponent: {
        id: player2Id,
        team: "enemy",
        flagId: flags.player2
      }
    }
  });

  send(player2, {
    type: "match_found",
    roomId,
    playerId: player2Id,
    opponentId: player1Id,

    team: "player",
    opponentTeam: "enemy",

    // العلم يتم اختياره تلقائياً
    flagId: flags.player2,
    opponentFlagId: flags.player1,

    players: {
      you: {
        id: player2Id,
        team: "player",
        flagId: flags.player2
      },

      opponent: {
        id: player1Id,
        team: "enemy",
        flagId: flags.player1
      }
    }
  });
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.roomId = null;
  ws.playerId = null;

  console.log("Player connected");

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch (error) {
      console.log("Invalid JSON");
      return;
    }

    // البحث عن لاعب
    if (
      data.type === "find_match" ||
      data.type === "search_player"
    ) {
      removeFromWaiting(ws);

      // إذا كان لديه غرفة، لا يبحث مرة ثانية
      if (ws.roomId) {
        return;
      }

      if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.shift();

        if (
          opponent &&
          opponent.readyState === WebSocket.OPEN
        ) {
          createMatch(opponent, ws);
        } else {
          waitingPlayers.push(ws);
        }

      } else {
        waitingPlayers.push(ws);

        send(ws, {
          type: "searching",
          message: "جاري البحث عن لاعب..."
        });
      }

      return;
    }

    // إلغاء البحث
    if (
      data.type === "cancel_match" ||
      data.type === "cancel_search"
    ) {
      removeFromWaiting(ws);

      send(ws, {
        type: "search_cancelled"
      });

      return;
    }

    // اختيار العلم يدويًا لم يعد مطلوبًا
    // العلم يتم اختياره تلقائيًا عند إنشاء المباراة.

    // تحديث اللعبة
    if (data.type === "game_update") {
      if (!ws.roomId) return;

      const room = rooms.get(ws.roomId);

      if (!room) return;

      for (const player of room.players) {
        if (player !== ws) {
          send(player, {
            type: "game_update",
            playerId: ws.playerId,
            state: data.state,
            event: data.event || null
          });
        }
      }

      return;
    }

    // مزامنة حالة كاملة
    if (data.type === "game_state") {
      if (!ws.roomId) return;

      const room = rooms.get(ws.roomId);

      if (!room) return;

      for (const player of room.players) {
        if (player !== ws) {
          send(player, {
            type: "game_state",
            playerId: ws.playerId,
            state: data.state
          });
        }
      }

      return;
    }

    // أحداث القتال:
    // إطلاق النار، الضرر، التدمير، السيطرة على النفط، إلخ.
    if (data.type === "game_event") {
      if (!ws.roomId) return;

      const room = rooms.get(ws.roomId);

      if (!room) return;

      for (const player of room.players) {
        if (player !== ws) {
          send(player, {
            type: "game_event",
            playerId: ws.playerId,
            event: data.event
          });
        }
      }

      return;
    }

    // اللاعب جاهز
    if (data.type === "player_ready") {
      if (!ws.roomId) return;

      const room = rooms.get(ws.roomId);

      if (!room) return;

      ws.ready = true;

      for (const player of room.players) {
        if (player !== ws) {
          send(player, {
            type: "opponent_ready"
          });
        }
      }

      return;
    }

    // نهاية المباراة
    if (data.type === "game_over") {
      if (!ws.roomId) return;

      const room = rooms.get(ws.roomId);

      if (!room) return;

      for (const player of room.players) {
        if (player !== ws) {
          send(player, {
            type: "game_over",
            winner: data.winner
          });
        }
      }

      return;
    }
  });

  ws.on("close", () => {
    console.log("Player disconnected");

    removeFromWaiting(ws);
    leaveRoom(ws);
  });

  ws.on("error", (error) => {
    console.log("WebSocket error:", error.message);
  });
});

// فحص الاتصالات كل 30 ثانية
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeat);
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tank multiplayer server running on port ${PORT}`);
});
