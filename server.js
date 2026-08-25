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

io.on('connection', (socket) => {
  console.log(`مستخدم متصل: ${socket.id}`);

  // الانضمام لغرفة معينة
  socket.on('joinRoom', (roomName) => {
    socket.join(roomName);
    console.log(`المستخدم ${socket.id} انضم إلى الغرفة: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log(`مستخدم غادر: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
