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

let rooms = {}; // تخزين الغرف واللاعبين فيها

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);

    // إرسال قائمة الغرف المتاحة فوراً عند الاتصال
    updateRoomsList();

    // إنشاء غرفة جديدة
    socket.on('create-room', (data) => {
        // data يأتي كـ { roomName, playerName } من العميل
        const roomName = data.roomName || 'غرفة معركة';
        const roomId = 'room_' + Math.random().toString(36).substring(2, 9); // معرف فريد للغرفة

        if (rooms[roomId]) {
            socket.emit('error-msg', 'هذه الغرفة موجودة بالفعل!');
            return;
        }

        rooms[roomId] = {
            id: roomId,
            name: roomName,
            players: [{ id: socket.id, name: data.playerName || 'قائد' }],
            status: 'waiting'
        };

        socket.join(roomId);
        socket.roomName = roomId;
        
        // الرد على العميل بأنه انضم بنجاح
        socket.emit('room-joined', { roomId, roomName });
        updateRoomsList();
        console.log(`تم إنشاء الغرفة: ${roomName} (${roomId}) بواسطة ${data.playerName}`);
    });

    // الانضمام إلى غرفة موجودة
    socket.on('join-room', (data) => {
        // data يأتي كـ { roomId, playerName }
        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error-msg', 'هذه الغرفة غير موجودة!');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error-msg', 'الغرفة ممتلئة بالفعل!');
            return;
        }

        room.players.push({ id: socket.id, name: data.playerName || 'قائد' });
        room.status = 'playing';

        socket.join(roomId);
        socket.roomName = roomId;

        socket.emit('room-joined', { roomId, roomName: room.name });
        updateRoomsList();

        // إشعار اللاعبين في الغرفة بأن المعركة بدأت
        io.to(roomId).emit('start-battle', room.players);
        console.log(`انضم المستخدم ${data.playerName} إلى الغرفة: ${room.name}`);
    });

    // استقبال حركة الدبابة من اللاعب وإرسالها للخصم
    socket.on('move-tank', (data) => {
        // data: { roomId, target: {x, z} }
        if (data.roomId && rooms[data.roomId]) {
            // إرسال التحرك للطرف الآخر في نفس الغرفة
            socket.to(data.roomId).emit('tank-moved', {
                playerId: socket.id,
                target: data.target
            });
        }
    });

    // شراء دبابة جديدة
    socket.on('buy-tank', (data) => {
        // data: { roomId, type }
        if (data.roomId && rooms[data.roomId]) {
            io.to(data.roomId).emit('spawn-tank', {
                playerId: socket.id,
                type: data.type
            });
        }
    });

    // التعامل مع مغادرة اللاعب أو انقطاع الاتصال
    socket.on('disconnect', () => {
        console.log('مستخدم انقطع اتصاله:', socket.id);
        if (socket.roomName && rooms[socket.roomName]) {
            io.to(socket.roomName).emit('opponent-disconnected');
            delete rooms[socket.roomName];
            updateRoomsList();
        }
    });
});

function updateRoomsList() {
    // تجهيز قائمة الغرف التي تنتظر لاعبين وإرسالها لكل المتصلين في القائمة الرئيسية
    const availableRooms = Object.values(rooms)
        .filter(r => r.status === 'waiting')
        .map(r => ({
            id: r.id,
            name: r.name,
            playersCount: r.players.length
        }));
    
    io.emit('update-rooms', availableRooms);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`);
});
