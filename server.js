const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

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

    socket.on('get_rooms', () => {
        let roomList = Object.keys(rooms).map(id => ({
            id: id,
            name: rooms[id].name,
            hostFlag: rooms[id].hostFlag,
            guestJoined: rooms[id].guestId !== null
        }));
        socket.emit('rooms_list', roomList);
    });

    socket.on('create_room', (data) => {
        let roomId = 'room_' + Math.random().toString(36).substr(2, 6);
        rooms[roomId] = {
            id: roomId,
            name: data.name || 'معركة سريعة',
            hostId: socket.id,
            hostFlag: data.hostFlag || 'green',
            guestId: null,
            guestFlag: data.hostFlag === 'green' ? 'red' : 'green',
            started: false
        };
        socket.join(roomId);
        socket.emit('room_joined', { id: roomId, name: rooms[roomId].name, isHost: true, hostFlag: rooms[roomId].hostFlag });
        io.emit('rooms_list', Object.keys(rooms).map(id => ({ id, name: rooms[id].name, hostFlag: rooms[id].hostFlag })));
    });

    socket.on('join_room', (data) => {
        let room = rooms[data.roomId];
        if (room && !room.guestId) {
            room.guestId = socket.id;
            socket.join(room.id);
            socket.emit('room_joined', { id: room.id, name: room.name, isHost: false, guestFlag: room.guestFlag });
            io.to(room.hostId).emit('room_update', { guestJoined: true });
        }
    });

    socket.on('start_game', (data) => {
        let room = rooms[data.roomId];
        if (room && room.hostId === socket.id) {
            room.started = true;
            io.to(room.id).emit('start_game');
        }
    });

    socket.on('spawn_tank', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            let targetSocket = (socket.id === room.hostId) ? room.guestId : room.hostId;
            if (targetSocket) {
                io.to(targetSocket).emit('remote_tank_spawn', { x: data.x, z: data.z, type: data.type });
            }
        }
    });

    socket.on('tank_move', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            let targetSocket = (socket.id === room.hostId) ? room.guestId : room.hostId;
            if (targetSocket) {
                io.to(targetSocket).emit('remote_tank_move', { index: data.index, x: data.x, y: data.y, z: data.z, rotY: data.rotY });
            }
        }
    });

    socket.on('shoot', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            let targetSocket = (socket.id === room.hostId) ? room.guestId : room.hostId;
            if (targetSocket) {
                io.to(targetSocket).emit('remote_shoot', { tankIndex: data.tankIndex });
            }
        }
    });

    socket.on('leave_room', (data) => {
        let room = rooms[data.roomId];
        if (room) {
            if (socket.id === room.hostId) {
                delete rooms[data.roomId];
                io.to(data.roomId).emit('rooms_list', []);
            } else if (socket.id === room.guestId) {
                room.guestId = null;
                io.to(room.hostId).emit('room_update', { guestJoined: false });
            }
            socket.leave(data.roomId);
            io.emit('rooms_list', Object.keys(rooms).map(id => ({ id, name: rooms[id].name, hostFlag: rooms[id].hostFlag })));
        }
    });

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.hostId === socket.id || room.guestId === socket.id) {
                delete rooms[roomId];
                io.emit('rooms_list', Object.keys(rooms).map(id => ({ id, name: rooms[id].name, hostFlag: rooms[id].hostFlag })));
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بكفاءة على البورت ${PORT}`);
});
