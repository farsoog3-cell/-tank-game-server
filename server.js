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

io.on('connection', (socket) => {
  console.log(`مستخدم متصل: ${socket.id}`);

  // إنشاء غرفة جديدة
  socket.on('create_room', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase(); // توليد كود عشوائي من 5 أحرف
    socket.join(roomCode);
    console.log(`المستخدم ${socket.id} أنشأ الغرفة: ${roomCode}`);
    socket.emit('room_joined', { roomCode, host: socket.id });
  });

  // الانضمام لغرفة موجودة
  socket.on('join_room', (roomCode) => {
    const room = io.sockets.adapter.rooms.get(roomCode);
    if (room) {
      socket.join(roomCode);
      console.log(`المستخدم ${socket.id} انضم للغرفة: ${roomCode}`);
      io.to(roomCode).emit('room_joined', { roomCode, message: 'انضم لاعب جديد' });
    } else {
      socket.emit('error_message', 'هذه الغرفة غير موجودة!');
    }
  });

  socket.on('disconnect', () => {
    console.log(`مستخدم غادر: ${socket.id}`);
  });
});

server.listen(3000, () => {
  console.log('السيرفر يعمل على المنفذ 3000');
});
