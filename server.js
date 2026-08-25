const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let rooms = [];

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);

    // إرسال قائمة الغرف
    socket.on('get_rooms', () => {
        socket.emit('rooms_list', rooms);
    });

    // إنشاء غرفة جديدة
    socket.on('create_room', (data) => {
        const roomId = 'room_' + Math.random().toString(36).substring(2, 7);
        const newRoom = {
            id: roomId,
            name: data.name,
            hostFlag: data.hostFlag,
            hostId: socket.id,
            guestId: null,
            guestJoined: false
        };
        rooms.push(newRoom);
        socket.join(roomId);
        
        socket.emit('room_joined', { id: roomId, name: data.name, isHost: true, hostFlag: data.hostFlag });
        io.emit('rooms_list', rooms);
    });

    // انضمام للغرفة
    socket.on('join_room', (data) => {
        const room = rooms.find(r => r.id === data.roomId);
        if (room && !room.guestJoined) {
            room.guestId = socket.id;
            room.guestJoined = true;
            socket.join(room.id);

            let guestFlag = room.hostFlag === 'green' ? 'red' : 'green';
            socket.emit('room_joined', { id: room.id, name: room.name, isHost: false, guestFlag: guestFlag });
            
            // إعلام المضيف أن الخصم انضم
            io.to(room.hostId).emit('room_update', room);
            io.emit('rooms_list', rooms);
        }
    });

    // بدء المعركة
    socket.on('start_game', (data) => {
        io.to(data.roomId).emit('start_game');
    });

    // مزامنة حركة الدبابات
    socket.on('tank_move', (data) => {
        socket.to(data.roomId).emit('remote_tank_move', data);
    });

    socket.on('spawn_tank', (data) => {
        socket.to(data.roomId).emit('remote_tank_spawn', data);
    });

    // المغادرة
    socket.on('disconnect', () => {
        rooms = rooms.filter(r => r.hostId !== socket.id && r.guestId !== socket.id);
        io.emit('rooms_list', rooms);
        console.log('مستخدم غادر:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('السيرفر يعمل على المنفذ:', PORT);
});
