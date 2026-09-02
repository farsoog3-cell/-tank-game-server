const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

io.on('connection', (socket) => {
    console.log(`لاعب متصل: ${socket.id}`);

    // تحديد دور اللاعب (أول أو ثانٍ)
    let role = Object.keys(players).length === 0 ? 'player1' : 'player2';
    players[socket.id] = { id: socket.id, role: role, x: 0, z: 0, hp: 100 };

    socket.emit('assign-role', { role, id: socket.id });

    // استقبال تحديث حركة الدبابة وإرسالها للآخرين
    socket.addListener('tank-move', (data) => {
        socket.broadcast.emit('tank-move', { id: socket.id, ...data });
    });

    // استقبال إطلاق النار
    socket.addListener('tank-shoot', (data) => {
        socket.broadcast.emit('tank-shoot', { id: socket.id, ...data });
    });

    // شراء دبابة جديدة وتحديث الاقتصاد
    socket.addListener('buy-tank', (data) => {
        socket.broadcast.emit('buy-tank', data);
    });

    socket.on('disconnect', () => {
        console.log(`لاعب غادر: ${socket.id}`);
        delete players[socket.id];
        socket.broadcast.emit('player-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
