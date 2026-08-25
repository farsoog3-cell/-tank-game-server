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

// تخزين بيانات اللاعبين المتصلين
const players = {};

io.on('connection', (socket) => {
  console.log(`لاعب متصل جديد: ${socket.id}`);

  // استقبال بيانات موقع اللاعب وإرسالها لباقي اللاعبين
  socket.on('playerMove', (data) => {
    players[socket.id] = data;
    socket.broadcast.emit('updatePlayers', players);
  });

  // عند انقطاع اتصال اللاعب
  socket.on('disconnect', () => {
    console.log(`انقطع اتصال اللاعب: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
