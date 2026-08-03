// --- Socket with reconnection ---
const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling']
});

// Elements
const joinScreen = document.getElementById('join-screen');
const watchScreen = document.getElementById('watch-screen');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const video = document.getElementById('video-player');
const noVideo = document.getElementById('no-video');
const fileInput = document.getElementById('file-input');
const urlInput = document.getElementById('url-input');
const loadUrlBtn = document.getElementById('load-url-btn');
const syncOverlay = document.getElementById('sync-overlay');
const roomNameEl = document.getElementById('room-name');
const userCountEl = document.getElementById('user-count');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const copyRoomBtn = document.getElementById('copy-room-btn');
const typingIndicator = document.getElementById('typing-indicator');
const emojiContainer = document.getElementById('emoji-container');

let isSyncing = false;
let username = '';
let currentRoom = '';
let currentUsers = [];
let lastSeekTime = 0;
let typingTimeout = null;
let isTyping = false;
const SEEK_THRESHOLD = 1;

// --- Auto-join from URL ---
function getRoomFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || '';
}

// Pre-fill room from URL
window.addEventListener('DOMContentLoaded', () => {
    const roomFromUrl = getRoomFromUrl();
    if (roomFromUrl) {
        roomInput.value = roomFromUrl;
    }
});

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

    // Update URL with room code
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    window.history.replaceState({}, '', newUrl);
});

// Enter key on inputs
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') roomInput.focus(); });
roomInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinBtn.click(); });

// Copy room link
copyRoomBtn.addEventListener('click', () => {
    const roomLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(roomLink).then(() => {
        copyRoomBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => copyRoomBtn.innerHTML = '<i class="bi bi-clipboard"></i>', 2000);
    });
});

// Share room modal
const shareRoomBtn = document.getElementById('share-room-btn');
const shareLinkInput = document.getElementById('share-link-input');
const copyLinkBtn = document.getElementById('copy-link-btn');
const shareRoomCode = document.getElementById('share-room-code');
const qrCodeEl = document.getElementById('qr-code');

shareRoomBtn.addEventListener('click', () => {
    const roomLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    shareLinkInput.value = roomLink;
    shareRoomCode.textContent = currentRoom;

    // Generate QR code
    qrCodeEl.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(roomLink);
    qr.make();
    qrCodeEl.innerHTML = qr.createSvgTag({ scalable: true });
    const svg = qrCodeEl.querySelector('svg');
    if (svg) {
        svg.style.width = '160px';
        svg.style.height = '160px';
    }

    const modal = new bootstrap.Modal(document.getElementById('shareModal'));
    modal.show();
});

copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
        copyLinkBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => copyLinkBtn.innerHTML = '<i class="bi bi-clipboard"></i>', 2000);
    });
});

// --- Reconnection ---
socket.on('connect', () => {
    // Re-join room after reconnect
    if (currentRoom && username) {
        socket.emit('join-room', { roomId: currentRoom, username });
        addSystemMessage('Reconnected');
    }
});

socket.on('disconnect', () => {
    addSystemMessage('Connection lost. Reconnecting...');
});

socket.on('reconnect_failed', () => {
    addSystemMessage('Could not reconnect. Please refresh the page.');
});

// --- Video Source ---

// Load video from URL
loadUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return;
    loadVideoUrl(url);
    socket.emit('set-video-url', { url });
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadUrlBtn.click();
});

function loadVideoUrl(url) {
    video.src = url;
    noVideo.classList.add('hidden');
    addSystemMessage('Video loaded from URL');
}

// File selection (local only)
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        video.src = URL.createObjectURL(file);
        noVideo.classList.add('hidden');
        addSystemMessage(`You loaded local file: ${file.name}`);
        addSystemMessage('⚠️ Others need the same file or URL to stay in sync');
    }
});

// Receive video URL from another user
socket.on('video-url-changed', ({ url, username: user }) => {
    loadVideoUrl(url);
    addSystemMessage(`${user} set the video`);
});

// --- Late Joiner Sync ---
socket.on('room-state', ({ videoUrl, playbackState }) => {
    if (videoUrl) {
        loadVideoUrl(videoUrl);
    }
    if (playbackState) {
        isSyncing = true;
        video.currentTime = playbackState.time;
        video.playbackRate = playbackState.speed || 1;
        if (playbackState.playing) {
            video.play().catch(() => {});
        }
        setTimeout(() => isSyncing = false, 500);
    }
});

// --- Video Sync ---

video.addEventListener('play', () => {
    if (!isSyncing) socket.emit('play', { time: video.currentTime });
});

video.addEventListener('pause', () => {
    if (!isSyncing) socket.emit('pause', { time: video.currentTime });
});

video.addEventListener('seeked', () => {
    if (isSyncing) return;
    const delta = Math.abs(video.currentTime - lastSeekTime);
    if (delta < SEEK_THRESHOLD) return;
    lastSeekTime = video.currentTime;
    socket.emit('seek', { time: video.currentTime });
});

video.addEventListener('ratechange', () => {
    if (!isSyncing) {
        socket.emit('speed-change', { speed: video.playbackRate });
        addSystemMessage(`You changed speed to ${video.playbackRate}x`);
    }
});

function showSyncOverlay() {
    syncOverlay.classList.remove('hidden');
    setTimeout(() => syncOverlay.classList.add('hidden'), 1000);
}

