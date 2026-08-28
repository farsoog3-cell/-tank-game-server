const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {};

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);

    function updateRoomsList() {
        const roomsArray = Object.keys(rooms).map(roomName => ({
            name: roomName,
            playersCount: rooms[roomName].players.length
        }));
        io.emit('rooms_list', roomsArray);
    }

    updateRoomsList();

    socket.on('create_room', (data) => {
        const roomName = data.room;
        const playerFlag = data.flag;

        if (rooms[roomName]) {
            socket.emit('room_error', 'الغرفة موجودة مسبقاً');
            return;
        }

        socket.join(roomName);
        rooms[roomName] = {
            host: socket.id,
            players: [{ id: socket.id, flag: playerFlag }],
            enemyFlag: playerFlag === 'green' ? 'red' : 'green'
        };

        console.log(`تم إنشاء الغرفة: ${roomName} بواسطة ${socket.id}`);
        updateRoomsList();
    });

    socket.on('join_room', (data) => {
        const roomName = data.room;
        const playerFlag = data.flag;

        if (!rooms[roomName]) {
            socket.emit('room_error', 'الغرفة غير موجودة');
            return;
        }

        if (rooms[roomName].players.length >= 2) {
            socket.emit('room_error', 'الغرفة ممتلئة');
            return;
        }

        socket.join(roomName);
        rooms[roomName].players.push({ id: socket.id, flag: playerFlag });

        const hostPlayer = rooms[roomName].players[0];

        socket.emit('room_joined_success', {
            room: roomName,
            enemyFlag: hostPlayer.flag
        });

        socket.to(roomName).emit('player_joined_your_room', {
            flag: playerFlag
        });

        console.log(`انضم المستخدم ${socket.id} إلى الغرفة: ${roomName}`);
        updateRoomsList();
    });

    socket.on('start_battle', (data) => {
        const roomName = data.room;
        if (rooms[roomName]) {
            io.to(roomName).emit('start_multiplayer_battle');
            console.log(`بدء المعركة في الغرفة: ${roomName}`);
        }
    });

    socket.on('tank_move', (data) => {
        socket.to(data.room).emit('tank_move', data);
    });

    socket.on('disconnect', () => {
        console.log(`مستخدم انقطع ارتباطه: ${socket.id}`);
        for (let roomName in rooms) {
            rooms[roomName].players = rooms[roomName].players.filter(p => p.id !== socket.id);
            if (rooms[roomName].players.length === 0) {
                delete rooms[roomName];
            } else {
                io.to(roomName).emit('player_disconnected');
            }
        }
        updateRoomsList();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
