const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

// Store rooms
const rooms = {};

io.on('connection', (socket) => {
    console.log('======================================');
    console.log('User connected:', socket.id);

    // Join room
    socket.on('join-room', ({ roomId, username }) => {

        console.log('========== JOIN ROOM ==========');
        console.log('Room ID:', roomId);
        console.log('Username:', username);
        console.log('Socket ID:', socket.id);

        socket.join(roomId);

        console.log("Socket joined room:", roomId);
        console.log("Members in room:", io.sockets.adapter.rooms.get(roomId));

        socket.roomId = roomId;
        socket.username = username;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: []
            };
        }

        rooms[roomId].users.push({
            id: socket.id,
            username
        });

        console.log("Users array:", rooms[roomId].users);

        io.to(roomId).emit('user-joined', {
            username,
            users: rooms[roomId].users
        });

        console.log(`${username} joined room ${roomId}`);
        console.log('======================================');
    });

    // Sync play
    socket.on('play', ({ time }) => {
        console.log(`${socket.username} PLAY`);
        socket.to(socket.roomId).emit('play', {
            time,
            username: socket.username
        });
    });

    // Sync pause
    socket.on('pause', ({ time }) => {
        console.log(`${socket.username} PAUSE`);
        socket.to(socket.roomId).emit('pause', {
            time,
            username: socket.username
        });
    });

    // Sync seek
    socket.on('seek', ({ time }) => {
        console.log(`${socket.username} SEEK ${time}`);
        socket.to(socket.roomId).emit('seek', {
            time,
            username: socket.username
        });
    });

    // Chat
    socket.on('chat-message', ({ message }) => {

        console.log(`${socket.username}: ${message}`);

        io.to(socket.roomId).emit('chat-message', {
            username: socket.username,
            message,
            time: new Date().toLocaleTimeString()
        });
    });

    // Disconnect
    socket.on('disconnect', () => {

        console.log("Disconnected:", socket.id);

        if (socket.roomId && rooms[socket.roomId]) {

            rooms[socket.roomId].users =
                rooms[socket.roomId].users.filter(
                    u => u.id !== socket.id
                );

            io.to(socket.roomId).emit('user-left', {
                username: socket.username,
                users: rooms[socket.roomId].users
            });

            console.log("Remaining users:", rooms[socket.roomId].users);

            // Delete empty room
            if (rooms[socket.roomId].users.length === 0) {
                delete rooms[socket.roomId];
                console.log("Room deleted:", socket.roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
