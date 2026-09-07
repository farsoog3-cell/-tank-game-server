const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.get("/", (req, res) => {
    res.send("Tank Game Server Online");
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        waitingPlayers: waitingPlayers.length,
        rooms: rooms.size
    });
});

const PORT = process.env.PORT || 10000;

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server,
    path: "/ws"
});

// اللاعبون الذين يبحثون عن مباراة
const waitingPlayers = [];

// الغرف الموجودة
const rooms = new Map();

let nextRoomId = 1;
let nextPlayerId = 1;


// --------------------------------------------------
// أدوات مساعدة
// --------------------------------------------------

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function removeFromWaiting(ws) {
    const index = waitingPlayers.indexOf(ws);

    if (index !== -1) {
        waitingPlayers.splice(index, 1);
    }
}

function createRoom(player1, player2) {

    const roomId = "room_" + nextRoomId++;

    const room = {
        id: roomId,
        players: [
            player1,
            player2
        ],
        createdAt: Date.now()
    };

    rooms.set(roomId, room);

    player1.roomId = roomId;
    player2.roomId = roomId;

    player1.team = "player";
    player2.team = "enemy";

    send(player1.ws, {
        type: "match_found",
        roomId,
        playerId: player1.id,
        opponentId: player2.id,
        team: "player",
        message: "تم العثور على لاعب"
    });

    send(player2.ws, {
        type: "match_found",
        roomId,
        playerId: player2.id,
        opponentId: player1.id,
        team: "enemy",
        message: "تم العثور على لاعب"
    });

    console.log(
        `MATCH FOUND: ${player1.id} VS ${player2.id}`
    );
}


// --------------------------------------------------
// البحث عن لاعب
// --------------------------------------------------

function startSearching(player) {

    // لا تسمح للاعب بالبحث مرتين
    removeFromWaiting(player.ws);

    // إذا يوجد لاعب آخر ينتظر
    if (waitingPlayers.length > 0) {

        const opponentWs = waitingPlayers.shift();

        if (
            opponentWs &&
            opponentWs.readyState === WebSocket.OPEN &&
            opponentWs.playerData
        ) {

            const opponent = opponentWs.playerData;

            createRoom(
                player,
                opponent
            );

            return;
        }
    }

    // لا يوجد لاعب حاليًا
    waitingPlayers.push(player.ws);

    send(player.ws, {
        type: "searching",
        message: "جاري البحث عن لاعب..."
    });

    console.log(
        `Player ${player.id} is searching`
    );
}


// --------------------------------------------------
// إلغاء البحث
// --------------------------------------------------

function cancelSearching(player) {

    removeFromWaiting(player.ws);

    send(player.ws, {
        type: "search_cancelled",
        message: "تم إلغاء البحث"
    });
}


// --------------------------------------------------
// رسائل WebSocket
// --------------------------------------------------

wss.on("connection", (ws) => {

    const player = {
        id: "player_" + nextPlayerId++,
        ws,
        roomId: null,
        team: null
    };

    ws.playerData = player;

    console.log(
        `Player connected: ${player.id}`
    );

    send(ws, {
        type: "connected",
        playerId: player.id
    });


    ws.on("message", (raw) => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch (error) {
            send(ws, {
                type: "error",
                message: "رسالة غير صحيحة"
            });

            return;
        }

        const player = ws.playerData;

        // ------------------------------------------
        // بدء البحث
        // ------------------------------------------

        if (data.type === "search_player") {

            startSearching(player);

            return;
        }


        // ------------------------------------------
        // إلغاء البحث
        // ------------------------------------------

        if (data.type === "cancel_search") {

            cancelSearching(player);

            return;
        }


        // ------------------------------------------
        // اختيار الدولة
        // ------------------------------------------

        if (data.type === "choose_country") {

            if (!player.roomId) {
                return;
            }

            const room = rooms.get(player.roomId);

            if (!room) {
                return;
            }

            const country = data.country;

            if (!country) {
                return;
            }

            player.country = country;

            send(player.ws, {
                type: "country_selected",
                country
            });

            const opponent = room.players.find(
                p => p.id !== player.id
            );

            if (opponent) {

                send(opponent.ws, {
                    type: "opponent_country_selected",
                    country
                });

            }

            // إذا اختار اللاعبان الدولة تبدأ المباراة
            if (
                room.players.length === 2 &&
                room.players.every(p => p.country)
            ) {

                send(room.players[0].ws, {
                    type: "game_start",
                    roomId: room.id,
                    players: room.players.map(p => ({
                        id: p.id,
                        country: p.country,
                        team: p.team
                    }))
                });

                send(room.players[1].ws, {
                    type: "game_start",
                    roomId: room.id,
                    players: room.players.map(p => ({
                        id: p.id,
                        country: p.country,
                        team: p.team
                    }))
                });

                console.log(
                    `GAME STARTED: ${room.id}`
                );
            }

            return;
        }


        // ------------------------------------------
        // بيانات اللعبة
        // ------------------------------------------

        if (data.type === "game_update") {

            if (!player.roomId) {
                return;
            }

            const room = rooms.get(player.roomId);

            if (!room) {
                return;
            }

            const opponent = room.players.find(
                p => p.id !== player.id
            );

            if (opponent) {

                send(opponent.ws, {
                    type: "game_update",
                    from: player.id,
                    data: data.data
                });

            }

            return;
        }


        // ------------------------------------------
        // رسالة Ping
        // ------------------------------------------

        if (data.type === "ping") {

            send(ws, {
                type: "pong"
            });

            return;
        }
    });


    // --------------------------------------------------
    // انقطاع اللاعب
    // --------------------------------------------------

    ws.on("close", () => {

        const player = ws.playerData;

        removeFromWaiting(ws);

        if (player && player.roomId) {

            const room = rooms.get(player.roomId);

            if (room) {

                const opponent = room.players.find(
                    p => p.id !== player.id
                );

                if (opponent) {

                    send(opponent.ws, {
                        type: "opponent_left",
                        message: "غادر اللاعب الآخر المباراة"
                    });

                }

                rooms.delete(player.roomId);
            }
        }

        console.log(
            `Player disconnected: ${player.id}`
        );
    });


    ws.on("error", (error) => {

        console.error(
            `WebSocket error for ${player.id}:`,
            error.message
        );

    });

});


// --------------------------------------------------
// تنظيف الاتصالات القديمة
// --------------------------------------------------

setInterval(() => {

    wss.clients.forEach(ws => {

        if (ws.readyState === WebSocket.OPEN) {

            send(ws, {
                type: "server_ping"
            });

        }

    });

}, 25000);


// --------------------------------------------------
// تشغيل السيرفر
// --------------------------------------------------

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Tank Game Server running on port ${PORT}`
    );

});
