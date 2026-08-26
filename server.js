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
// { roomId: { name: "غرفة أحمد", host: socketId, players: [socketId], requests: [{id, name}], status: 'waiting' } }
const rooms = {};

io.on('connection', (socket) => {
  console.log(`لاعب متصل جديد: ${socket.id}`);

  // إرسال قائمة الغرف المتاحة للاعب عند الاتصال
  socket.emit('update_rooms_list', getRoomsList());

  // 1. إنشاء غرفة جديدة
  socket.on('create_room', (roomName) => {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 6);
    rooms[roomId] = {
      id: roomId,
      name: roomName || `غرفة ${socket.id.substr(0, 4)}`,
      host: socket.id,
      players: [socket.id],
      requests: [],
      status: 'waiting'
    };

    socket.join(roomId);
    socket.roomId = roomId;
    
    // تحديث القائمة للجميع
    io.emit('update_rooms_list', getRoomsList());
    socket.emit('room_created_success', rooms[roomId]);
    console.log(`أنشئت غرفة جديدة: ${rooms[roomId].name} بواسطة ${socket.id}`);
  });

  // 2. طلب الانضمام إلى غرفة
  socket.on('join_room_request', (roomId) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting') {
      // إرسال طلب لصاحب الغرفة (Host)
      io.to(room.host).emit('join_request', {
        requesterId: socket.id,
        requesterName: `لاعب (${socket.id.substr(0, 4)})`
      });
      socket.emit('request_sent_waiting');
    } else {
      socket.emit('error_msg', 'الغرفة غير متاحة أو بدأت المعركة.');
    }
  });

  // 3. قرار صاحب الغرفة (قبول أو رفض)
  socket.on('respond_to_request', ({ requesterId, accepted }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (room && room.host === socket.id) {
      if (accepted) {
        room.players.push(requesterId);
        const requesterSocket = io.sockets.sockets.get(requesterId);
        if (requesterSocket) {
          requesterSocket.join(roomId);
          requesterSocket.roomId = roomId;
          requesterSocket.emit('join_accepted', room);
        }
        // إعلام باقي الغرفة
        io.to(roomId).emit('player_joined_room', room);
        io.emit('update_rooms_list', getRoomsList());
      } else {
        const requesterSocket = io.sockets.sockets.get(requesterId);
        if (requesterSocket) {
          requesterSocket.emit('join_rejected');
        }
      }
    }
  });

  // 4. بدء اللعبة من قبل المنظم
  socket.on('start_room_game', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (room && room.host === socket.id) {
      room.status = 'playing';
      io.to(roomId).emit('game_started');
      io.emit('update_rooms_list', getRoomsList());
    }
  });

  // عند انقطاع الاتصال
  socket.on('disconnect', () => {
    console.log(`لاعب غادر: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.host === socket.id) {
        // إذا غادر صاحب الغرفة، يتم إغلاقها
        io.to(roomId).emit('room_closed');
        delete rooms[roomId];
      } else {
        room.players = room.players.filter(id => id !== socket.id);
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
  console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
