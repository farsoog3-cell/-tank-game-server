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

let rooms = [];

io.on('connection', (socket) => {
    console.log(`مستخدم متصل: ${socket.id}`);
    
    socket.emit("set_my_id", { id: socket.id });

    socket.on("get_rooms", () => {
        socket.emit("rooms_list", rooms);
    });

    socket.on("create_room", (data) => {
        const roomId = 'room_' + Math.random().toString(36).substr(2, 6);
        const newRoom = {
            id: roomId,
            name: data.name,
            hostId: socket.id,
            guestId: null,
            hostFlag: data.hostFlag,
            guestFlag: data.hostFlag === 'green' ? 'red' : 'green',
            bet: data.bet,
            hostReady: false,
            guestReady: false,
            guestJoined: false
        };

        rooms.push(newRoom);
        socket.join(roomId);
        
        socket.emit("room_joined", {
            id: roomId,
            name: newRoom.name,
            isHost: true,
            hostFlag: newRoom.hostFlag,
            bet: newRoom.bet
        });

        io.emit("rooms_list", rooms);
    });

    socket.on("join_room", (data) => {
        const room = rooms.find(r => r.id === data.roomId);
        if (room && !room.guestId) {
            room.guestId = socket.id;
            room.guestJoined = true;
            socket.join(room.id);

            socket.emit("room_joined", {
                id: room.id,
                name: room.name,
                isHost: false,
                hostFlag: room.guestFlag,
                bet: room.bet
            });

            io.to(room.hostId).emit("room_update", { guestJoined: true });
            io.emit("rooms_list", rooms);
        }
    });

    socket.on("set_ready", (data) => {
        const room = rooms.find(r => r.id === data.roomId);
        if (room) {
            if (socket.id === room.hostId) room.hostReady = data.ready;
            else if (socket.id === room.guestId) room.guestReady = data.ready;

            io.to(room.id).emit("room_ready_update", {
                hostReady: room.hostReady,
                guestReady: room.guestReady
            });
        }
    });

    socket.on("start_game", (data) => {
        const room = rooms.find(r => r.id === data.roomId);
        if (room && socket.id === room.hostId && room.hostReady && room.guestReady) {
            io.to(room.id).emit("start_game");
            rooms = rooms.filter(r => r.id !== data.roomId);
            io.emit("rooms_list", rooms);
        }
    });

    socket.on("tank_move", (data) => {
        socket.to(data.roomId).emit("remote_tank_move", {
            index: data.index,
            x: -data.x,
            y: data.y,
            z: -data.z,
            rotY: data.rotY
        });
    });

    socket.on("spawn_tank", (data) => {
        socket.to(data.roomId).emit("remote_tank_spawn", {
            x: -data.x,
            z: -data.z,
            type: data.type
        });
    });

    socket.on("shoot", (data) => {
        socket.to(data.roomId).emit("remote_shoot", data);
    });

    socket.on("tank_damaged", (data) => {
        socket.to(data.roomId).emit("remote_tank_damaged", data);
    });

    socket.on("capture_rig", (data) => {
        socket.to(data.roomId).emit("rig_captured", data);
    });

    socket.on("leave_room", (data) => {
        handleDisconnect(socket);
    });

    socket.on("disconnect", () => {
        handleDisconnect(socket);
        console.log(`مستخدم غادر: ${socket.id}`);
    });
});

function handleDisconnect(socket) {
    let roomIndex = rooms.findIndex(r => r.hostId === socket.id || r.guestId === socket.id);
    if (roomIndex !== -1) {
        let room = rooms[roomIndex];
        if (socket.id === room.hostId) {
            io.to(room.id).emit("room_update", { guestJoined: false });
            rooms.splice(roomIndex, 1);
        } else {
            room.guestId = null;
            room.guestJoined = false;
            room.guestReady = false;
            io.to(room.hostId).emit("room_update", { guestJoined: false });
        }
        io.emit("rooms_list", rooms);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على البورت: ${PORT}`);
});
