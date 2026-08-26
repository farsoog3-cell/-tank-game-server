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

const rooms = {};

io.on('connection', (socket) => {
  console.log(`لاعب متصل: ${socket.id}`);
  socket.emit('update_rooms_list', getRoomsList());

  // إنشاء غرفة مباشرة واختيار العلم
  socket.on('create_room', ({ roomName, flag }) => {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 6);
    rooms[roomId] = {
      id: roomId,
      name: roomName || 'غرفة معركة',
      host: socket.id,
      players: [
        { id: socket.id, name: 'المنظم', flag: flag || 'green', ready: true }
      ],
      status: 'waiting'
    };

    socket.join(roomId);
    socket.roomId = roomId;
    io.emit('update_rooms_list', getRoomsList());
    socket.emit('room_joined_success', { room: rooms[roomId], isHost: true });
  });

  // انضمام الصديق مباشرة بدون طلب موافقة
  socket.on('join_room', ({ roomId, flag }) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting' && room.players.length < 2) {
      // التأكد من اختيار علم مخالف أو المتاح
      const hostFlag = room.players[0].flag;
      const friendFlag = flag || (hostFlag === 'green' ? 'red' : 'green');

      room.players.push({
        id: socket.id,
        name: 'الصديق',
        flag: friendFlag,
        ready: false
      });

      socket.join(roomId);
      socket.roomId = roomId;

      io.to(roomId).emit('room_players_update', room);
      io.emit('update_rooms_list', getRoomsList());
      socket.emit('room_joined_success', { room, isHost: false });
    } else {
      socket.emit('error_msg', 'الغرفة ممتلئة أو بدأت بالفعل.');
    }
  });

  // تبديل حالة الاستعداد للصديق
  socket.on('toggle_ready', () => {
    const room = rooms[socket.roomId];
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player && player.id !== room.host) {
        player.ready = !player.ready;
        io.to(socket.roomId).emit('room_players_update', room);
      }
    }
  });

  // بدء المعركة من قبل منظم الغرفة
  socket.on('start_game', () => {
    const room = rooms[socket.roomId];
    if (room && room.host === socket.id) {
      room.status = 'playing';
      io.to(socket.roomId).emit('game_started', room);
      io.emit('update_rooms_list', getRoomsList());
    }
  });

  // مزامنة حركة وتحركات الدبابات فورياً بين اللاعبين
  socket.on('tank_sync_action', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('tank_sync_action', data);
    }
  });

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
  console.log(`Server running on port ${PORT}`);
});
