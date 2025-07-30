const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 5000,
    pingInterval: 1000,
    transports: ['websocket'], // Force WebSocket only, no polling
    allowEIO3: true,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files (your game) from the current directory
app.use(express.static(__dirname));

// Game state
let players = {};
let lastState = null;
let hostId = null;

io.on('connection', (socket) => {
    // Assign player color
    let color = Object.keys(players).length === 0 ? 'red' : 'blue';
    players[socket.id] = { color, inputs: {} };
    socket.emit('playerColor', color);
    console.log(`Player ${color} connected: ${socket.id}`);

    // Assign host if not set
    if (!hostId) {
        hostId = socket.id;
        io.emit('hostId', hostId);
        console.log(`Host assigned: ${hostId}`);
    } else {
        socket.emit('hostId', hostId);
    }

    // Relay input from viewers to host
    socket.on('playerInput', (data) => {
        if (socket.id !== hostId && hostId) {
            io.to(hostId).emit('viewerInput', { socketId: socket.id, data });
        }
    });
    
    // Relay mouse position from viewers to host and vice versa
    socket.on('mousePosition', (data) => {
        if (socket.id !== hostId && hostId) {
            // Viewer sending to host
            io.to(hostId).emit('mousePosition', data);
        } else if (socket.id === hostId) {
            // Host broadcasting to all viewers
            socket.broadcast.emit('mousePosition', data);
        }
    });

    // Relay game state from host to all viewers
    socket.on('gameState', (state) => {
        if (socket.id === hostId) {
            socket.broadcast.emit('gameState', state);
        }
    });

    // Custom ping-pong for latency measurement
    socket.on('ping', (sentTime) => {
        socket.emit('pong', sentTime);
    });

    io.emit('playerCount', Object.keys(players).length);

    socket.on('disconnect', () => {
        console.log(`Player ${players[socket.id]?.color || 'unknown'} disconnected: ${socket.id}`);
        delete players[socket.id];
        if (socket.id === hostId) {
            // Host left, pick a new host if any players remain
            const ids = Object.keys(players);
            hostId = ids.length > 0 ? ids[0] : null;
            io.emit('hostId', hostId);
            console.log(`Host changed to: ${hostId}`);
        }
        io.emit('playerDisconnected');
        io.emit('playerCount', Object.keys(players).length);
    });
});

// Optimize server for low latency
server.keepAliveTimeout = 0;
server.headersTimeout = 0;

server.listen(3000, () => {
    console.log('Tank game server running on http://localhost:3000');
}); 