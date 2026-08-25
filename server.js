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

    // إرسال قائمة الغرف المتاحة للمستخدم فور اتصاله
    updateRoomsList();

    // إنشاء غرفة جديدة
    socket.on('create-room', (roomName) => {
        if (rooms[roomName]) {
            socket.emit('error-msg', 'هذه الغرفة موجودة بالفعل، اختر اسمًا آخر!');
            return;
        }

        rooms[roomName] = {
            players: [socket.id],
            status: 'waiting'
        };

        socket.join(roomName);
        socket.roomName = roomName;
        
        socket.emit('room-joined', roomName);
        updateRoomsList();
        console.log(`تم إنشاء الغرفة: ${roomName} بواسطة ${socket.id}`);
    });

    // الانضمام إلى غرفة موجودة
    socket.on('join-room', (roomName) => {
        if (!rooms[roomName]) {
            socket.emit('error-msg', 'هذه الغرفة غير موجودة!');
            return;
        }

        if (rooms[roomName].players.length >= 2) {
            socket.emit('error-msg', 'الغرفة ممتلئة بالفعل!');
            return;
        }

        rooms[roomName].players.push(socket.id);
        rooms[roomName].status = 'playing';

        socket.join(roomName);
        socket.roomName = roomName;

        socket.emit('room-joined', roomName);
        updateRoomsList();

        // إشعار اللاعبين بأن المعركة قد بدأت لاكتمال العدد (لاعبين اثنين)
        io.to(roomName).emit('start-battle');
        console.log(`انضم المستخدم ${socket.id} إلى الغرفة: ${roomName} وبدأت المعركة`);
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
    // إرسال أسماء الغرف التي تنتظر لاعبين فقط
    const availableRooms = Object.keys(rooms).filter(r => rooms[r].status === 'waiting');
    io.emit('room-list', availableRooms);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`);
});
