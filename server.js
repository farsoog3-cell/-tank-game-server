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

let roomsData = {};

app.get('/', (req, res) => {
    res.send('Tank Game Server is Running Live!');
});

function getRoomsSummary() {
    let summary = {};
    for (let rName in roomsData) {
        summary[rName] = roomsData[rName].length;
    }
    return summary;
}

io.on('connection', (socket) => {
    console.log(`لاعب متصل جديد: ${socket.id}`);

    socket.emit('rooms_list', getRoomsSummary());

    socket.on('join_room', (data) => {
        socket.join(data.room);
        socket.roomName = data.room;
        socket.playerName = data.name;
        socket.playerTeam = data.team;

        if (!roomsData[data.room]) {
            roomsData[data.room] = [];
        }

        roomsData[data.room].push({
            id: socket.id,
            name: data.name,
            team: data.team
        });

        io.to(data.room).emit('update_room_players', roomsData[data.room]);
        io.emit('rooms_list', getRoomsSummary());
        
        console.log(`اللاعب ${data.name} انضم إلى الغرفة: ${data.room}`);
    });

    socket.on('player_move', (data) => {
        if (socket.roomName) {
            socket.to(socket.roomName).emit('player_moved', {
                id: socket.id,
                ...data
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`لاعب غادر: ${socket.id}`);
        
        if (socket.roomName && roomsData[socket.roomName]) {
            roomsData[socket.roomName] = roomsData[socket.roomName].filter(p => p.id !== socket.id);

            if (roomsData[socket.roomName].length === 0) {
                delete roomsData[socket.roomName];
                console.log(`تم حذف الغرفة الفارغة: ${socket.roomName}`);
            } else {
                io.to(socket.roomName).emit('update_room_players', roomsData[socket.roomName]);
            }

            io.emit('rooms_list', getRoomsSummary());
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
