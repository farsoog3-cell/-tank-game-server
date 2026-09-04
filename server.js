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

// تخزين الغرف الحالية
const rooms = {};

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);

    // إنشاء غرفة جديدة
    socket.on('create-room', (roomCode) => {
        if (rooms[roomCode]) {
            socket.emit('error-msg', 'هذه الغرفة موجودة بالفعل، اختر كوداً آخر');
        } else {
            rooms[roomCode] = { player1: socket.id, player2: null };
            socket.join(roomCode);
            socket.emit('room-created', roomCode);
            console.log(`تم إنشاء الغرفة: ${roomCode}`);
        }
    });

    // الانضمام لغرفة موجودة
    socket.on('join-room', (roomCode) => {
        if (!rooms[roomCode]) {
            socket.emit('error-msg', 'هذه الغرفة غير موجودة!');
        } else if (rooms[roomCode].player2) {
            socket.emit('error-msg', 'الغرفة ممتلئة بالكامل!');
        } else {
            rooms[roomCode].player2 = socket.id;
            socket.join(roomCode);
            socket.emit('room-joined', roomCode);
            console.log(`انضم المستخدم إلى الغرفة: ${roomCode}`);
        }
    });

    // مزامنة مواقع دبابات اللاعبين داخل الغرفة
    socket.on('sync-tanks', (data) => {
        // إرسال البيانات إلى الطرف الآخر في نفس الغرفة
        socket.to(data.room).emit('sync-tanks', data);
    });

    // عند انقطاع الاتصال
    socket.on('disconnect', () => {
        console.log(`مستخدم انقطع اتصاله: ${socket.id}`);
        // تنظيف الغرف الفارغة إذا لزم الأمر
        for (let roomCode in rooms) {
            if (rooms[roomCode].player1 === socket.id || rooms[roomCode].player2 === socket.id) {
                delete rooms[roomCode];
                console.log(`تم حذف الغرفة بسبب خروج اللاعب: ${roomCode}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`);
});
