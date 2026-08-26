const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // يمكنك تحديد النطاق الخاص بك لاحقاً للأمان
    methods: ["GET", "POST"]
  }
});

// تخزين حالات اللاعبين والغرف
const players = {};

io.on('connection', (socket) => {
  console.log(`لاعب متصل جديد: ${socket.id}`);

  // تسجيل اللاعب الجديد في اللعبة
  players[socket.id] = {
    id: socket.id,
    x: 0,
    z: 0,
    money: 1000,
    oil: 0,
    tanks: []
  };

  // إرسال البيانات الحالية للاعبين الجدد
  socket.emit('current_players', players);
  
  // إعلام الجميع بانضمام لاعب جديد
  socket.broadcast.emit('player_joined', players[socket.id]);

  // استقبال تحديثات حركة اللاعب ودباباته
  socket.on('player_movement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].z = movementData.z;
      // إرسال التحديث لبقية اللاعبين
      socket.broadcast.emit('player_moved', players[socket.id]);
    }
  });

  // استقبال إنشاء وحدة جديدة (دبابة / مبنى)
  socket.on('spawn_unit', (unitData) => {
    socket.broadcast.emit('unit_spawned', {
      playerId: socket.id,
      ...unitData
    });
  });

  // عند انقطاع الاتصال
  socket.on('disconnect', () => {
    console.log(`لاعب غادر اللعبة: ${socket.id}`);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
