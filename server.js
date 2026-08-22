const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// تخزين حالات اللاعبين والغرف النشطة
let rooms = {}; // { roomId: { socketId: { x, z, rotY, name } } }

io.on('connection', (socket) => {
    console.log('لاعب متصل:', socket.id);

    // انضمام لاعب لغرفة معينة
    socket.on('join_room', (data) => {
        const { roomId, name } = data;
        socket.join(roomId);
        
        if (!rooms[roomId]) rooms[roomId] = {};
        rooms[roomId][socket.id] = { x: 0, z: 0, rotY: 0, name: name || 'قائد' };

        // إرسال قائمة اللاعبين المحدثة لكل من في الغرفة
        io.to(roomId).emit('update_players_state', rooms[roomId]);
    });

    // استقبال حركة اللاعب وبثها لباقي اللاعبين في نفس الغرفة
    socket.on('player_move', (data) => {
        const { roomId, x, z, rotY } = data;
        if (rooms[roomId] && rooms[roomId][socket.id]) {
            rooms[roomId][socket.id].x = x;
            rooms[roomId][socket.id].z = z;
            rooms[roomId][socket.id].rotY = rotY;

            // بث الحركة للجميع ما عدا المرسل لضمان سلاسة الحركة
            socket.to(roomId).emit('update_players_state', rooms[roomId]);
        }
    });

    // مغادرة أو انقطاع اتصال اللاعب
    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            if (rooms[roomId][socket.id]) {
                delete rooms[roomId][socket.id];
                socket.to(roomId).emit('player_disconnected', socket.id);
                
                // إذا فرغت الغرفة، يتم حذفها لتوفير الذاكرة
                if (Object.keys(rooms[roomId]).length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
        console.log('لاعب غادر:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`سيرفر الأونلاين يعمل بنجاح على المنفذ ${PORT}`);
});