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

// تخزين الغرف واللاعبين
const rooms = {};

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);

    // إرسال قائمة الغرف المتاحة للمستخدم الجديد
    socket.emit('update-rooms', rooms);

    // إنشاء غرفة جديدة
    socket.on('create-room', (data) => {
        const roomName = data.roomName || `غرفة_${Math.floor(Math.random() * 1000)}`;
        if (!rooms[roomName]) {
            rooms[roomName] = {
                host: socket.id,
                players: [{ id: socket.id, flag: data.flag, ready: true }],
                status: 'waiting'
            };
            socket.join(roomName);
            socket.roomName = roomName;
            
            socket.emit('room-joined', { roomName, isHost: true, players: rooms[roomName].players });
            io.emit('update-rooms', rooms);
        } else {
            socket.emit('error-msg', 'هذه الغرفة موجودة بالفعل!');
        }
    });

    // الانضمام لغرفة موجودة
    socket.on('join-room', (data) => {
        const roomName = data.roomName;
        if (rooms[roomName] && rooms[roomName].status === 'waiting') {
            rooms[roomName].players.push({ id: socket.id, flag: data.flag, ready: false });
            socket.join(roomName);
            socket.roomName = roomName;

            socket.emit('room-joined', { roomName, isHost: false, players: rooms[roomName].players });
            io.to(roomName).emit('update-lobby', rooms[roomName].players);
            io.emit('update-rooms', rooms);
        } else {
            socket.emit('error-msg', 'الغرفة غير موجودة أو أن المعركة قد بدأت بالفعل!');
        }
    });

    // مزامنة حركة الدبابات داخل الغرفة
    socket.on('tankMove', (data) => {
        if (socket.roomName) {
            socket.to(socket.roomName).emit('updateTanks', data);
        }
    });

    // عند انقطاع الاتصال
    socket.on('disconnect', () => {
        console.log(`مستخدم انقطع اتصالـه: ${socket.id}`);
        if (socket.roomName && rooms[socket.roomName]) {
            rooms[socket.roomName].players = rooms[socket.roomName].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomName].players.length === 0) {
                delete rooms[socket.roomName];
            } else {
                io.to(socket.roomName).emit('update-lobby', rooms[socket.roomName].players);
            }
            io.emit('update-rooms', rooms);
        }
    });
});

// استخدام المنفذ المخصص من الاستضافة أو البورت المحلي 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على البورت: ${PORT}`);
});
