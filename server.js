const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let rooms = {};

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);
    socket.emit('set_my_id', { id: socket.id });

    socket.on('get_rooms', () => {
        socket.emit('rooms_list', getRoomsArray());
    });

    socket.on('create_room', (data) => {
        let roomId = 'room_' + Math.random().toString(36).substring(2, 7);
        rooms[roomId] = {
            id: roomId,
            name: data.name,
            bet: data.bet,
            hostId: socket.id,
            hostFlag: data.hostFlag,
            hostReady: false,
            guestId: null,
            guestFlag: data.hostFlag === 'green' ? 'red' : 'green',
            guestReady: false
        };
        socket.join(roomId);
        socket.emit('room_joined', { 
            id: roomId, name: data.name, bet: data.bet, isHost: true, 
            hostFlag: data.hostFlag, guestFlag: rooms[roomId].guestFlag 
        });
        io.emit('rooms_list', getRoomsArray());
    });

    socket.on('join_room', (data) => {
        let room = rooms[data.roomId];
        if (room && !room.guestId) {
            room.guestId = socket.id;
            socket.join(room.id);
            socket.emit('room_joined', { 
                id: room.id, name: room.name, bet: room.bet, isHost: false, 
                hostFlag: room.hostFlag, guestFlag: room.guestFlag 
            });
            io.to(room.hostId).emit('room_update', { guestJoined: true, guestFlag: room.guestFlag });
            io.emit('rooms_list', getRoomsArray());
        }
    });

    socket.on('set_ready', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            if (room.hostId === socket.id) room.hostReady = data.ready;
            if (room.guestId === socket.id) room.guestReady = data.ready;

            io.to(room.id).emit('room_ready_update', {
                hostReady: room.hostReady,
                guestReady: room.guestReady
            });
        }
    });

    socket.on('start_game', (data) => {
        let room = rooms[data.roomId];
        if (room && room.hostId === socket.id && room.hostReady && room.guestReady) {
            io.to(room.id).emit('start_game');
        }
    });

    // نظام نقل إحداثيات وأحداث الحرب والقتال بين الطرفين
    socket.on('tank_move', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_tank_move', data);
    });

    socket.on('spawn_tank', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_tank_spawn', data);
    });

    socket.on('shoot', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_shoot', data);
    });

    socket.on('tank_damaged', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_tank_damaged', data);
    });

    socket.on('capture_rig', (data) => {
        socket.broadcast.to(data.roomId).emit('rig_captured', data);
    });

    socket.on('leave_room', (data) => {
        if (rooms[data.roomId]) {
            delete rooms[data.roomId];
            io.emit('rooms_list', getRoomsArray());
        }
        socket.leave(data.roomId);
    });

    socket.on('disconnect', () => {
        for (let rId in rooms) {
            if (rooms[rId].hostId === socket.id || rooms[rId].guestId === socket.id) {
                io.to(rId).emit('room_update', { guestJoined: false });
                delete rooms[rId];
            }
        }
        io.emit('rooms_list', getRoomsArray());
    });
});

function getRoomsArray() {
    return Object.keys(rooms).map(id => ({
        id: id,
        name: rooms[id].name,
        bet: rooms[id].bet,
        hostFlag: rooms[id].hostFlag,
        guestJoined: rooms[id].guestId !== null
    }));
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
