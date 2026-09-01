const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let rooms = {}; // لتخزين الغرف الحالية

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);

    // إرسال قائمة الغرف المتاحة
    socket.on('get_rooms', () => {
        socket.emit('rooms_list', getRoomsArray());
    });

    // إنشاء غرفة جديدة
    socket.on('create_room', (data) => {
        let roomId = 'room_' + Math.random().toString(36).substring(2, 7);
        rooms[roomId] = {
            id: roomId,
            name: data.name,
            hostId: socket.id,
            hostFlag: data.hostFlag,
            guestId: null,
            guestFlag: data.hostFlag === 'green' ? 'red' : 'green'
        };
        socket.join(roomId);
        socket.emit('room_joined', { id: roomId, name: data.name, isHost: true, hostFlag: data.hostFlag });
        io.emit('rooms_list', getRoomsArray());
    });

    // انضمام للغرفة
    socket.on('join_room', (data) => {
        let room = rooms[data.roomId];
        if (room && !room.guestId) {
            room.guestId = socket.id;
            socket.join(room.id);
            socket.emit('room_joined', { id: room.id, name: room.name, isHost: false, hostFlag: room.hostFlag, guestFlag: room.guestFlag });
            io.to(room.hostId).emit('room_update', { guestJoined: true });
            io.emit('rooms_list', getRoomsArray());
        }
    });

    // بدء المعركة
    socket.on('start_game', (data) => {
        let room = rooms[data.roomId];
        if (room && room.hostId === socket.id) {
            io.to(room.id).emit('start_game');
        }
    });

    // مزامنة مكان وزاوية الدبابة
    socket.on('tank_move', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_tank_move', data);
    });

    // بناء وتوليد دبابة جديدة عند الخصم
    socket.on('spawn_tank', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_tank_spawn', data);
    });

    // إطلاق النار
    socket.on('shoot', (data) => {
        socket.broadcast.to(data.roomId).emit('remote_shoot', data);
    });

    // السيطرة على آبار النفط
    socket.on('capture_rig', (data) => {
        socket.broadcast.to(data.roomId).emit('rig_captured', data);
    });

    // مغادرة الغرفة
    socket.on('leave_room', (data) => {
        if (rooms[data.roomId]) {
            delete rooms[data.roomId];
            io.emit('rooms_list', getRoomsArray());
        }
        socket.leave(data.roomId);
    });

    // قطع الاتصال
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
        hostFlag: rooms[id].hostFlag,
        guestJoined: rooms[id].guestId !== null
    }));
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
