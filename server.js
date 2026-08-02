const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// Store rooms
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join room
    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        if (!rooms[roomId]) rooms[roomId] = { users: [] };
        rooms[roomId].users.push({ id: socket.id, username });

        io.to(roomId).emit('user-joined', {
            username,
            users: rooms[roomId].users
        });

        console.log(`${username} joined room ${roomId}`);
    });

    // Sync play
    socket.on('play', ({ time }) => {
        socket.to(socket.roomId).emit('play', { time, username: socket.username });
    });

    // Sync pause
    socket.on('pause', ({ time }) => {
        socket.to(socket.roomId).emit('pause', { time, username: socket.username });
    });

    // Sync seek
    socket.on('seek', ({ time }) => {
        socket.to(socket.roomId).emit('seek', { time, username: socket.username });
    });

    // Chat message
    socket.on('chat-message', ({ message }) => {
        io.to(socket.roomId).emit('chat-message', {
            username: socket.username,
            message,
            time: new Date().toLocaleTimeString()
        });
    });

    // Disconnect
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].users = rooms[socket.roomId].users.filter(u => u.id !== socket.id);
            io.to(socket.roomId).emit('user-left', {
                username: socket.username,
                users: rooms[socket.roomId].users
            });
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
