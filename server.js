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

// تخزين الغرف المتاحة
const rooms = {};

io.on('connection', (socket) => {
  console.log(`لاعب متصل جديد: ${socket.id}`);

  // إرسال قائمة الغرف فوراً عند الاتصال
  socket.emit('update_rooms_list', getRoomsList());

  // إنشاء غرفة جديدة
  socket.on('create_room', (roomName) => {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 6);
    rooms[roomId] = {
      id: roomId,
      name: roomName || `غرفة ${socket.id.substr(0, 4)}`,
      host: socket.id,
      players: [{ id: socket.id, name: 'المنظم (المضيف)', ready: true }],
      status: 'waiting'
    };

    socket.join(roomId);
    socket.roomId = roomId;
    
    io.emit('update_rooms_list', getRoomsList());
    socket.emit('room_created_success', rooms[roomId]);
    console.log(`أنشئت غرفة جديدة: ${rooms[roomId].name}`);
  });

  // طلب الانضمام لغرفة
  socket.on('join_room_request', (roomId) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting' && room.players.length < 2) {
      io.to(room.host).emit('join_request', {
        requesterId: socket.id,
        requesterName: `صديق (${socket.id.substr(0, 4)})`
      });
      socket.emit('request_sent_waiting');
    } else {
      socket.emit('error_msg', 'الغرفة ممتلئة أو غير متاحة.');
    }
  });

  // رد منظم الغرفة على طلب الانضمام
  socket.on('respond_to_request', ({ requesterId, accepted }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (room && room.host === socket.id) {
      const requesterSocket = io.sockets.sockets.get(requesterId);
      if (accepted && requesterSocket) {
        room.players.push({ id: requesterId, name: 'الصديق', ready: false });
        requesterSocket.join(roomId);
        requesterSocket.roomId = roomId;

        // إعلام الجميع داخل الغرفة بانضمام الصديق والانتقال لشاشة الانتظار
        io.to(roomId).emit('player_joined_room', room);
        io.emit('update_rooms_list', getRoomsList());
      } else if (requesterSocket) {
        requesterSocket.emit('join_rejected');
      }
    }
  });

  // تغيير حالة الاستعداد للصديق
  socket.on('toggle_ready', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player && player.id !== room.host) {
        player.ready = !player.ready;
        io.to(roomId).emit('room_players_update', room);
      }
    }
  });

  // بدء المعركة من قبل منظم الغرفة
  socket.on('start_room_game', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (room && room.host === socket.id) {
      room.status = 'playing';
      io.to(roomId).emit('game_started');
      io.emit('update_rooms_list', getRoomsList());
    }
  });

  // خروج أو انقطاع الاتصال
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.host === socket.id) {
        io.to(roomId).emit('room_closed');
        delete rooms[roomId];
      } else {
        room.players = room.players.filter(p => p.id !== socket.id);
        io.to(roomId).emit('room_players_update', room);
      }
    }
    io.emit('update_rooms_list', getRoomsList());
  });
});

function getRoomsList() {
  const list = [];
  for (const id in rooms) {
    if (rooms[id].status === 'waiting') {
      list.push({
        id: rooms[id].id,
        name: rooms[id].name,
        playersCount: rooms[id].players.length
      });
    }
  }
  return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل على المنفذ: ${PORT}`);
});
