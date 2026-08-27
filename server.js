const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// إعداد Socket.io مع السماح بالاتصال من أي مصدر (CORS)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// متغيرات اللعبة لإدارة اللاعبين والفرق
let players = {};
let playerQueue = [];

io.on('connection', (socket) => {
    console.log(`🔌 لاعب جديد متصل: ${socket.id}`);

    // تخصيص الفريق للاعب الجديد (اللاعب الأول = player، الثاني = enemy)
    let assignedTeam = 'player';
    if (Object.keys(players).length % 2 !== 0) {
        assignedTeam = 'enemy';
    }

    players[socket.id] = {
        id: socket.id,
        team: assignedTeam
    };

    // إرسال الفريق للاعب الحالي
    socket.emit('assignTeam', { team: assignedTeam });

    // إشعار بقية اللاعبين بانضمام لاعب جديد
    socket.broadcast.emit('playerJoined', { playerId: socket.id, team: assignedTeam });

    // 1. استقبال وتوزيع حركة الدبابات
    socket.on('moveTank', (data) => {
        // إرسال الإحداثيات للجميع باستثناء المرسل
        socket.broadcast.emit('tankMoved', data);
    });

    // 2. استقبال وتوزيع شراء الدبابات
    socket.on('buyTank', (data) => {
        socket.broadcast.emit('tankBought', data);
    });

    // 3. استقبال وتوزيع إطلاق النار / الصواريخ
    socket.on('fireBullet', (data) => {
        socket.broadcast.emit('bulletFired', data);
    });

    // عند انفصال اللاعب
    socket.on('disconnect', () => {
        console.log(`❌ انقطع اتصال اللاعب: ${socket.id}`);
        delete players[socket.id];
    });
});

// مسار فحص عمل السيرفر عند فتحه من المتصفح
app.get('/', (req, res) => {
    res.send('🎮 Tank Game Server is Running Successfully!');
});

// تشغيل السيرفر على البورت المحدد من الاستضافة أو 3000 محلياً
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن على البورت: ${PORT}`);
});
