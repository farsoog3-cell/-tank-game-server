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
    console.log(`لاعب جديد متصل: ${socket.id}`);

    // إرسال قائمة الغرف فور الاتصال
    sendAvailableRooms(socket);

    socket.on('getRooms', () => sendAvailableRooms(socket));

    // 1. إنشاء غرفة جديدة مع المال الابتدائي والعلم
    socket.on('createRoom', (data) => {
        const roomId = `room_${Math.random().toString(36).substring(2, 9)}`;
        const roomName = data.name || `غرفة ${roomId}`;

        const newRoom = {
            id: roomId,
            name: roomName,
            hostSocketId: socket.id,
            startMoney: data.startMoney || 500, // 200, 500, 600
            players: [
                { id: socket.id, flag: data.flag || 'green', role: 'host', isReady: false }
            ],
            status: 'waiting' // waiting, ready, playing
        };

        rooms.set(roomId, newRoom);
        socket.join(roomId);

        socket.emit('roomCreated', { roomId, room: newRoom });
        broadcastRoomsList();
    });

    // 2. انضمام صديق للغرفة
    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);

        if (!room) return socket.emit('errorMsg', 'الغرفة غير موجودة!');
        if (room.players.length >= 2 || room.status !== 'waiting') {
            return socket.emit('errorMsg', 'الغرفة مكتملة أو بدأت المعركة!');
        }

        const guestPlayer = {
            id: socket.id,
            flag: data.flag || 'red',
            role: 'guest',
            isReady: false
        };

        room.players.push(guestPlayer);
        socket.join(data.roomId);

        // إعلام الطرفين بالتحديث
        io.to(room.id).emit('roomUpdated', room);
        broadcastRoomsList();
    });

    // 3. تحديث الاستعداد (مستعد / غير مستعد) والعلم Selected
    socket.on('toggleReady', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = !player.isReady;
            if (data.flag) player.flag = data.flag;
            
            io.to(room.id).emit('roomUpdated', room);
        }
    });

    // 4. بدء اللعبة بواسطة صاحب الغرفة عند جاهزية الطرفين
    socket.on('startGame', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.hostSocketId !== socket.id) return;

        // التأكد من وجود 2 لاعبين وجاهزيتهما
        const allReady = room.players.length === 2 && room.players.every(p => p.isReady);
        
        if (allReady) {
            room.status = 'playing';
            io.to(room.id).emit('gameStart', room);
            broadcastRoomsList();
        }
    });

    // 5. أوامر الحركة والشراء
    socket.on('tankMove', (data) => socket.to(data.roomId).emit('enemyMove', data));
    socket.on('buyTank', (data) => socket.to(data.roomId).emit('enemyBoughtTank', data));

    // 6. قطع الاتصال
    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                socket.to(roomId).emit('playerDisconnected');
                rooms.delete(roomId);
                broadcastRoomsList();
            }
        });
    });
});

function sendAvailableRooms(targetSocket) {
    targetSocket.emit('roomsList', getRoomsPayload());
}

function broadcastRoomsList() {
    io.emit('roomsList', getRoomsPayload());
}

function getRoomsPayload() {
    const list = [];
    rooms.forEach((room) => {
        list.push({
            id: room.id,
            name: room.name,
            playersCount: room.players.length,
            startMoney: room.startMoney,
            status: room.status // waiting, playing
        });
    });
    return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
