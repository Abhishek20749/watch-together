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
const roomNameEl = document.getElementById('room-name');
const userCountEl = document.getElementById('user-count');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const copyRoomBtn = document.getElementById('copy-room-btn');

let isSyncing = false;
let username = '';
let currentRoom = '';

// Generate room code
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
    roomNameEl.textContent = currentRoom;
});

// Enter key on inputs
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') roomInput.focus(); });
roomInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinBtn.click(); });

// Copy room code
copyRoomBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        copyRoomBtn.textContent = '✓';
        setTimeout(() => copyRoomBtn.textContent = '📋', 2000);
    });
});

// File selection
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        video.src = URL.createObjectURL(file);
        noVideo.classList.add('hidden');
        addSystemMessage(`You loaded: ${file.name}`);
    }
});

// Video sync
video.addEventListener('play', () => { if (!isSyncing) socket.emit('play', { time: video.currentTime }); });
video.addEventListener('pause', () => { if (!isSyncing) socket.emit('pause', { time: video.currentTime }); });
video.addEventListener('seeked', () => { if (!isSyncing) socket.emit('seek', { time: video.currentTime }); });

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
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('chat-message', { message: msg });
        chatInput.value = '';
    }
}

socket.on('chat-message', ({ username: user, message }) => {
    const isMe = user === username;
    const div = document.createElement('div');
    div.className = `chat-bubble ${isMe ? 'mine' : 'other'}`;
    div.innerHTML = `<div class="bubble-name">${user}</div><div class="bubble-text">${escapeHtml(message)}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Show toast notification if message is from someone else
    if (!isMe) {
        showToast(user, message);
    }
});

// Toast notification
function showToast(user, message) {
    // Remove existing toast
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<div class="toast-name">${user}</div><div class="toast-text">${escapeHtml(message)}</div>`;
    document.body.appendChild(toast);

    // Tap to dismiss and scroll to chat
    toast.addEventListener('click', () => {
        toast.remove();
        chatMessages.scrollIntoView({ behavior: 'smooth' });
        chatInput.focus();
    });

    // Auto-hide after 5 seconds
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

// User events
socket.on('user-joined', ({ username: user, users }) => {
    userCountEl.textContent = `👥 ${users.length}`;
    addSystemMessage(`${user} joined`);
});

socket.on('user-left', ({ username: user, users }) => {
    userCountEl.textContent = `👥 ${users.length}`;
    addSystemMessage(`${user} left`);
});

// Fake fullscreen toggle (allows toast to show over video)
document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const videoArea = document.getElementById('video-area');
    const btn = document.getElementById('fullscreen-btn');
    
    if (videoArea.classList.contains('fake-fullscreen')) {
        videoArea.classList.remove('fake-fullscreen');
        btn.textContent = '⛶';
    } else {
        videoArea.classList.add('fake-fullscreen');
        btn.textContent = '✕';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const videoArea = document.getElementById('video-area');
        if (videoArea && videoArea.classList.contains('fake-fullscreen')) {
            videoArea.classList.remove('fake-fullscreen');
            document.getElementById('fullscreen-btn').textContent = '⛶';
        }
    }
});

// Helpers
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-bubble system';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(s) {
    return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
