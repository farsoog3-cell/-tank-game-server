const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // السماح بالاتصال من أي مصدر (مثل ملف HTML المحلي أو موقعك)
        methods: ["GET", "POST"]
    }
});

// مسار افتراضي للتأكد من أن السيرفر يعمل
app.get('/', (req, res) => {
    res.send('خادم لعبة الدبابات الثلاثية الأبعاد يعمل بنجاح!');
});

// إدارة الاتصالات عبر Socket.io (غرفة اللعب الجماعي)
io.on('connection', (socket) => {
    console.log(`[اتصال جديد] انضم لاعب برقم التعريف: ${socket.id}`);

    // إعلام اللاعبين الآخرين بانضمام لاعب جديد
    socket.broadcast.emit('player_joined', { id: socket.id });

    // استقبال حدث شراء الدبابة وبثه لبقية اللاعبين في الغرفة
    socket.on('buy_tank', (data) => {
        console.log(`[شراء دبابة] اللاعب ${socket.id} اشترى دبابة لصالح: ${data.camp}`);
        
        // إرسال الحدث لجميع اللاعبين المتصلين (بما فيهم الصديق)
        io.emit('tank_purchased', {
            playerId: socket.id,
            camp: data.camp,
            message: `قام لاعب بشراء دبابة حربية جديدة لـ ${data.camp}!`
        });
    });

    // التعامل مع حركة الدبابات أو إطلاق النار (يمكن توسيعها مستقبلاً)
    socket.on('tank_move', (positionData) => {
        socket.broadcast.emit('update_tank_position', {
            playerId: socket.id,
            position: positionData
        });
    });

    // عند انقطاع اتصال أحد اللاعبين
    socket.on('disconnect', () => {
        console.log(`[انقطاع اتصال] غادر اللاعب: ${socket.id}`);
        io.emit('player_left', { id: socket.id });
    });
});

// تشغيل السيرفر على المنفذ المخصص (Render يحدد PORT تلقائياً أو 3000 محلياً)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن على المنفذ: ${PORT}`);
});
