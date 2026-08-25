const io = require('socket.io')(server, { cors: { origin: "*" } });
let roomsData = {}; // تخزين الغرف وعدد اللاعبين

io.on('connection', (socket) => {
    // إرسال قائمة الغرف الحية فور دخول اللاعب
    socket.emit('rooms_list', getRoomsSummary());

    socket.on('join_room', (data) => {
        socket.join(data.room);
        socket.roomName = data.room;
        
        if (!roomsData[data.room]) roomsData[data.room] = [];
        roomsData[data.room].push({ id: socket.id, name: data.name, team: data.team });

        // بث قائمة اللاعبين داخل هذه الغرفة
        io.to(data.room).emit('update_room_players', roomsData[data.room]);
        // تحديث قائمة الغرف للجميع في القائمة الرئيسية
        io.emit('rooms_list', getRoomsSummary());
    });

    socket.on('player_move', (data) => {
        if (socket.roomName) {
            socket.to(socket.roomName).emit('player_moved', { id: socket.id, ...data });
        }
    });

    socket.disconnecting(() => {
        if (socket.roomName && roomsData[socket.roomName]) {
            roomsData[socket.roomName] = roomsData[socket.roomName].filter(p => p.id !== socket.id);
            if (roomsData[socket.roomName].length === 0) {
                delete roomsData[socket.roomName];
            } else {
                io.to(socket.roomName).emit('update_room_players', roomsData[socket.roomName]);
            }
            io.emit('rooms_list', getRoomsSummary());
        }
    });
});

function getRoomsSummary() {
    let summary = {};
    for (let r in roomsData) {
        summary[r] = roomsData[r].length;
    }
    return summary;
}
