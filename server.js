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

// إرسال صفحة ويب بسيطة عند فتح رابط السيرفر الرئيسي
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>سيرفر اللعبة</title>
        <style>
            body { font-family: Tahoma, sans-serif; text-align: center; margin-top: 50px; background: #111; color: #fff; }
            h1 { color: #4CAF50; }
        </style>
    </head>
    <body>
        <h1>مرحباً بك في سيرفر اللعبة يعمل بنجاح! 🚀</h1>
        <p>الاتصال بـ Socket.io جاهز لاستقبال اللاعبين.</p>
    </body>
    </html>
  `);
});

// إعدادات اتصال Socket.io
io.on('connection', (socket) => {
  console.log(`لاعب متصل الان: ${socket.id}`);

  socket.on('player-movement', (data) => {
    socket.broadcast.emit('update-player', { id: socket.id, ...data });
  });

  socket.on('disconnect', () => {
    console.log(`انقطع اتصال اللاعب: ${socket.id}`);
    io.emit('remove-player', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل بنجاح على البورت ${PORT}`);
});
