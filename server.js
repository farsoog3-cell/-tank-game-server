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

    // 🔥 إرسال قائمة الغرف فور اتصال اللاعب تلقائياً
    sendAvailableRooms(socket);

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
            status: 'waiting' // waiting, ready, playing
        };

        rooms.set(roomId, newRoom);
        socket.join(roomId);

        // إعلام المنشئ بنجاح العملية
        socket.emit('roomCreated', { roomId, name: roomName });
        
        // تحديث قائمة الغرف لكل المتصلين فوراً
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

        if (room.players.length >= 2 || room.status !== 'waiting') {
            socket.emit('errorMsg', 'الغرفة مكتملة أو بدأت المعركة بالفعل!');
            return;
        }

        // إضافة اللاعب الثاني (الضيف)
        room.players.push({
            id: socket.id,
            flag: data.flag || 'red',
            role: 'guest'
        });
        
        room.status = 'ready'; // أصبحت الغرفة جاهزة لبدء المعركة من قبل المضيف
        socket.join(data.roomId);

        // إشعار صاحب الغرفة بانضمام المنافس لتجهيز زر البدء
        socket.to(room.hostSocketId).emit('playerJoined', {
            guestId: socket.id,
            roomId: room.id
        });

        broadcastRoomsList();
        console.log(`انضم لاعب إلى الغرفة: ${room.name}`);
    });

    // 4. بدء المعركة بواسطة صاحب الغرفة (Host)
    socket.on('startGame', (data) => {
        const room = rooms.get(data.roomId);
        
        if (room && room.hostSocketId === socket.id) {
            room.status = 'playing';
            
            // إعلام جميع اللاعبين داخل الغرفة ببدء المعركة
            io.to(room.id).emit('gameStart', {
                roomId: room.id,
                players: room.players
            });

            broadcastRoomsList();
            console.log(`بدأت المعركة في الغرفة: ${room.name}`);
        }
    });

    // 5. تمرير حركة الدبابات بين اللاعبين
    socket.on('tankMove', (data) => {
        socket.to(data.roomId).emit('enemyMove', data);
    });

    // 6. تمرير شراء الدبابات بين اللاعبين
    socket.on('buyTank', (data) => {
        socket.to(data.roomId).emit('enemyBoughtTank', data);
    });

    // 7. التعامل مع قطع الاتصال (الانفصال)
    socket.on('disconnect', () => {
        console.log(`لاعب غادر: ${socket.id}`);

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

// دالة لإرسال الغرف للاعب محدد
function sendAvailableRooms(targetSocket) {
    const availableRooms = getRoomsPayload();
    targetSocket.emit('roomsList', availableRooms);
}

// دالة لتحديث القائمة لدى جميع المتصلين فوراً
function broadcastRoomsList() {
    const availableRooms = getRoomsPayload();
    io.emit('roomsList', availableRooms);
}

// تجهيز هيكل بيانات الغرف
function getRoomsPayload() {
    const list = [];
    rooms.forEach((room) => {
        list.push({
            id: room.id,
            name: room.name,
            playersCount: room.players.length,
            isStarted: room.status === 'playing'
        });
    });
    return list;
}

// تشغيل السيرفر على المنفذ المخصص
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
