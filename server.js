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

let rooms = {};

app.get('/', (req, res) => {
    res.send('خادم حرب المعسكرات المتقدمة يعمل بنجاح!');
});

io.on('connection', (socket) => {
    console.log(`[اتصال جديد] معرف اللاعب: ${socket.id}`);

    socket.on('get_rooms', () => {
        let roomsList = Object.keys(rooms).map(name => ({
            name: name,
            playersCount: rooms[name].players.length
        }));
        socket.emit('rooms_list', roomsList);
    });

    socket.on('create_room', (data) => {
        rooms[data.roomName] = {
            name: data.roomName,
            money: data.money,
            players: [{ id: socket.id, camp: data.camp, ready: false, host: true }]
        };
        socket.join(data.roomName);
        socket.emit('room_created_success', { roomName: data.roomName });
    });

    socket.on('join_room', (data) => {
        if (rooms[data.roomName]) {
            socket.join(data.roomName);
            rooms[data.roomName].players.push({
                id: socket.id,
                camp: data.camp,
                ready: false,
                host: false
            });
            io.to(data.roomName).emit('update_lobby', { players: rooms[data.roomName].players });
        }
    });

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

    socket.on('start_game', (data) => {
        let room = rooms[data.roomName];
        if (room) {
            io.to(data.roomName).emit('launch_game', { money: room.money });
        }
    });

    // شراء دبابة وإرسالها لكل اللاعبين في الغرفة (أنت وصديقك)
    socket.on('buy_tank_action', (data) => {
        io.to(data.roomName).emit('tank_spawned', {
            tankId: data.tankId,
            camp: data.camp,
            x: data.x,
            z: data.z
        });
    });

    // استقبال حركة الدبابة من لاعب وإرسالها للصديق الآخر فوراً
    socket.on('tank_move', (data) => {
        socket.to(data.roomName).emit('tank_moved', {
            tankId: data.tankId,
            x: data.x,
            z: data.z
        });
    });

    socket.on('disconnect', () => {
        for (let roomName in rooms) {
            rooms[roomName].players = rooms[roomName].players.filter(p => p.id !== socket.id);
            if (rooms[roomName].players.length === 0) {
                delete rooms[roomName];
            } else {
                io.to(roomName).emit('update_lobby', { players: rooms[roomName].players });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن على المنفذ: ${PORT}`);
});
