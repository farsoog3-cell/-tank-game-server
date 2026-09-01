const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let rooms = {};

io.on('connection', (socket) => {
    socket.emit("set_my_id", { id: socket.id });

    socket.on("get_rooms", () => {
        let roomsList = [];
        for (let roomId in rooms) {
            roomsList.push({
                id: roomId,
                name: rooms[roomId].name,
                bet: rooms[roomId].bet,
                hostFlag: rooms[roomId].hostFlag,
                guestJoined: rooms[roomId].guestJoined
            });
        }
        socket.emit("rooms_list", roomsList);
    });

    socket.on("create_room", (data) => {
        let roomId = 'room_' + Math.random().toString(36).substring(2, 7);
        rooms[roomId] = {
            id: roomId,
            name: data.name,
            bet: data.bet,
            hostFlag: data.hostFlag || 'green',
            guestFlag: data.hostFlag === 'green' ? 'red' : 'green',
            hostId: socket.id,
            guestId: null,
            hostReady: false,
            guestReady: false,
            guestJoined: false
        };
        socket.join(roomId);
        socket.emit("room_joined", { id: roomId, isHost: true, ...rooms[roomId] });
        io.emit("rooms_list", getPublicRooms());
    });

    socket.on("join_room", (data) => {
        let room = rooms[data.roomId];
        if (room && !room.guestJoined) {
            room.guestId = socket.id;
            room.guestJoined = true;
            socket.join(data.roomId);
            
            socket.emit("room_joined", { id: data.roomId, isHost: false, ...room });
            io.to(room.hostId).emit("room_update", { guestJoined: true });
            io.emit("rooms_list", getPublicRooms());
        }
    });

    socket.on("set_ready", (data) => {
        let room = rooms[data.roomId];
        if (room) {
            if (socket.id === room.hostId) room.hostReady = data.ready;
            else if (socket.id === room.guestId) room.guestReady = data.ready;

            io.to(data.roomId).emit("room_ready_update", {
                hostReady: room.hostReady,
                guestReady: room.guestReady
            });
        }
    });

    socket.on("start_game", (data) => {
        let room = rooms[data.roomId];
        if (room && socket.id === room.hostId && room.hostReady && room.guestReady) {
            io.to(data.roomId).emit("start_game");
        }
    });

    socket.on("spawn_tank", (data) => {
        socket.to(data.roomId).emit("remote_tank_spawn", { x: data.x, z: data.z, type: data.type });
    });

    socket.on("tank_move", (data) => {
        socket.to(data.roomId).emit("remote_tank_move", data);
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
        handleUserLeave(socket);
    });

    socket.on("disconnect", () => {
        handleUserLeave(socket);
    });
});

function handleUserLeave(socket) {
    for (let roomId in rooms) {
        let room = rooms[roomId];
        if (room.hostId === socket.id || room.guestId === socket.id) {
            socket.to(roomId).emit("room_update", { guestJoined: false });
            delete rooms[roomId];
            io.emit("rooms_list", getPublicRooms());
            break;
        }
    }
}

function getPublicRooms() {
    let list = [];
    for (let id in rooms) {
        if (!rooms[id].guestJoined) {
            list.push({ id, name: rooms[id].name, bet: rooms[id].bet, hostFlag: rooms[id].hostFlag });
        }
    }
    return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
