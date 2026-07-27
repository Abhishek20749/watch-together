const socket = io();

// Elements
const joinScreen = document.getElementById('join-screen');
const watchScreen = document.getElementById('watch-screen');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const video = document.getElementById('video-player');
const noVideo = document.getElementById('no-video');
const fileInput = document.getElementById('file-input');
const fileInputBtn = document.getElementById('file-input-btn');
const roomCode = document.getElementById('room-code');
const userCount = document.getElementById('user-count');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

let isSyncing = false; // Prevent sync loops
let username = '';
let currentRoom = '';

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Join room
joinBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (!username) { alert('Please enter your name'); return; }

    currentRoom = roomInput.value.trim() || generateRoomCode();
    
    socket.emit('join-room', { roomId: currentRoom, username });

    joinScreen.classList.add('hidden');
    watchScreen.classList.remove('hidden');
    roomCode.textContent = `Room: ${currentRoom}`;
});

// File selection
fileInput.addEventListener('change', handleFile);
fileInputBtn.addEventListener('change', handleFile);

function handleFile(e) {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        noVideo.classList.add('hidden');
        video.style.display = 'block';
        addSystemMessage(`You loaded: ${file.name}`);
    }
}

// Video sync events
video.addEventListener('play', () => {
    if (!isSyncing) {
        socket.emit('play', { time: video.currentTime });
    }
});

video.addEventListener('pause', () => {
    if (!isSyncing) {
        socket.emit('pause', { time: video.currentTime });
    }
});

video.addEventListener('seeked', () => {
    if (!isSyncing) {
        socket.emit('seek', { time: video.currentTime });
    }
});

// Receive sync from others
socket.on('play', ({ time, username: user }) => {
    isSyncing = true;
    video.currentTime = time;
    video.play();
    addSystemMessage(`${user} pressed play`);
    setTimeout(() => isSyncing = false, 500);
});

socket.on('pause', ({ time, username: user }) => {
    isSyncing = true;
    video.currentTime = time;
    video.pause();
    addSystemMessage(`${user} paused`);
    setTimeout(() => isSyncing = false, 500);
});

socket.on('seek', ({ time, username: user }) => {
    isSyncing = true;
    video.currentTime = time;
    addSystemMessage(`${user} jumped to ${formatTime(time)}`);
    setTimeout(() => isSyncing = false, 500);
});

// Chat
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('chat-message', { message: msg });
        chatInput.value = '';
    }
}

socket.on('chat-message', ({ username: user, message, time }) => {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<div class="msg-user">${user} · ${time}</div><div class="msg-text">${escapeHtml(message)}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// User events
socket.on('user-joined', ({ username: user, users }) => {
    userCount.textContent = `${users.length} online`;
    addSystemMessage(`${user} joined the room`);
});

socket.on('user-left', ({ username: user, users }) => {
    userCount.textContent = `${users.length} online`;
    addSystemMessage(`${user} left the room`);
});

// Helpers
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Mobile chat popup notification
let unreadCount = 0;
const chatToggle = document.getElementById('chat-toggle');
const chatBadge = document.getElementById('chat-badge');

// Show popup when message received (on mobile)
function showChatPopup(user, message) {
    if (window.innerWidth > 768) return; // only on mobile
    
    // Remove existing popup
    const existing = document.querySelector('.chat-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'chat-popup';
    popup.innerHTML = `<div class="popup-user">${user}</div><div class="popup-text">${escapeHtml(message)}</div>`;
    document.body.appendChild(popup);

    // Auto-hide after 4 seconds
    setTimeout(() => popup.remove(), 4000);

    // Tap popup to scroll to chat
    popup.addEventListener('click', () => {
        popup.remove();
        chatMessages.scrollIntoView({ behavior: 'smooth' });
        chatInput.focus();
    });

    // Update badge
    unreadCount++;
    chatBadge.textContent = unreadCount;
    chatBadge.classList.remove('hidden');
    chatToggle.classList.remove('hidden');
}

// Override chat-message listener to show popup
socket.on('chat-message', ({ username: user, message, time }) => {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<div class="msg-user">${user} · ${time}</div><div class="msg-text">${escapeHtml(message)}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Show popup if message is from someone else
    if (user !== username) {
        showChatPopup(user, message);
    }
});

// Chat toggle button — scroll to chat
chatToggle.addEventListener('click', () => {
    chatMessages.scrollIntoView({ behavior: 'smooth' });
    chatInput.focus();
    unreadCount = 0;
    chatBadge.classList.add('hidden');
});

// Reset badge when chat is visible
const chatObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        unreadCount = 0;
        chatBadge.classList.add('hidden');
    }
});
chatObserver.observe(chatMessages);

