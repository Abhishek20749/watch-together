const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    // Reconnection support
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

app.use(express.static(__dirname));

// Store rooms with playback state
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join room
    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                host: socket.id,
                videoUrl: null,
                playbackState: { time: 0, playing: false, speed: 1 }
            };
        }
        // Prevent duplicate entries on reconnection
        rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
        rooms[roomId].users.push({ id: socket.id, username });

        io.to(roomId).emit('user-joined', {
            username,
            users: rooms[roomId].users
        });

        // Send current room state to the new joiner
        socket.emit('room-state', {
            host: rooms[roomId].host,
            videoUrl: rooms[roomId].videoUrl,
            playbackState: rooms[roomId].playbackState
        });

        console.log(`${username} joined room ${roomId}`);
    });

    // Set video URL (so everyone loads the same source)
    socket.on('set-video-url', ({ url }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        rooms[socket.roomId].videoUrl = url;
        socket.to(socket.roomId).emit('video-url-changed', { url, username: socket.username });
    });

    // Sync play
    socket.on('play', ({ time }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        rooms[socket.roomId].playbackState = { ...rooms[socket.roomId].playbackState, time, playing: true };
        socket.to(socket.roomId).emit('play', { time, username: socket.username });
    });

    // Sync pause
    socket.on('pause', ({ time }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        rooms[socket.roomId].playbackState = { ...rooms[socket.roomId].playbackState, time, playing: false };
        socket.to(socket.roomId).emit('pause', { time, username: socket.username });
    });

    // Sync seek
    socket.on('seek', ({ time }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        rooms[socket.roomId].playbackState.time = time;
        socket.to(socket.roomId).emit('seek', { time, username: socket.username });
    });

    // Sync playback speed
    socket.on('speed-change', ({ speed }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        rooms[socket.roomId].playbackState.speed = speed;
        socket.to(socket.roomId).emit('speed-change', { speed, username: socket.username });
    });

    // Emoji reaction
    socket.on('emoji-reaction', ({ emoji }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        socket.to(socket.roomId).emit('emoji-reaction', { emoji, username: socket.username });
    });

    // Typing indicator
    socket.on('typing', ({ isTyping }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        socket.to(socket.roomId).emit('typing', { username: socket.username, isTyping });
    });

    // Chat message
    socket.on('chat-message', ({ message }) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
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

            // If host left, assign new host
            if (rooms[socket.roomId].host === socket.id && rooms[socket.roomId].users.length > 0) {
                rooms[socket.roomId].host = rooms[socket.roomId].users[0].id;
                io.to(socket.roomId).emit('host-changed', { hostId: rooms[socket.roomId].host });
            }

            io.to(socket.roomId).emit('user-left', {
                username: socket.username,
                users: rooms[socket.roomId].users
            });

            // Broadcast typing stopped on disconnect
            io.to(socket.roomId).emit('typing', { username: socket.username, isTyping: false });

            // Clean up empty rooms
            if (rooms[socket.roomId].users.length === 0) {
                delete rooms[socket.roomId];
                console.log(`Room ${socket.roomId} deleted (empty)`);
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
