const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let waitingPlayers = []; // قائمة انتظار اللاعبين
let players = {};        // اللاعبون في المعركة الحالية

io.on('connection', (socket) => {
    console.log(`لاعب متصل: ${socket.id}`);

    // استقبال طلب البحث عن معركة
    socket.on('find_match', (data) => {
        players[socket.id] = {
            id: socket.id,
            team: data.team,
            x: data.team === 'green' ? -335 : 335,
            z: data.team === 'green' ? -335 : 335,
            rotation: 0
        };

        // إضافة اللاعب لقائمة الانتظار إذا لم يكن موجوداً
        if (!waitingPlayers.includes(socket.id)) {
            waitingPlayers.push(socket.id);
        }

        console.log(`عدد اللاعبين في الانتظار: ${waitingPlayers.length}`);

        // إذا تجمع لاعبين أو أكثر، ابدأ المعركة بينهما!
        if (waitingPlayers.length >= 2) {
            let player1Id = waitingPlayers.shift();
            let player2Id = waitingPlayers.shift();

            // إرسال إشارة بدء المعركة للاعبين الاثنين
            io.to(player1Id).emit('match_started', { opponent: player2Id });
            io.to(player2Id).emit('match_started', { opponent: player1Id });

            // إرسال بيانات اللاعبين لكليهما
            io.to(player1Id).emit('current_players', { [player2Id]: players[player2Id] });
            io.to(player2Id).emit('current_players', { [player1Id]: players[player1Id] });

            console.log(`تم بدء المعركة بين: ${player1Id} و ${player2Id}`);
        }
    });

    // استقبال حركة اللاعب وإرسالها للآخر
    socket.on('player_move', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;
            
            socket.broadcast.emit('player_moved', players[socket.id]);
        }
    });

    // عند خروج اللاعب
    socket.on('disconnect', () => {
        console.log(`لاعب مغادر: ${socket.id}`);
        // إزالة اللاعب من قائمة الانتظار إن وجد
        waitingPlayers = waitingPlayers.filter(id => id !== socket.id);
        delete players[socket.id];
        io.emit('player_disconnected', socket.id);
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log('السيرفر يعمل بكفاءة');
});
