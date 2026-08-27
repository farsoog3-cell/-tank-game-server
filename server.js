const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = [];

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);

    // إرسال قائمة الغرف المتاحة للجميع عند الاتصال
    socket.emit('update_rooms_list', rooms);

    // إنشاء غرفة جديدة
    socket.on('create_room', (data) => {
        leaveCurrentRoom(socket);

        const roomName = (data && data.roomName) ? data.roomName : 'غرفة معركة';
        const playerFlag = (data && data.flag) ? data.flag : 'green';

        const roomId = 'room_' + Math.random().toString(36).substring(2, 7);
        const newRoom = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            players: [
                { id: socket.id, flag: playerFlag, ready: true }
            ],
            gameStarted: false
        };

        rooms.push(newRoom);
        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit('room_joined_success', { isHost: true, room: newRoom });
        io.emit('update_rooms_list', rooms); // تحديث القائمة لكل اللاعبين المتصلين لتظهر الغرفة للجميع
    });

    // الانضمام إلى غرفة موجودة (بحد أقصى لاعبين اثنين لكل غرفة)
    socket.on('join_room', (data) => {
        leaveCurrentRoom(socket);

        const roomId = data.roomId;
        const playerFlag = data.flag || 'red';
        const room = rooms.find(r => r.id === roomId);

        if (!room) {
            socket.emit('error_msg', 'هذه الغرفة غير متاحة أو تم إغلاقها.');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error_msg', 'عذراً، الغرفة ممتلئة (لاعبان كحد أقصى).');
            return;
        }

        if (room.gameStarted) {
            socket.emit('error_msg', 'المعركة قد بدأت بالفعل في هذه الغرفة.');
            return;
        }

        room.players.push({ id: socket.id, flag: playerFlag, ready: false });
        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit('room_joined_success', { isHost: false, room: room });
        io.to(roomId).emit('room_players_update', room);
        io.emit('update_rooms_list', rooms);
    });

    // تبديل حالة الاستعداد
    socket.on('toggle_ready', () => {
        const roomId = socket.roomId;
        if (!roomId) return;

        const room = rooms.find(r => r.id === roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && player.id !== room.hostId) {
            player.ready = !player.ready;
            io.to(roomId).emit('room_players_update', room);
        }
    });

    // بدء المعركة من قبل المنظم
    socket.on('start_game', () => {
        const roomId = socket.roomId;
        if (!roomId) return;

        const room = rooms.find(r => r.id === roomId);
        if (!room || room.hostId !== socket.id) return;

        room.gameStarted = true;
        io.to(roomId).emit('game_started');

        // إزالة الغرفة من القائمة العامة بمجرد بدء اللعبة
        rooms = rooms.filter(r => r.id !== roomId);
        io.emit('update_rooms_list', rooms);
    });

    // قطع الاتصال أو الخروج
    socket.on('disconnect', () => {
        leaveCurrentRoom(socket);
        console.log(`مستخدم غادر: ${socket.id}`);
    });

    function leaveCurrentRoom(sock) {
        if (!sock.roomId) return;
        const roomId = sock.roomId;
        let room = rooms.find(r => r.id === roomId);

        if (room) {
            if (room.hostId === sock.id) {
                io.to(roomId).emit('room_closed');
                rooms = rooms.filter(r => r.id !== roomId);
            } else {
                room.players = room.players.filter(p => p.id !== sock.id);
                io.to(roomId).emit('room_players_update', room);
            }
            io.emit('update_rooms_list', rooms);
        }
        sock.roomId = null;
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على البورت ${PORT}`);
});
