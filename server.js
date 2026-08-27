const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // السماح بالاتصال من أي نطاق
        methods: ["GET", "POST"]
    }
});

// تخزين الغرف النشطة في الذاكرة
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`لاعب جديد متصل: ${socket.id}`);

    // 1. إرسال قائمة الغرف المتاحة عند الطلب
    socket.on('getRooms', () => {
        sendAvailableRooms(socket);
    });

    // 2. إنشاء غرفة جديدة
    socket.on('createRoom', (data) => {
        const roomId = `room_${Math.random().toString(36).substring(2, 9)}`;
        const roomName = data.name || `غرفة ${roomId}`;

        const newRoom = {
            id: roomId,
            name: roomName,
            hostSocketId: socket.id,
            players: [
                { id: socket.id, flag: data.flag || 'green', role: 'host' }
            ],
            status: 'waiting' // waiting, playing
        };

        rooms.set(roomId, newRoom);
        socket.join(roomId);

        // إعلام المنشئ بنجاح العملية
        socket.emit('roomCreated', { roomId, name: roomName });
        
        // تحديث قائمة الغرف لكل اللاعبين في المتصفح
        broadcastRoomsList();
        console.log(`تم إنشاء الغرفة: ${roomName} (${roomId})`);
    });

    // 3. الإنضمام إلى غرفة موجودة
    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);

        if (!room) {
            socket.emit('errorMsg', 'الغرفة غير موجودة!');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('errorMsg', 'الغرفة مكتملة بالفعل!');
            return;
        }

        // إضافة اللاعب الثاني
        room.players.push({
            id: socket.id,
            flag: data.flag || 'red',
            role: 'guest'
        });
        room.status = 'playing';

        socket.join(data.roomId);

        // إعلام الطرفين ببدء اللعبة
        io.to(data.roomId).emit('gameStart', {
            roomId: room.id,
            players: room.players
        });

        broadcastRoomsList();
        console.log(`انضم لاعب إلى الغرفة: ${room.name}`);
    });

    // 4. تمرير حركة الدبابات بين اللاعبين
    socket.on('tankMove', (data) => {
        // إرسال الأمر للخصم في نفس الغرفة فقط
        socket.to(data.roomId).emit('enemyMove', data);
    });

    // 5. تمرير شراء الدبابات بين اللاعبين
    socket.on('buyTank', (data) => {
        socket.to(data.roomId).emit('enemyBoughtTank', data);
    });

    // 6. التعامل مع قطع الاتصال (الانفصال)
    socket.on('disconnect', () => {
        console.log(`لاعب غادر: ${socket.id}`);

        // البحث عن الغرف التي كان فيها هذا اللاعب وإغلاقها
        rooms.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                // إبلاغ الطرف الآخر بانسحاب الخصم
                socket.to(roomId).emit('playerDisconnected');
                rooms.delete(roomId);
                broadcastRoomsList();
            }
        });
    });
});

// دالة مخصصة لإرسال الغرف الشاغرة فقط (التي تنتظر لاعباً ثانياً)
function sendAvailableRooms(targetSocket) {
    const availableRooms = [];
    rooms.forEach((room) => {
        if (room.status === 'waiting' && room.players.length < 2) {
            availableRooms.push({
                id: room.id,
                name: room.name,
                playersCount: room.players.length
            });
        }
    });
    targetSocket.emit('roomsList', availableRooms);
}

// دالة لتحديث القائمة لدى جميع المتصلين
function broadcastRoomsList() {
    const availableRooms = [];
    rooms.forEach((room) => {
        if (room.status === 'waiting' && room.players.length < 2) {
            availableRooms.push({
                id: room.id,
                name: room.name,
                playersCount: room.players.length
            });
        }
    });
    io.emit('roomsList', availableRooms);
}

// تشغيل السيرفر على المنفذ المخصص (Render/Heroku أو 3000 محلياً)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
