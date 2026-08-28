const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = new Map();

io.on('connection', (socket) => {
    sendAvailableRooms(socket);

    socket.on('getRoomsList', () => sendAvailableRooms(socket));

    socket.on('createRoom', (data) => {
        const roomId = `room_${Math.random().toString(36).substring(2, 9)}`;
        const roomName = data.roomName || `غرفة ${roomId}`;

        const newRoom = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            initialMoney: data.initialMoney || 500,
            isPlaying: false,
            host: { id: socket.id, flag: data.flag || 'green', ready: false },
            guest: null
        };

        rooms.set(roomId, newRoom);
        socket.join(roomId);
        socket.emit('roomJoined', getRoomClientData(newRoom));
        broadcastRoomsList();
    });

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return socket.emit('errorMessage', 'الغرفة غير موجودة!');
        if (room.guest || room.isPlaying) return socket.emit('errorMessage', 'الغرفة مكتملة!');

        room.guest = { id: socket.id, flag: 'red', ready: false };
        socket.join(data.roomId);

        socket.emit('roomJoined', getRoomClientData(room));
        io.to(data.roomId).emit('lobbyUpdated', getRoomClientData(room));
        broadcastRoomsList();
    });

    socket.on('updatePlayerFlag', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return;
        if (room.host && room.host.id === socket.id) room.host.flag = data.flag;
        else if (room.guest && room.guest.id === socket.id) room.guest.flag = data.flag;
        io.to(room.id).emit('lobbyUpdated', getRoomClientData(room));
    });

    socket.on('playerReadyState', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return;
        if (room.host && room.host.id === socket.id) room.host.ready = data.ready;
        else if (room.guest && room.guest.id === socket.id) room.guest.ready = data.ready;
        io.to(room.id).emit('lobbyUpdated', getRoomClientData(room));
    });

    socket.on('startGameRequest', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.hostId !== socket.id) return;
        if (room.host && room.guest && room.host.ready && room.guest.ready) {
            room.isPlaying = true;
            io.to(room.id).emit('gameStarted', getRoomClientData(room));
            broadcastRoomsList();
        } else {
            socket.emit('errorMessage', 'يجب استغلال الجاهزية من كلا الطرفين!');
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.hostId === socket.id || (room.guest && room.guest.id === socket.id)) {
                io.to(roomId).emit('errorMessage', 'انقطع اتصال اللاعب!');
                rooms.delete(roomId);
                broadcastRoomsList();
            }
        });
    });
});

function sendAvailableRooms(targetSocket) { targetSocket.emit('updateRoomsList', getRoomsPayload()); }
function broadcastRoomsList() { io.emit('updateRoomsList', getRoomsPayload()); }

function getRoomsPayload() {
    const list = {};
    rooms.forEach((room, id) => {
        let count = (room.host ? 1 : 0) + (room.guest ? 1 : 0);
        list[id] = { id: room.id, name: room.name, playersCount: count, initialMoney: room.initialMoney, isPlaying: room.isPlaying };
    });
    return list;
}

function getRoomClientData(room) {
    let count = (room.host ? 1 : 0) + (room.guest ? 1 : 0);
    return { id: room.id, name: room.name, hostId: room.hostId, initialMoney: room.initialMoney, playersCount: count, host: room.host, guest: room.guest };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`السيرفر شغال 🚀: ${PORT}`));
