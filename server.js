const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};
let players = {};

io.on('connection', (socket) => {
    console.log('لاعب متصل:', socket.id);

    // إرسال الغرف الحالية للمتصل الجديد
    socket.emit('update-room-list', getRoomsList());

    // إنشاء غرفة
    socket.on('create-room', ({ roomName }) => {
        const roomId = 'room_' + socket.id;
        rooms[roomId] = {
            id: roomId,
            name: roomName,
            host: socket.id,
            players: [socket.id]
        };
        socket.join(roomId);
        socket.emit('room-joined', { isHost: true, roomId });
        io.emit('update-room-list', getRoomsList());
    });

    // انضمام لغرفة
    socket.on('join-room', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].players.push(socket.id);
            socket.join(roomId);
            socket.emit('room-joined', { isHost: false, roomId });
            io.emit('update-room-list', getRoomsList());
        }
    });

    // بدء اللعبة من صاحب الغرفة
    socket.on('start-game-signal', () => {
        io.emit('game-started');
    });

    // لعب ضد البوت
    socket.on('play-with-bot', () => {
        players[socket.id] = { x: 200, y: 200, angle: 0, isBot: false };
        players['bot_1'] = { x: 500, y: 300, angle: 0, isBot: true };
        socket.emit('game-started');
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        delete rooms['room_' + socket.id];
        io.emit('update-room-list', getRoomsList());
    });
});

function getRoomsList() {
    return Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name,
        playersCount: r.players.length
    }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
