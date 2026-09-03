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

const rooms = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.emit('rooms-list', rooms);

  socket.on('create-room', (data) => {
    const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
    rooms[roomId] = {
      id: roomId,
      name: data.roomName,
      host: data.hostName,
      flag: data.flag,
      players: [{ id: socket.id, name: data.hostName, flag: data.flag }]
    };

    socket.join(roomId);
    socket.emit('room-created', rooms[roomId]);
    io.emit('rooms-list', rooms);
  });

  socket.on('join-room', (data) => {
    const room = rooms[data.roomId];
    if (room) {
      room.players.push({ id: socket.id, name: data.playerName, flag: data.flag });
      socket.join(data.roomId);
      socket.emit('room-joined', room);
      io.emit('rooms-list', rooms);
      io.to(data.roomId).emit('player-update', room.players);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('player-update', room.players);
      }
    }
    io.emit('rooms-list', rooms);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
