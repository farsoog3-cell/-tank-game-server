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

let rooms = {}; // لتخزين بيانات الغرف واللاعبين

app.get('/', (req, res) => {
    res.send('خادم لعبة حرب المعسكرات يعمل بكفاءة!');
});

io.on('connection', (socket) => {
    console.log(`[اتصال جديد] معرف اللاعب: ${socket.id}`);

    // إرسال قائمة الغرف المتاحة للمستخدم عند الطلب
    socket.on('get_rooms', () => {
        let roomsList = Object.keys(rooms).map(name => ({
            name: name,
            playersCount: rooms[name].players.length
        }));
        socket.emit('rooms_list', roomsList);
    });

    // إنشاء غرفة جديدة
    socket.on('create_room', (data) => {
        rooms[data.roomName] = {
            name: data.roomName,
            money: data.money,
            players: [{ id: socket.id, camp: data.camp, ready: false, host: true }]
        };
        socket.join(data.roomName);
        socket.emit('room_created_success', { roomName: data.roomName });
        console.log(`[إنشاء غرفة] الغرفة: ${data.roomName} بواسطة اللاعب ${socket.id}`);
    });

    // انضمام صديق إلى الغرفة
    socket.on('join_room', (data) => {
        if (rooms[data.roomName]) {
            socket.join(data.roomName);
            rooms[data.roomName].players.push({
                id: socket.id,
                camp: data.camp,
                ready: false,
                host: false
            });
            // تحديث اللوبي للاعبين في نفس الغرفة
            io.to(data.roomName).emit('update_lobby', { players: rooms[data.roomName].players });
            console.log(`[انضمام لغرفة] انضم اللاعب ${socket.id} إلى غرفة ${data.roomName}`);
        }
    });

    // حالة الاستعداد للعب (جاهز / غير جاهز)
    socket.on('player_ready', (data) => {
        let room = rooms[data.roomName];
        if (room) {
            let player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = data.ready;
                io.to(data.roomName).emit('update_lobby', { players: room.players });
            }
        }
    });

    // بدء الحرب من قِبل صاحب الغرفة
    socket.on('start_game', (data) => {
        let room = rooms[data.roomName];
        if (room) {
            io.to(data.roomName).emit('launch_game', { money: room.money });
            console.log(`[بدء الحرب] انطلقت المعركة في الغرفة: ${data.roomName}`);
        }
    });

    // شراء دبابة داخل المعسكر وإرسالها لبقية اللاعبين
    socket.on('buy_tank_action', (data) => {
        io.to(data.roomName).emit('tank_spawned', {
            playerId: socket.id,
            camp: data.camp
        });
        console.log(`[شراء دبابة] تم شراء دبابة في معسكر ${data.camp} داخل غرفة ${data.roomName}`);
    });

    // مغادرة أو انقطاع اتصال اللاعب
    socket.on('disconnect', () => {
        console.log(`[انقطاع اتصال] غادر اللاعب: ${socket.id}`);
        for (let roomName in rooms) {
            rooms[roomName].players = rooms[roomName].players.filter(p => p.id !== socket.id);
            // إذا فرغت الغرفة، يتم حذفها
            if (rooms[roomName].players.length === 0) {
                delete rooms[roomName];
                console.log(`[حذف غرفة] تم حذف الغرفة الفارغة: ${roomName}`);
            } else {
                // تحديث اللوبي لمن تبقى
                io.to(roomName).emit('update_lobby', { players: rooms[roomName].players });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