socket.on('play', ({ time, username: user }) => {
    isSyncing = true;
    video.currentTime = time;
    video.play().catch(() => {});
    addSystemMessage(`${user} pressed play`);
    showSyncOverlay();
    setTimeout(() => isSyncing = false, 500);
});

socket.on('pause', ({ time, username: user }) => {
    isSyncing = true;
    video.currentTime = time;
    video.pause();
    addSystemMessage(`${user} paused`);
    showSyncOverlay();
    setTimeout(() => isSyncing = false, 500);
});

socket.on('seek', ({ time, username: user }) => {
    isSyncing = true;
    video.currentTime = time;
    addSystemMessage(`${user} jumped to ${formatTime(time)}`);
    showSyncOverlay();
    setTimeout(() => isSyncing = false, 500);
});

socket.on('speed-change', ({ speed, username: user }) => {
    isSyncing = true;
    video.playbackRate = speed;
    addSystemMessage(`${user} changed speed to ${speed}x`);
    showSyncOverlay();
    setTimeout(() => isSyncing = false, 500);
});

// --- Emoji Reactions ---

document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        socket.emit('emoji-reaction', { emoji });
        spawnFloatingEmoji(emoji);
    });
});

socket.on('emoji-reaction', ({ emoji }) => {
    spawnFloatingEmoji(emoji);
});

function spawnFloatingEmoji(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    // Random horizontal position
    el.style.left = Math.random() * 80 + 10 + '%';
    emojiContainer.appendChild(el);
    // Remove after animation
    el.addEventListener('animationend', () => el.remove());
}

// --- Typing Indicator ---

chatInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { isTyping: true });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('typing', { isTyping: false });
    }, 1500);
});

const typingUsers = new Set();

socket.on('typing', ({ username: user, isTyping: typing }) => {
    if (typing) {
        typingUsers.add(user);
    } else {
        typingUsers.delete(user);
    }
    renderTypingIndicator();
});

function renderTypingIndicator() {
    if (typingUsers.size === 0) {
        typingIndicator.textContent = '';
        typingIndicator.classList.add('hidden');
    } else {
        const names = Array.from(typingUsers);
        let text;
        if (names.length === 1) {
            text = `${names[0]} is typing...`;
        } else if (names.length === 2) {
            text = `${names[0]} and ${names[1]} are typing...`;
        } else {
            text = `${names.length} people are typing...`;
        }
        typingIndicator.textContent = text;
        typingIndicator.classList.remove('hidden');
    }
}

// --- Chat ---

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('chat-message', { message: msg });
        chatInput.value = '';
        // Stop typing indicator
        isTyping = false;
        clearTimeout(typingTimeout);
        socket.emit('typing', { isTyping: false });
    }
}

socket.on('chat-message', ({ username: user, message }) => {
    const isMe = user === username;
    const div = document.createElement('div');
    div.className = `chat-bubble ${isMe ? 'mine' : 'other'}`;
    div.innerHTML = `<div class="bubble-name">${escapeHtml(user)}</div><div class="bubble-text">${escapeHtml(message)}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (!isMe) {
        showToast(user, message);
    }
});

// Toast notification
function showToast(user, message) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<div class="toast-name">${escapeHtml(user)}</div><div class="toast-text">${escapeHtml(message)}</div>`;
    document.body.appendChild(toast);

    toast.addEventListener('click', () => {
        toast.remove();
        chatMessages.scrollIntoView({ behavior: 'smooth' });
        chatInput.focus();
    });

    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

// --- User Events ---

socket.on('user-joined', ({ username: user, users }) => {
    currentUsers = users;
    userCountEl.innerHTML = `<i class="bi bi-people-fill"></i> ${users.length}`;
    renderUsersList();
    addSystemMessage(`${user} joined`);
});

socket.on('user-left', ({ username: user, users }) => {
    currentUsers = users;
    userCountEl.innerHTML = `<i class="bi bi-people-fill"></i> ${users.length}`;
    renderUsersList();
    typingUsers.delete(user);
    renderTypingIndicator();
    addSystemMessage(`${user} left`);
});

socket.on('host-changed', () => {
    addSystemMessage('Host changed');
});

function renderUsersList() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    currentUsers.forEach((u) => {
        const li = document.createElement('li');
        li.className = 'list-group-item bg-transparent text-white d-flex align-items-center gap-2';
        const isMe = u.username === username;
        li.innerHTML = `
            <i class="bi bi-person-circle text-purple"></i>
            <span>${escapeHtml(u.username)}</span>
            ${isMe ? '<span class="badge bg-purple ms-auto">You</span>' : ''}
        `;
        usersList.appendChild(li);
    });
}

// --- Fullscreen ---

document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const videoArea = document.getElementById('video-area');
    const btn = document.getElementById('fullscreen-btn');

    if (videoArea.classList.contains('fake-fullscreen')) {
        videoArea.classList.remove('fake-fullscreen');
        btn.innerHTML = '<i class="bi bi-fullscreen"></i>';
    } else {
        videoArea.classList.add('fake-fullscreen');
        btn.innerHTML = '<i class="bi bi-x-lg"></i>';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const videoArea = document.getElementById('video-area');
        if (videoArea && videoArea.classList.contains('fake-fullscreen')) {
            videoArea.classList.remove('fake-fullscreen');
            document.getElementById('fullscreen-btn').innerHTML = '<i class="bi bi-fullscreen"></i>';
        }
    }
});

// --- Helpers ---

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-bubble system';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(s) {
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
