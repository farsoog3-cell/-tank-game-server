const io = require('socket.io')(3000, {
  cors: { origin: "*" }
});

io.on('connection', (socket) => {
  console.log('لاعب متصل:', socket.id);

  socket.on('move-command', (data) => {
    socket.broadcast.emit('player-sync', data);
  });

  socket.on('buy-tank', (data) => {
    socket.broadcast.emit('player-buy', data);
  });

  socket.on('disconnect', () => {
    console.log('انقطع اتصال اللاعب:', socket.id);
  });
});
