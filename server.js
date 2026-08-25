const io = require('socket.io')(3000, {
  cors: { origin: "*" }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('لاعب متصل:', socket.id);

  // إرسال الغرف المتاحة حالياً عند الاتصال
  socket.emit('room-list', Object.keys(rooms));

  socket.on('create-room', (roomName) => {
    if (!rooms[roomName]) {
      rooms[roomName] = { players: [socket.id] };
      socket.join(roomName);
      socket.room = roomName;
      console.log(`تم إنشاء الغرفة: ${roomName}`);
      
      io.emit('room-list', Object.keys(rooms));
      socket.emit('room-joined', roomName);
    } else {
      socket.emit('error-msg', 'اسم الغرفة موجود مسبقاً!');
    }
  });

  socket.on('join-room', (roomName) => {
    if (rooms[roomName] && rooms[roomName].players.length < 2) {
      rooms[roomName].players.push(socket.id);
      socket.join(roomName);
      socket.room = roomName;
      console.log(`انضم لاعب إلى الغرفة: ${roomName}`);
      
      socket.emit('room-joined', roomName);
      io.to(roomName).emit('start-battle');
    } else {
      socket.emit('error-msg', 'الغرفة غير موجودة أو ممتلئة بالكامل!');
    }
  });

  socket.on('move-command', (data) => {
    if (socket.room) {
      socket.to(socket.room).emit('player-sync', data);
    }
  });

  socket.on('buy-tank', (data) => {
    if (socket.room) {
      socket.to(socket.room).emit('player-buy', data);
    }
  });

  socket.on('disconnect', () => {
    if (socket.room && rooms[socket.room]) {
      io.to(socket.room).emit('opponent-disconnected');
      delete rooms[socket.room];
      io.emit('room-list', Object.keys(rooms));
    }
    console.log('انقطع اتصال اللاعب:', socket.id);
  });
});
