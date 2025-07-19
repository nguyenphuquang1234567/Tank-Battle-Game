// Load background image (define at the very top)
const bgImage = new Image();
bgImage.src = 'assets/background.png';

// Game canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas to fullscreen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Initialize canvas size
resizeCanvas();

// Handle window resize
window.addEventListener('resize', resizeCanvas);

// Mouse position tracking for cursor aiming
let mouseX = 0;
let mouseY = 0;

// Track remote mouse positions for multiplayer
let remoteMousePositions = {};

// Game mode variables
let gameMode = null; // 'multiplayer' or 'ai'
let aiTank = null; // Reference to the AI tank

// Track mouse movement for cursor aiming
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    
    // Send mouse position to server for multiplayer
    if (socket && myColor && gameMode === 'multiplayer') {
        socket.emit('mousePosition', { color: myColor, x: mouseX, y: mouseY });
    }
});

// Game state
let gameRunning = true;
let bullets = [];
let tanks = [];
let powerUps = [];
let gameOverMessage = '';
let gameOverTimer = 0;

// Lives system
let player1Lives = 7;
let player2Lives = 7;
let roundNumber = 1;

// Countdown system
let countdownActive = false;
let countdownValue = 4;
let countdownTimer = 0;

// Add meteors array to game state
let meteors = [];

// Add effects array to game state
let effects = [];

// Add global miniTanks array
let miniTanks = [];

// Add global laserHazards array
let laserHazards = [];

// Game loop timing
let lastFrameTime = 0;

// Boom effect class
class BoomEffect {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 60;
        this.alpha = 1;
        this.color = color;
        this.done = false;
    }
    update() {
        this.radius += 6;
        this.alpha -= 0.08;
        if (this.radius > this.maxRadius || this.alpha <= 0) {
            this.done = true;
        }
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 30;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// Tank class
class Tank {
    constructor(x, y, color, controls) {
        this.x = x;
        this.y = y;
        this.radius = 20;
        this.color = color;
        this.angle = 0;
        this.speed = 3;
        this.health = 2400;
        this.maxHealth = 2400;
        this.controls = controls;
        this.lastShot = 0;
        this.shootCooldown = 200; // milliseconds
        this.baseShootCooldown = this.shootCooldown;
        this.bulletSpeed = 12; // Increased from 8 to 12
        
        // Power-up states
        this.speedBoost = 0;
        this.rapidFire = 0;
        this.shield = 0;
        this.multishot = 0;
        this.baseSpeed = this.speed;
        this.baseShootCooldown = this.shootCooldown;
        
        // Health regeneration
        this.healthRegenTimer = 0;
        this.healthRegenCooldown = 240; // Regenerate every 4 seconds
        this.flashTimer = 0;
    }

    update() {
        // Update power-up timers
        if (this.speedBoost > 0) {
            this.speedBoost--;
            this.speed = this.baseSpeed * 2;
        } else {
            this.speed = this.baseSpeed;
        }
        
        if (this.rapidFire > 0) {
            this.rapidFire--;
            this.shootCooldown = 120; // Rapid fire: 120ms cooldown
        } else {
            this.shootCooldown = this.baseShootCooldown;
        }
        
        if (this.shield > 0) {
            this.shield--;
        }
        
        if (this.multishot > 0) {
            this.multishot--;
        }
        
        // Health regeneration
        this.healthRegenTimer++;
        if (this.healthRegenTimer >= this.healthRegenCooldown && this.health < this.maxHealth) {
            this.health = Math.min(this.maxHealth, this.health + 2); // Regenerate 2 health
            this.healthRegenTimer = 0;
        }
        
        // Handle movement
        if (this.controls.up()) {
            this.y -= this.speed;
            if (gameMode === 'ai' && this.color === '#e74c3c') {
                console.log('Red tank moving up');
            }
        }
        if (this.controls.down()) {
            this.y += this.speed;
            if (gameMode === 'ai' && this.color === '#e74c3c') {
                console.log('Red tank moving down');
            }
        }
        if (this.controls.left()) {
            this.x -= this.speed;
            if (gameMode === 'ai' && this.color === '#e74c3c') {
                console.log('Red tank moving left');
            }
        }
        if (this.controls.right()) {
            this.x += this.speed;
            if (gameMode === 'ai' && this.color === '#e74c3c') {
                console.log('Red tank moving right');
            }
        }

        // Keep tank within bounds
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        // Handle rotation (aiming) - different logic for multiplayer vs AI
        if (gameMode === 'multiplayer') {
            // Multiplayer aiming logic
            if (myColor === 'red' && this.color === '#e74c3c') {
                // Red player controls red tank
                const dx = mouseX - this.x;
                const dy = mouseY - this.y;
                this.angle = Math.atan2(dy, dx);
            } else if (myColor === 'blue' && this.color === '#3498db') {
                // Blue player controls blue tank
                const dx = mouseX - this.x;
                const dy = mouseY - this.y;
                this.angle = Math.atan2(dy, dx);
            } else if (myColor === 'red' && this.color === '#3498db') {
                // Red player can see blue tank aiming (for host)
                const remotePos = remoteMousePositions['blue'];
                if (remotePos) {
                    const dx = remotePos.x - this.x;
                    const dy = remotePos.y - this.y;
                    this.angle = Math.atan2(dy, dx);
                }
            } else if (myColor === 'blue' && this.color === '#e74c3c') {
                // Blue player can see red tank aiming (for viewer)
                const remotePos = remoteMousePositions['red'];
                if (remotePos) {
                    const dx = remotePos.x - this.x;
                    const dy = remotePos.y - this.y;
                    this.angle = Math.atan2(dy, dx);
                }
            }
        } else if (gameMode === 'ai') {
            // AI mode aiming logic
            if (this.color === '#e74c3c') {
                // Player tank (red) - use mouse aiming
                const dx = mouseX - this.x;
                const dy = mouseY - this.y;
                this.angle = Math.atan2(dy, dx);
            }
            // AI tank aiming is handled in AI update logic
        }
    
        // Client-side prediction for smoother movement (multiplayer only)
        if (gameMode === 'multiplayer' && this.targetX !== undefined && this.targetY !== undefined) {
            this.x = lerp(this.x, this.targetX, 0.2);
            this.y = lerp(this.y, this.targetY, 0.2);
            this.angle = lerp(this.angle, this.targetAngle, 0.2);
        }
        
        // Auto-shoot
        this.autoShoot();
        if (this.flashTimer > 0) this.flashTimer--;
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShot > this.shootCooldown) {
            if (this.multishot > 0) {
                // Shoot 3 bullets in a spread pattern
                for (let i = -1; i <= 1; i++) {
                    const spreadAngle = this.angle + (i * 0.15); // 0.15 radian spread
                    const bulletX = this.x + Math.cos(spreadAngle) * (this.radius + 10);
                    const bulletY = this.y + Math.sin(spreadAngle) * (this.radius + 10);
                    const bulletVX = Math.cos(spreadAngle) * this.bulletSpeed;
                    const bulletVY = Math.sin(spreadAngle) * this.bulletSpeed;
                    
                    bullets.push(new Bullet(bulletX, bulletY, bulletVX, bulletVY, this.color));
                }
            } else {
                // Single bullet
                const bulletX = this.x + Math.cos(this.angle) * (this.radius + 10);
                const bulletY = this.y + Math.sin(this.angle) * (this.radius + 10);
                const bulletVX = Math.cos(this.angle) * this.bulletSpeed;
                const bulletVY = Math.sin(this.angle) * this.bulletSpeed;
                
                bullets.push(new Bullet(bulletX, bulletY, bulletVX, bulletVY, this.color));
            }
            this.lastShot = now;
        }
    }
    
    autoShoot() {
        const now = Date.now();
        if (now - this.lastShot > this.shootCooldown) {
            this.shoot();
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Outer glow
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 18;

        // Tank body with radial gradient
        let grad = ctx.createRadialGradient(0, 0, this.radius * 0.3, 0, 0, this.radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.5, this.color);
        grad.addColorStop(1, '#222');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Barrel with highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -3, this.radius + 10, 6);
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.25;
        ctx.fillRect(this.radius + 2, -2, 6, 4); // Barrel shine
        ctx.globalAlpha = 1;

        // Tank outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // White flash effect if hit
        if (this.flashTimer > 0) {
            ctx.globalAlpha = 0.5 * (this.flashTimer / 10);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Draw shield effect
        if (this.shield > 0) {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw health bar
        this.drawHealthBar();
        
        // Draw health number
        this.drawHealthNumber();
        
        // Draw power-up indicators
        this.drawPowerUpIndicators();
        
        // Draw cursor indicator for both tanks - both players can see both indicators
        if ((myColor === 'red' && this.color === '#e74c3c') || 
            (myColor === 'blue' && this.color === '#3498db') ||
            (myColor === 'red' && this.color === '#3498db') ||
            (myColor === 'blue' && this.color === '#e74c3c')) {
            this.drawCursorIndicator();
        }
    }

    drawHealthBar() {
        const barWidth = 40;
        const barHeight = 6;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 15;
        
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health
        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        
        // Regeneration indicator (pulsing green dots when regenerating)
        if (this.health < this.maxHealth && this.healthRegenTimer > this.healthRegenCooldown * 0.8) {
            ctx.fillStyle = '#00ff00';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.01); // Pulsing effect
            ctx.fillRect(barX + barWidth + 5, barY, 3, barHeight);
            ctx.globalAlpha = 1;
        }
        
        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    takeDamage(damage) {
        // Shield reduces damage by 70%
        if (this.shield > 0) {
            damage = Math.ceil(damage * 0.3);
        }
        playHitSound();
        this.flashTimer = 10; // 10 frames of white flash
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            return true; // Tank destroyed
        }
        return false;
    }
    
    drawPowerUpIndicators() {
        const barY = this.y - this.radius - 25;
        let offset = 0;
        
        if (this.speedBoost > 0) {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(this.x - 20 + offset, barY, 8, 4);
            offset += 10;
        }
        
        if (this.rapidFire > 0) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x - 20 + offset, barY, 8, 4);
            offset += 10;
        }
        
        if (this.shield > 0) {
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(this.x - 20 + offset, barY, 8, 4);
            offset += 10;
        }
        
        if (this.multishot > 0) {
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(this.x - 20 + offset, barY, 8, 4);
        }
    }
    
    drawHealthNumber() {
        const textY = this.y - this.radius - 35;
        
        // Background for better readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(this.x - 25, textY - 8, 50, 16);
        
        // Health number in white
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.health}/${this.maxHealth}`, this.x, textY);
    }
    
    drawCursorIndicator() {
        // Draw a small cursor indicator near the tank
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(this.x + this.radius + 15, this.y - this.radius - 15, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// PowerUp class
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.type = type; // 'speed', 'rapid', 'shield', 'multishot', 'minitank'
        this.life = 780; // 13 seconds at 60fps
        this.rotation = 0;
    }

    update() {
        this.life--;
        return this.life > 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Draw power-up based on type
        switch(this.type) {
            case 'speed':
                ctx.fillStyle = '#00ff00';
                break;
            case 'rapid':
                ctx.fillStyle = '#ff0000';
                break;
            case 'shield':
                ctx.fillStyle = '#0000ff';
                break;
            case 'multishot':
                ctx.fillStyle = '#ff00ff';
                break;
        }
        
        // Draw diamond shape
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius, 0);
        ctx.lineTo(0, this.radius);
        ctx.lineTo(-this.radius, 0);
        ctx.closePath();
        ctx.fill();
        
        // Draw outline
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw type indicator
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        if (this.type === 'shield') {
            ctx.fillText('🛡️', 0, 4);
        } else if (this.type === 'speed') {
            ctx.fillText('👢', 0, 4);
        } else if (this.type === 'multishot') {
            ctx.fillText('💥💥💥', 0, 4);
        } else if (this.type === 'rapid') {
            ctx.fillText('⚡', 0, 4);
        } else if (this.type === 'minitank') {
            ctx.fillText('🤖', 0, 4);
        } else {
            ctx.fillText(this.type.charAt(0).toUpperCase(), 0, 4);
        }
        
        ctx.restore();
    }
}

// Meteor class
class Meteor {
    constructor(x, y, speed, radius, damage) {
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.radius = radius;
        this.damage = damage;
        this.active = true;
        this.vx = Math.random() * 1.2 + 0.6; // Add rightward velocity (0.6 to 1.8)
    }

    update() {
        this.y += this.speed;
        this.x += this.vx; // Move rightward
        // Meteor is active as long as it's on screen
        if (this.y - this.radius > canvas.height || this.x - this.radius > canvas.width) {
            this.active = false;
        }
    }

    draw() {
        ctx.save();

        // Glowing trail (more visible)
        for (let i = 0; i < 16; i++) {
            ctx.globalAlpha = 0.18 * (1 - i / 16);
            ctx.beginPath();
            ctx.arc(this.x - this.vx * i * 7, this.y - this.speed * i * 7, this.radius * (1.1 - i / 18), 0, Math.PI * 2);
            ctx.fillStyle = '#ff6600';
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 36;
            ctx.fill();
        }

        // Main meteor body with fiery gradient
        ctx.globalAlpha = 1;
        const grad = ctx.createRadialGradient(this.x, this.y, this.radius * 0.3, this.x, this.y, this.radius);
        grad.addColorStop(0, '#fff6a0');
        grad.addColorStop(0.4, '#ff9933');
        grad.addColorStop(1, '#ff3300');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 25;
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff3300';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Highlight
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();

        ctx.restore();
    }
}

// Bullet class
class Bullet {
    constructor(x, y, vx, vy, color, damage = 25) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = 8; // Increased from 4 to 8
        this.color = color;
        // this.life = 100; // Remove bullet lifetime limit
        this.trail = []; // Store previous positions for trail effect
        this.damage = damage;
    }

    update() {
        // Add current position to trail
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 5) {
            this.trail.shift(); // Keep only last 5 positions
        }
        
        this.x += this.vx;
        this.y += this.vy;
        // Remove this.life--;
        
        // Remove if out of bounds only
        return this.x > 0 && this.x < canvas.width && 
               this.y > 0 && this.y < canvas.height;
    }

    draw() {
        // Draw trail effect
        for (let i = 0; i < this.trail.length; i++) {
            const alpha = (i + 1) / this.trail.length;
            const radius = this.radius * (0.3 + 0.7 * alpha);
            
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Outer glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        
        // Main bullet body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright core
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Bullet outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }
}

// --- Multiplayer Setup ---
let socket = null;
let myColor = null;
let remoteInputs = { red: {}, blue: {} };
let isHost = false;
let hostId = null;
let mySocketId = null;
let latestGameState = null;
let playerCount = 1;
let waitingForPlayer = true;

// --- AI Controls ---
let aiInput = {
    up: false, down: false, left: false, right: false
};

// AI behavior variables
let aiTargetDistance = 150; // Preferred distance from player
let aiStrafeDirection = 1; // 1 for right, -1 for left
let aiStrafeTimer = 0;
let aiStrafeInterval = 120; // Change direction every 2 seconds
let aiReactionDelay = 0; // Random delay for shooting
let aiReactionTimer = 0;

// Enhanced AI variables
let aiState = 'hunt'; // hunt, retreat, aggressive, defensive, powerup
let aiStateTimer = 0;
let aiStateDuration = 180; // 3 seconds at 60fps
let aiHealthThreshold = 0.3; // Switch to defensive when health < 30%
let aiAggressiveThreshold = 0.7; // Switch to aggressive when health > 70%
let aiLastKnownPlayerPos = { x: 0, y: 0 };
let aiPredictionTimer = 0;
let aiPredictionInterval = 30; // Update player prediction every 0.5 seconds
let aiCoverTimer = 0;
let aiCoverInterval = 120; // Find cover every 2 seconds
let aiCoverPosition = null;
let aiBulletMemory = []; // Remember recent bullet patterns
let aiPatternRecognition = {
    playerStrafePattern: [],
    playerShootPattern: [],
    playerMovementPattern: []
};
let aiDifficulty = 0.8; // 0.0 = easy, 1.0 = hard
let aiAdaptiveTimer = 0;
let aiAdaptiveInterval = 600; // Adapt difficulty every 10 seconds

// --- Ping Indicator ---
let ping = 0;
let lastPingSent = 0;

// Socket setup is now handled in startMultiplayerMode()

// Ping interval is now handled in startMultiplayerMode()

// --- Game Mode Functions ---
window.startMultiplayerMode = function() {
    gameMode = 'multiplayer';
    document.getElementById('gameModeMenu').style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'block';
    document.getElementById('controls').style.display = 'flex';
    
    // Initialize socket connection for multiplayer
    if (typeof io !== 'undefined') {
        socket = io({
            transports: ['websocket'],
            forceNew: true,
            timeout: 5000,
            reconnection: true,
            reconnectionDelay: 100,
            reconnectionAttempts: 5
        });
        
        socket.on('playerColor', (color) => {
            myColor = color;
            console.log('Assigned color:', color);
        });
        socket.on('hostId', (id) => {
            hostId = id;
            isHost = (socket.id === hostId);
            console.log('Received hostId:', hostId, 'Am I host?', isHost);
            maybeStartGame();
        });
        socket.on('playerCount', (count) => {
            playerCount = count;
            waitingForPlayer = (count < 2);
            maybeStartGame();
        });
        socket.on('connect', () => {
            mySocketId = socket.id;
            console.log('Connected with socket id:', mySocketId);
        });
        socket.on('playerDisconnected', () => {
            alert('A player disconnected. Reloading...');
            location.reload();
        });
        socket.on('gameState', (state) => {
            latestGameState = state;
        });
        socket.on('viewerInput', (payload) => {
            if (!isHost) return;
            const { color, input } = payload.data;
            remoteInputs[color] = input;
        });
        socket.on('pong', (sentTime) => {
            ping = Math.round(performance.now() - sentTime);
        });
        socket.on('playerInput', (data) => {
            remoteInputs[data.color] = data.input;
        });
        socket.on('mousePosition', (data) => {
            remoteMousePositions[data.color] = { x: data.x, y: data.y };
        });
        socket.on('viewerInput', (data) => {
            if (data.data.color && data.data.x !== undefined && data.data.y !== undefined) {
                remoteMousePositions[data.data.color] = { x: data.data.x, y: data.data.y };
            }
        });
        
        // Set up ping interval for multiplayer
        setInterval(() => {
            if (socket) {
                lastPingSent = performance.now();
                socket.emit('ping', lastPingSent);
            }
        }, 1000); // Ping every second
    }
}

window.startAIMode = function() {
    console.log('Starting AI mode...');
    gameMode = 'ai';
    document.getElementById('gameModeMenu').style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'block';
    document.getElementById('controls').style.display = 'flex';
    
    // Set up AI mode variables
    myColor = 'red'; // Player is always red in AI mode
    isHost = true; // Player is always host in AI mode
    playerCount = 2; // Simulate 2 players
    waitingForPlayer = false; // Don't wait for other players in AI mode
    
    // Ensure no socket connection in AI mode
    if (socket) {
        console.log('Disconnecting socket for AI mode');
        socket.disconnect();
        socket = null;
    }
    
    console.log('AI mode variables set:', { gameMode, myColor, isHost, playerCount, waitingForPlayer, socket: !!socket });
    
    // Initialize tanks for AI mode
    initTanks();
    
    // Start the game loop immediately
    window._gameStarted = true;
    console.log('Starting game loop for AI mode');
    gameLoop(performance.now());
}

// Enhanced AI update function
function updateAI() {
    if (!aiTank || gameMode !== 'ai') {
        console.log('updateAI early return:', { aiTank: !!aiTank, gameMode });
        return;
    }
    
    const playerTank = tanks.find(t => t.color === '#e74c3c');
    if (!playerTank) return;
    
    // Update AI state timer
    aiStateTimer++;
    aiPredictionTimer++;
    aiCoverTimer++;
    aiAdaptiveTimer++;
    
    // Adaptive difficulty adjustment
    if (aiAdaptiveTimer >= aiAdaptiveInterval) {
        adjustAIDifficulty();
        aiAdaptiveTimer = 0;
    }
    
    // Update player prediction
    if (aiPredictionTimer >= aiPredictionInterval) {
        updatePlayerPrediction(playerTank);
        aiPredictionTimer = 0;
    }
    
    // Find cover periodically
    if (aiCoverTimer >= aiCoverInterval) {
        findCoverPosition();
        aiCoverTimer = 0;
    }
    
    // State machine logic
    updateAIState(playerTank);
    
    // Reset AI input
    aiInput.up = false;
    aiInput.down = false;
    aiInput.left = false;
    aiInput.right = false;
    
    // Execute state-specific behavior
    executeAIState(playerTank);
    
    // Advanced aiming with prediction
    advancedAiming(playerTank);
    
    // Smart shooting with pattern recognition
    smartShooting(playerTank);
    
    // Advanced dodging
    advancedDodging();
    
    // Power-up strategy
    powerUpStrategy(playerTank);
    
    // Meteor avoidance
    meteorAvoidance();
    
    // Mini-tank management
    miniTankStrategy();
}

// AI State Management
function updateAIState(playerTank) {
    const aiHealthPercent = aiTank.health / aiTank.maxHealth;
    const playerHealthPercent = playerTank.health / playerTank.maxHealth;
    const distance = getDistance(aiTank, playerTank);
    
    // State transitions based on conditions
    if (aiHealthPercent < aiHealthThreshold && aiState !== 'retreat') {
        aiState = 'retreat';
        aiStateTimer = 0;
        console.log('AI switching to retreat mode - low health');
    } else if (aiHealthPercent > aiAggressiveThreshold && playerHealthPercent < 0.5 && aiState !== 'aggressive') {
        aiState = 'aggressive';
        aiStateTimer = 0;
        console.log('AI switching to aggressive mode - advantage');
    } else if (aiStateTimer >= aiStateDuration) {
        // Random state change
        const states = ['hunt', 'defensive', 'aggressive'];
        aiState = states[Math.floor(Math.random() * states.length)];
        aiStateTimer = 0;
        console.log('AI switching to', aiState, 'mode');
    }
}

// Execute AI state behavior
function executeAIState(playerTank) {
    const distance = getDistance(aiTank, playerTank);
    
    switch (aiState) {
        case 'hunt':
            huntingBehavior(playerTank, distance);
            break;
        case 'retreat':
            retreatBehavior(playerTank, distance);
            break;
        case 'aggressive':
            aggressiveBehavior(playerTank, distance);
            break;
        case 'defensive':
            defensiveBehavior(playerTank, distance);
            break;
        case 'powerup':
            powerUpBehavior();
            break;
    }
}

// Hunting behavior - balanced approach
function huntingBehavior(playerTank, distance) {
    const targetDistance = aiTargetDistance * (0.8 + aiDifficulty * 0.4);
    
    if (distance < targetDistance - 30) {
        // Too close, move away intelligently
        const angle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x);
        const escapeAngle = angle + Math.PI + (Math.random() - 0.5) * Math.PI / 2;
        moveInDirection(escapeAngle);
    } else if (distance > targetDistance + 30) {
        // Too far, move closer
        const angle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x);
        moveInDirection(angle);
    } else {
        // Good distance, strafe intelligently
        const strafeAngle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x) + Math.PI / 2;
        if (aiStrafeDirection > 0) {
            moveInDirection(strafeAngle);
        } else {
            moveInDirection(strafeAngle + Math.PI);
        }
    }
}

// Retreat behavior - find cover and heal
function retreatBehavior(playerTank, distance) {
    if (aiCoverPosition) {
        // Move to cover
        const coverAngle = Math.atan2(aiCoverPosition.y - aiTank.y, aiCoverPosition.x - aiTank.x);
        moveInDirection(coverAngle);
    } else {
        // Move away from player
        const escapeAngle = Math.atan2(aiTank.y - playerTank.y, aiTank.x - playerTank.x);
        moveInDirection(escapeAngle);
    }
    
    // Heal if possible
    if (aiTank.health < aiTank.maxHealth * 0.5) {
        // Stay still to regenerate health
        aiInput.up = false;
        aiInput.down = false;
        aiInput.left = false;
        aiInput.right = false;
    }
}

// Aggressive behavior - close combat
function aggressiveBehavior(playerTank, distance) {
    const closeDistance = aiTargetDistance * 0.6;
    
    if (distance > closeDistance) {
        // Move closer aggressively
        const angle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x);
        moveInDirection(angle);
    } else {
        // Circle around player
        const circleAngle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x) + Math.PI / 2;
        moveInDirection(circleAngle);
    }
}

// Defensive behavior - maintain distance and dodge
function defensiveBehavior(playerTank, distance) {
    const safeDistance = aiTargetDistance * 1.2;
    
    if (distance < safeDistance) {
        // Move away to safe distance
        const escapeAngle = Math.atan2(aiTank.y - playerTank.y, aiTank.x - playerTank.x);
        moveInDirection(escapeAngle);
    } else {
        // Strafe defensively
        const strafeAngle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x) + Math.PI / 2;
        moveInDirection(strafeAngle);
    }
}

// Power-up behavior
function powerUpBehavior() {
    const nearestPowerUp = findNearestPowerUp();
    if (nearestPowerUp) {
        const angle = Math.atan2(nearestPowerUp.y - aiTank.y, nearestPowerUp.x - aiTank.x);
        moveInDirection(angle);
    }
}

// Advanced aiming with prediction
function advancedAiming(playerTank) {
    // Predict player movement
    const predictedX = playerTank.x + (playerTank.x - aiLastKnownPlayerPos.x) * 2;
    const predictedY = playerTank.y + (playerTank.y - aiLastKnownPlayerPos.y) * 2;
    
    // Calculate aim angle with prediction
    const aimDx = predictedX - aiTank.x;
    const aimDy = predictedY - aiTank.y;
    aiTank.angle = Math.atan2(aimDy, aimDx);
}

// Smart shooting with pattern recognition
function smartShooting(playerTank) {
    aiReactionTimer++;
    if (aiReactionTimer >= aiReactionDelay) {
        const now = Date.now();
        if (now - aiTank.lastShot > aiTank.shootCooldown) {
            const distance = getDistance(aiTank, playerTank);
            const accuracy = aiDifficulty * (1 - distance / 500); // More accurate when closer
            
            if (Math.random() < accuracy) {
                aiTank.shoot();
                aiReactionDelay = Math.random() * 200 + 50; // Faster reaction time
                aiReactionTimer = 0;
            }
        }
    }
}

// Advanced dodging with pattern recognition
function advancedDodging() {
    bullets.forEach(bullet => {
        if (bullet.color !== aiTank.color) {
            const bulletDx = bullet.x - aiTank.x;
            const bulletDy = bullet.y - aiTank.y;
            const bulletDistance = Math.sqrt(bulletDx * bulletDx + bulletDy * bulletDy);
            
            if (bulletDistance < 120) {
                // Enhanced bullet prediction
                const timeToImpact = bulletDistance / Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
                const predictedX = bullet.x + bullet.vx * timeToImpact;
                const predictedY = bullet.y + bullet.vy * timeToImpact;
                const predictedDx = predictedX - aiTank.x;
                const predictedDy = predictedY - aiTank.y;
                const predictedDistance = Math.sqrt(predictedDx * predictedDx + predictedDy * predictedDy);
                
                if (predictedDistance < 40) {
                    // Smart dodge - choose best direction
                    const dodgeDirections = [
                        { x: -bullet.vy, y: bullet.vx }, // Perpendicular
                        { x: bullet.vx, y: bullet.vy },  // Away from bullet
                        { x: -bullet.vx, y: -bullet.vy } // Opposite direction
                    ];
                    
                    let bestDodge = dodgeDirections[0];
                    let bestScore = -Infinity;
                    
                    dodgeDirections.forEach(dodge => {
                        const dodgeLength = Math.sqrt(dodge.x * dodge.x + dodge.y * dodge.y);
                        if (dodgeLength > 0) {
                            const normalizedDodgeX = dodge.x / dodgeLength;
                            const normalizedDodgeY = dodge.y / dodgeLength;
                            
                            // Check if dodge direction is safe
                            const newX = aiTank.x + normalizedDodgeX * 50;
                            const newY = aiTank.y + normalizedDodgeY * 50;
                            
                            if (newX > 50 && newX < canvas.width - 50 && 
                                newY > 50 && newY < canvas.height - 50) {
                                const score = Math.random() * aiDifficulty; // Random but weighted by difficulty
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestDodge = dodge;
                                }
                            }
                        }
                    });
                    
                    // Apply best dodge
                    const dodgeLength = Math.sqrt(bestDodge.x * bestDodge.x + bestDodge.y * bestDodge.y);
                    if (dodgeLength > 0) {
                        const normalizedDodgeX = bestDodge.x / dodgeLength;
                        const normalizedDodgeY = bestDodge.y / dodgeLength;
                        
                        if (normalizedDodgeX > 0) aiInput.right = true;
                        else aiInput.left = true;
                        if (normalizedDodgeY > 0) aiInput.down = true;
                        else aiInput.up = true;
                    }
                }
            }
        }
    });
}

// Power-up strategy
function powerUpStrategy(playerTank) {
    const nearestPowerUp = findNearestPowerUp();
    if (nearestPowerUp) {
        const powerUpDistance = getDistance(aiTank, nearestPowerUp);
        const playerDistance = getDistance(aiTank, playerTank);
        
        // Only go for power-ups if it's safe or we're in powerup mode
        if (aiState === 'powerup' || powerUpDistance < 150 || playerDistance > 200) {
            const angle = Math.atan2(nearestPowerUp.y - aiTank.y, nearestPowerUp.x - aiTank.x);
            moveInDirection(angle);
        }
    }
}

// Meteor avoidance
function meteorAvoidance() {
    meteors.forEach(meteor => {
        if (meteor.active) {
            const meteorDistance = getDistance(aiTank, meteor);
            if (meteorDistance < 100) {
                const escapeAngle = Math.atan2(aiTank.y - meteor.y, aiTank.x - meteor.x);
                moveInDirection(escapeAngle);
            }
        }
    });
}

// Mini-tank strategy
function miniTankStrategy() {
    // AI doesn't control mini-tanks directly, but can use them strategically
    // This could be expanded in the future
}

// Helper functions
function getDistance(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function moveInDirection(angle) {
    const speed = aiTank.speedBoost > 0 ? 8 : 4;
    aiTank.x += Math.cos(angle) * speed;
    aiTank.y += Math.sin(angle) * speed;
    
    // Keep tank within bounds
    aiTank.x = Math.max(50, Math.min(canvas.width - 50, aiTank.x));
    aiTank.y = Math.max(50, Math.min(canvas.height - 50, aiTank.y));
}

function updatePlayerPrediction(playerTank) {
    aiLastKnownPlayerPos.x = playerTank.x;
    aiLastKnownPlayerPos.y = playerTank.y;
}

function findCoverPosition() {
    // Find a position away from player and bullets
    const playerTank = tanks.find(t => t.color === '#e74c3c');
    if (!playerTank) return;
    
    const escapeAngle = Math.atan2(aiTank.y - playerTank.y, aiTank.x - playerTank.x);
    aiCoverPosition = {
        x: aiTank.x + Math.cos(escapeAngle) * 200,
        y: aiTank.y + Math.sin(escapeAngle) * 200
    };
    
    // Keep within bounds
    aiCoverPosition.x = Math.max(50, Math.min(canvas.width - 50, aiCoverPosition.x));
    aiCoverPosition.y = Math.max(50, Math.min(canvas.height - 50, aiCoverPosition.y));
}

function findNearestPowerUp() {
    let nearest = null;
    let minDistance = Infinity;
    
    powerUps.forEach(powerUp => {
        const distance = getDistance(aiTank, powerUp);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = powerUp;
        }
    });
    
    return nearest;
}

function adjustAIDifficulty() {
    const playerTank = tanks.find(t => t.color === '#e74c3c');
    if (!playerTank) return;
    
    const aiHealthPercent = aiTank.health / aiTank.maxHealth;
    const playerHealthPercent = playerTank.health / playerTank.maxHealth;
    
    // Adaptive difficulty based on performance
    if (aiHealthPercent < 0.3 && playerHealthPercent > 0.7) {
        // AI is losing badly, make it easier
        aiDifficulty = Math.max(0.3, aiDifficulty - 0.1);
    } else if (aiHealthPercent > 0.8 && playerHealthPercent < 0.3) {
        // AI is winning easily, make it harder
        aiDifficulty = Math.min(1.0, aiDifficulty + 0.1);
    }
    
    console.log('AI difficulty adjusted to:', aiDifficulty);
}

function maybeStartGame() {
    if (gameMode === 'ai') {
        // AI mode is already started in startAIMode()
        return;
    }
    
    if (playerCount === 2 && hostId && myColor) {
        if (!window._gameStarted) {
            window._gameStarted = true;
            if (isHost) {
                console.log('I am the host, calling initTanks and gameLoop');
                initTanks();
                gameLoop(performance.now());
            } else {
                console.log('I am a viewer, calling gameLoop');
                gameLoop(performance.now());
            }
        }
    }
}

// Only the host should handle 'press any key to continue' to reset/start next round
if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
        if (isHost && !gameRunning && gameOverMessage && playerCount === 2 && (gameMode === 'multiplayer' || gameMode === 'ai')) {
            startCountdown();
            gameOverMessage = '';
        }
    });
}

// Track local input state (removed shoot)
const localInput = {
    up: false, down: false, left: false, right: false
};

// Map keys to input fields for both players (WASD for both, no shoot key)
const keyMap = {
    red:    { up: 'w', down: 's', left: 'a', right: 'd' },
    blue:   { up: 'w', down: 's', left: 'a', right: 'd' }
};

// Listen for keydown/keyup and update localInput
window.addEventListener('keydown', (e) => {
    // Handle input for both multiplayer and AI modes
    if (gameMode === 'multiplayer' && !myColor) return;
    if (gameMode === 'ai') {
        // In AI mode, player is always red
        const mapping = keyMap.red;
        for (const action in mapping) {
            if (e.key.toLowerCase() === mapping[action]) {
                localInput[action] = true;
                console.log('AI mode keydown:', e.key, action, localInput);
            }
        }
    } else if (myColor) {
        // Multiplayer mode
        const mapping = keyMap[myColor];
        for (const action in mapping) {
            if (e.key.toLowerCase() === mapping[action]) localInput[action] = true;
        }
        sendInput(); // Send input immediately on keydown
    }
});
window.addEventListener('keyup', (e) => {
    // Handle input for both multiplayer and AI modes
    if (gameMode === 'multiplayer' && !myColor) return;
    if (gameMode === 'ai') {
        // In AI mode, player is always red
        const mapping = keyMap.red;
        for (const action in mapping) {
            if (e.key.toLowerCase() === mapping[action]) localInput[action] = false;
        }
    } else if (myColor) {
        // Multiplayer mode
        const mapping = keyMap[myColor];
        for (const action in mapping) {
            if (e.key.toLowerCase() === mapping[action]) localInput[action] = false;
        }
        sendInput(); // Send input immediately on keyup
    }
});

// Send local input to server (with color)
function sendInput() {
    if (socket && myColor && gameMode === 'multiplayer') {
        if (isHost) return; // Host does not send input to itself
        socket.emit('playerInput', { color: myColor, input: { ...localInput } });
    }
}

// Send mouse position to server
function sendMousePosition() {
    if (socket && myColor && gameMode === 'multiplayer') {
        // Both host and viewers send their mouse position
        socket.emit('mousePosition', { color: myColor, x: mouseX, y: mouseY });
    }
}
// Only set up intervals for multiplayer mode
if (typeof io !== 'undefined') {
    setInterval(() => {
        if (gameMode === 'multiplayer') {
            sendInput();
        }
    }, 1000/240); // 240 times per second (4ms intervals)
    setInterval(() => {
        if (gameMode === 'multiplayer') {
            sendMousePosition();
        }
    }, 1000/200); // 200 times per second (5ms intervals)
}

// Receive remote input from server (by color) - only in multiplayer mode
if (socket && gameMode === 'multiplayer') {
    socket.on('playerInput', (data) => {
        remoteInputs[data.color] = data.input;
    });
    
    // Receive remote mouse positions
    socket.on('mousePosition', (data) => {
        remoteMousePositions[data.color] = { x: data.x, y: data.y };
    });
    
    // Handle mouse position messages from server
    socket.on('viewerInput', (data) => {
        if (data.data.color && data.data.x !== undefined && data.data.y !== undefined) {
            remoteMousePositions[data.data.color] = { x: data.data.x, y: data.data.y };
        }
    });
}

// Patch initTanks to use multiplayer controls
function getMultiplayerControls(color) {
    if (gameMode === 'ai') {
        if (color === 'red' || color === '#e74c3c') {
            // Player tank (red) - use local input
            return {
                up:   () => localInput.up,
                down: () => localInput.down,
                left: () => localInput.left,
                right: () => localInput.right
            };
        } else if (color === 'blue' || color === '#3498db') {
            // AI tank (blue) - use AI input
            return {
                up:   () => aiInput.up,
                down: () => aiInput.down,
                left: () => aiInput.left,
                right: () => aiInput.right
            };
        }
    } else {
        // Multiplayer mode
        if (color === myColor) {
            // Local player controls
            return {
                up:   () => localInput.up,
                down: () => localInput.down,
                left: () => localInput.left,
                right: () => localInput.right
            };
        } else {
            // Remote player controls
            return {
                up:   () => remoteInputs[color]?.up,
                down: () => remoteInputs[color]?.down,
                left: () => remoteInputs[color]?.left,
                right: () => remoteInputs[color]?.right
            };
        }
    }
}

// Override initTanks for multiplayer
function initTanks() {
    console.log('initTanks called');
    const redControls = getMultiplayerControls('red');
    const blueControls = getMultiplayerControls('blue');
    console.log('Controls assigned:', { 
        red: redControls, 
        blue: blueControls, 
        gameMode, 
        localInput, 
        aiInput 
    });
    
    tanks = [
        new Tank(canvas.width * 0.25, canvas.height * 0.5, '#e74c3c', redControls),
        new Tank(canvas.width * 0.75, canvas.height * 0.5, '#3498db', blueControls)
    ];
    tanks[0].angle = Math.PI;
    tanks[1].angle = 0;
    
    // Set AI tank reference for AI mode
    if (gameMode === 'ai') {
        aiTank = tanks[1]; // Blue tank is AI
        console.log('AI tank set:', aiTank);
    }
}

// Serialize game state for sending to viewers (optimized for low latency)
function serializeGameState() {
    return {
        t: tanks.map(t => [t.x, t.y, t.angle, t.color, t.health, t.maxHealth, t.speedBoost, t.rapidFire, t.shield, t.multishot, t.flashTimer]),
        b: bullets.map(b => [b.x, b.y, b.vx, b.vy, b.color, b.damage]),
        p: powerUps.map(p => [p.x, p.y, p.type, p.life]),
        m: meteors.map(m => [m.x, m.y, m.speed, m.radius, m.damage, m.active]),
        e: effects.map(e => [e.x, e.y, e.radius, e.maxRadius, e.alpha, e.color, e.done]),
        mt: miniTanks.map(m => [m.x, m.y, m.angle, m.color, m.health, m.lifetime, m.target ? m.target.color : null]),
        l: [player1Lives, player2Lives, roundNumber, gameRunning, gameOverMessage, gameOverTimer, countdownActive, countdownValue, countdownTimer],
        lh: laserHazards.map(h => [h.x, h.state, h.timer]) // Serialize laser hazards
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// --- Sound effect triggers for viewers ---
let previousState = null;

// Deserialize game state for viewers (optimized for low latency)
function applyGameState(state) {
    // Only update if state is present
    if (!state) return;
    // --- Sound effect triggers for viewers ---
    if (previousState && typeof window !== 'undefined') {
        // 1. Tank hit or destroyed
        for (let i = 0; i < state.t.length; i++) {
            const prevTank = previousState.t[i];
            const currTank = state.t[i];
            if (prevTank && currTank) {
                if (currTank[4] < prevTank[4]) {
                    playHitSound();
                    if (currTank[4] <= 0 && prevTank[4] > 0) {
                        playBoomSound();
                    }
                }
            }
        }
        // 2. Power-up picked up (power-up count decreases)
        if (state.p.length < previousState.p.length) {
            playPowerupSound();
        }
        // 3. Meteor or laser boom effect (optional: if new effect added)
        // Could add more detailed checks if desired
    }
    previousState = JSON.parse(JSON.stringify(state)); // Deep copy for next frame
    
    // Tanks
    if (!tanks || tanks.length !== state.t.length) {
        // First time or tank count changed: create tanks at correct positions
        tanks = state.t.map(t => {
            const tank = new Tank(t[0], t[1], t[3], getMultiplayerControls(t[3]));
            tank.targetX = t[0];
            tank.targetY = t[1];
            tank.targetAngle = t[2];
            tank.health = t[4];
            tank.maxHealth = t[5];
            tank.speedBoost = t[6];
            tank.rapidFire = t[7];
            tank.shield = t[8];
            tank.multishot = t[9];
            tank.flashTimer = t[10];
            return tank;
        });
    } else {
        // Update targets for interpolation
        state.t.forEach((t, i) => {
            tanks[i].targetX = t[0];
            tanks[i].targetY = t[1];
            tanks[i].targetAngle = t[2];
            tanks[i].health = t[4];
            tanks[i].maxHealth = t[5];
            tanks[i].speedBoost = t[6];
            tanks[i].rapidFire = t[7];
            tanks[i].shield = t[8];
            tanks[i].multishot = t[9];
            tanks[i].flashTimer = t[10];
        });
    }
    
    // Bullets
    bullets = state.b.map(b => Object.assign(new Bullet(b[0], b[1], b[2], b[3], b[4], b[5]), { x: b[0], y: b[1], vx: b[2], vy: b[3], color: b[4], damage: b[5] }));
    
    // PowerUps
    powerUps = state.p.map(p => Object.assign(new PowerUp(p[0], p[1], p[2]), { x: p[0], y: p[1], type: p[2], life: p[3] }));
    
    // Meteors
    meteors = state.m.map(m => Object.assign(new Meteor(m[0], m[1], m[2], m[3], m[4]), { x: m[0], y: m[1], speed: m[2], radius: m[3], damage: m[4], active: m[5] }));
    
    // Effects
    effects = state.e.map(e => Object.assign(new BoomEffect(e[0], e[1], e[5]), { x: e[0], y: e[1], radius: e[2], maxRadius: e[3], alpha: e[4], color: e[5], done: e[6] }));
    
    // MiniTanks
    miniTanks = state.mt.map(m => Object.assign(new MiniTank({ x: m[0], y: m[1], color: m[3] }, { color: m[6] }), { x: m[0], y: m[1], angle: m[2], color: m[3], health: m[4], lifetime: m[5], target: m[6] }));
    
    // Other state
    [player1Lives, player2Lives, roundNumber, gameRunning, gameOverMessage, gameOverTimer, countdownActive, countdownValue, countdownTimer] = state.l;

    // Laser hazards
    laserHazards = state.lh.map(h => {
        const hazard = new LaserHazard(h[0]);
        hazard.state = h[1];
        hazard.timer = h[2];
        return hazard;
    });
}

// Update game state
function update() {
    if (!isHost) return; // Only host runs game logic
    
    // Update AI in AI mode
    if (gameMode === 'ai') {
        console.log('Calling updateAI from update function');
        updateAI();
    }
    // Spawn power-ups randomly
    if (Math.random() < 0.015 && powerUps.length < 5) { // 1.5% chance per frame, max 5 power-ups
        const types = ['speed', 'rapid', 'shield', 'multishot', 'minitank'];
        const type = types[Math.floor(Math.random() * types.length)];
        const x = Math.random() * (canvas.width - 100) + 50;
        const y = Math.random() * (canvas.height - 100) + 50;
        powerUps.push(new PowerUp(x, y, type));
    }
    
    // Update power-ups
    powerUps = powerUps.filter(powerUp => powerUp.update());
    
    // Update tanks
    tanks.forEach(tank => {
        tank.update();
    });

    // Update bullets
    bullets = bullets.filter(bullet => bullet.update());

    // Check bullet-tank collisions
    bullets.forEach((bullet, bulletIndex) => {
        tanks.forEach((tank, tankIndex) => {
            const dx = bullet.x - tank.x;
            const dy = bullet.y - tank.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < tank.radius + bullet.radius) {
                // Check if bullet is from different tank
                if (bullet.color !== tank.color) {
                    const destroyed = tank.takeDamage(bullet.damage);
                    bullets.splice(bulletIndex, 1);
                    
                    if (destroyed) {
                        // Tank destroyed - handle lives system
                        if (tankIndex === 0) {
                            player1Lives--; // Red tank lost, decrease red lives
                        } else {
                            player2Lives--; // Blue tank lost, decrease blue lives
                        }
                        // Add boom effect at tank position
                        effects.push(new BoomEffect(tank.x, tank.y, '#ff6600'));
                        playBoomSound(); // Add boom sound
                        // Check if someone lost all lives
                        if (player1Lives <= 0 || player2Lives <= 0) {
                            gameRunning = false;
                            const winner = player1Lives <= 0 ? 'Blue' : 'Red';
                            gameOverMessage = `${winner} win`;
                            gameOverTimer = 180; // Show for 3 seconds
                            setTimeout(() => {
                                alert(`${winner} win`);
                                resetFullGame();
                            }, 500);
                        } else {
                            // Round over, show message, then start countdown after 1 second
                            gameRunning = false;
                            const roundWinner = tankIndex === 0 ? 'Blue' : 'Red';
                            gameOverMessage = `${roundWinner} win`;
                            gameOverTimer = 120; // Show for 2 seconds
                            roundNumber++;
                            // No setTimeout for startCountdown
                        }
                    }
                }
            }
        });
    });
    
    // Check tank-power-up collisions
    tanks.forEach((tank, tankIndex) => {
        powerUps.forEach((powerUp, powerUpIndex) => {
            const dx = tank.x - powerUp.x;
            const dy = tank.y - powerUp.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < tank.radius + powerUp.radius) {
                // Apply power-up effect
                switch(powerUp.type) {
                    case 'speed':
                        tank.speedBoost = 720; // 12 seconds
                        break;
                    case 'rapid':
                        tank.rapidFire = 720; // 12 seconds
                        break;
                    case 'shield':
                        tank.shield = 720; // 12 seconds
                        break;
                    case 'multishot':
                        tank.multishot = 720; // 12 seconds
                        break;
                    case 'minitank':
                        // Spawn 3 MiniTanks targeting the opponent, offset so they don't overlap
                        const opponent = tanks[1 - tankIndex];
                        const offsets = [-40, 0, 40];
                        for (let i = 0; i < 3; i++) {
                            let miniColor = tank.color;
                            if (tank.color === '#e74c3c') miniColor = '#ff7f7f'; // Light red for red tank's minitanks
                            miniTanks.push(new MiniTank({ ...tank, x: tank.x + offsets[i], y: tank.y, color: miniColor, baseColor: tank.color }, opponent));
                        }
                        break;
                }
                
                // Remove power-up
                powerUps.splice(powerUpIndex, 1);
                playPowerupSound(); // Play power-up sound
            }
        });
    });

    // Spawn meteors randomly
    if (Math.random() < 0.02) { // 2% chance per frame
        const x = Math.random() * (canvas.width - 40) + 20;
        const y = -20;
        const speed = Math.random() * 3 + 3; // 3 to 6 px/frame
        const radius = Math.random() * 15 + 15; // 15 to 30 px
        const damage = Math.floor(radius * 1.5); // Damage scales with size
        meteors.push(new Meteor(x, y, speed, radius, damage));
    }
    // Update meteors
    meteors.forEach(meteor => meteor.update());
    meteors = meteors.filter(meteor => meteor.active);

    // Meteor-tank collisions
    meteors.forEach((meteor) => {
        tanks.forEach((tank, tankIndex) => {
            const dx = meteor.x - tank.x;
            const dy = meteor.y - tank.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < meteor.radius + tank.radius) {
                // Deal damage to tank and remove meteor
                const destroyed = tank.takeDamage(meteor.damage);
                meteor.active = false;
                // Add boom effect
                effects.push(new BoomEffect(meteor.x, meteor.y, '#ff6600'));
                playBoomSound(); // Add boom sound
                if (destroyed) {
                    // Tank destroyed - handle lives system
                    if (tankIndex === 0) {
                        player1Lives--; // Red tank lost, decrease red lives
                    } else {
                        player2Lives--; // Blue tank lost, decrease blue lives
                    }
                    // Add boom effect at tank position
                    effects.push(new BoomEffect(tank.x, tank.y, '#ff6600'));
                    playBoomSound(); // Add boom sound
                    // Check if someone lost all lives
                    if (player1Lives <= 0 || player2Lives <= 0) {
                        gameRunning = false;
                        const winner = player1Lives <= 0 ? 'Blue' : 'Red';
                        gameOverMessage = `${winner} win`;
                        gameOverTimer = 180; // Show for 3 seconds
                        setTimeout(() => {
                            alert(`${winner} win`);
                            resetFullGame();
                        }, 500);
                    } else {
                        // Round over, show message, then start countdown after 1 second
                        gameRunning = false;
                        const roundWinner = tankIndex === 0 ? 'Blue' : 'Red';
                        gameOverMessage = `${roundWinner} win`;
                        gameOverTimer = 120; // Show for 2 seconds
                        roundNumber++;
                        // No setTimeout for startCountdown
                    }
                }
            }
        });
    });
    // Meteor-bullet collisions
    // (No longer destroy meteors when hit by bullets)
    // meteors.forEach((meteor) => {
    //     bullets.forEach((bullet) => {
    //         const dx = meteor.x - bullet.x;
    //         const dy = meteor.y - bullet.y;
    //         const dist = Math.sqrt(dx * dx + dy * dy);
    //         if (dist < meteor.radius + bullet.radius) {
    //             meteor.active = false;
    //             bullet.life = 0; // Remove bullet
    //         }
    //     });
    // });

    // Update and filter effects
    effects.forEach(effect => effect.update());
    effects = effects.filter(effect => !effect.done);

    // Update MiniTanks
    miniTanks.forEach(miniTank => miniTank.update());
    miniTanks = miniTanks.filter(miniTank => !miniTank.isExpired());

    // Bullet-MiniTank collisions
    for (let i = miniTanks.length - 1; i >= 0; i--) {
        const miniTank = miniTanks[i];
        for (let j = bullets.length - 1; j >= 0; j--) {
            const bullet = bullets[j];
            // Only allow bullets from the opposite tank to damage minitank
            if (bullet.color === miniTank.ownerBaseColor) continue;
            const dx = bullet.x - miniTank.x;
            const dy = bullet.y - miniTank.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < miniTank.radius + bullet.radius) {
                miniTank.health -= bullet.damage;
                miniTank.flashTimer = 10;
                playHitSound(); // Play hit sound for MiniTank
                bullets.splice(j, 1);
                if (miniTank.health <= 0) {
                    playBoomSound(); // Play destroyed sound for MiniTank
                }
            }
        }
    }
    // Only remove MiniTanks with health <= 0 or expired
    miniTanks = miniTanks.filter(miniTank => !miniTank.isExpired());

    // Spawn laser hazard randomly
    if (Math.random() < 0.004) { // 0.4% chance per frame
        const margin = 60;
        const x = Math.random() * (canvas.width - 2 * margin) + margin;
        laserHazards.push(new LaserHazard(x));
    }
    // Update laser hazards
    laserHazards = laserHazards.filter(h => h.update());
    // --- Laser hazard collision (only when firing) ---
    // Track which MiniTanks were hit by the laser this frame
    let miniTanksHitByLaser = new Set();
    laserHazards.forEach(hazard => {
        if (hazard.isFiring()) {
            // Tanks
            tanks.forEach(tank => {
                if (tank.x > hazard.x - hazard.width/2 && tank.x < hazard.x + hazard.width/2) {
                    const now = hazard.timer;
                    const last = hazard.lastDamageFrame.get(tank) || -100;
                    if (now - last >= 30) { // 30 frames = 0.5s
                        const destroyed = tank.takeDamage(hazard.damage);
                        hazard.lastDamageFrame.set(tank, now);
                        effects.push(new BoomEffect(tank.x, tank.y, '#ff1744'));
                        playBoomSound();
                        if (destroyed) {
                            if (tanks[0] === tank) {
                                player1Lives--;
                            } else {
                                player2Lives--;
                            }
                            effects.push(new BoomEffect(tank.x, tank.y, '#ff1744'));
                            playBoomSound();
                            if (player1Lives <= 0 || player2Lives <= 0) {
                                gameRunning = false;
                                const winner = player1Lives <= 0 ? 'Blue' : 'Red';
                                gameOverMessage = `${winner} win`;
                                gameOverTimer = 180;
                                setTimeout(() => {
                                    alert(`${winner} win`);
                                    resetFullGame();
                                }, 500);
                            } else {
                                gameRunning = false;
                                const roundWinner = tanks[0] === tank ? 'Blue' : 'Red';
                                gameOverMessage = `${roundWinner} win`;
                                gameOverTimer = 120;
                                roundNumber++;
                            }
                        }
                    }
                }
            });
            // MiniTanks
            // Laser beam does not affect MiniTanks
        }
    });
    // (No need to clamp health for MiniTanks hit by laser, since they are not affected)

    // At the end of update, host sends state to server
    if (isHost && socket) {
        socket.emit('gameState', serializeGameState());
    }
}

// Draw everything
function draw() {
    // Draw background image, stretched to fit canvas
    if (bgImage.complete && bgImage.naturalWidth > 0) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000'; // fallback color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Draw tanks
    tanks.forEach(tank => tank.draw());
    
    // Draw power-ups
    powerUps.forEach(powerUp => powerUp.draw());
    
    // Draw bullets
    bullets.forEach(bullet => bullet.draw());

    // Draw meteors
    meteors.forEach(meteor => meteor.draw());

    // Draw effects
    effects.forEach(effect => effect.draw());
    
    // Draw lives display
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    
    // Red lives with hearts
    ctx.fillStyle = '#ff6b6b';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.textAlign = 'left';
    ctx.strokeText(`Red Lives: `, canvas.width - 300, 30);
    ctx.fillText(`Red Lives: `, canvas.width - 300, 30);
    
    // Draw red hearts with white outline
    const redHeartsX = canvas.width - 300 + ctx.measureText('Red Lives: ').width;
    for (let i = 0; i < player1Lives; i++) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('❤️', redHeartsX + (i * 20), 30);
        ctx.fillStyle = '#e74c3c';
        ctx.fillText('❤️', redHeartsX + (i * 20), 30);
    }
    
    // Blue lives with hearts
    ctx.fillStyle = '#74b9ff';
    ctx.strokeText(`Blue Lives: `, canvas.width - 300, 60);
    ctx.fillText(`Blue Lives: `, canvas.width - 300, 60);
    
    // Draw blue hearts with white outline
    const blueHeartsX = canvas.width - 300 + ctx.measureText('Blue Lives: ').width;
    for (let i = 0; i < player2Lives; i++) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('💙', blueHeartsX + (i * 20), 60);
        ctx.fillStyle = '#3498db';
        ctx.fillText('💙', blueHeartsX + (i * 20), 60);
    }
    

    
    // Draw game over message
    if (gameOverMessage) { // Always draw if gameOverMessage is set
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(gameOverMessage, canvas.width / 2, canvas.height / 2);
        
        ctx.font = '24px Arial';
        ctx.fillText('Press any key to continue...', canvas.width / 2, canvas.height / 2 + 50);
    }
    
    // Draw countdown
    if (countdownActive) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(countdownValue.toString(), canvas.width / 2, canvas.height / 2);
        
        ctx.font = '32px Arial';
        ctx.fillText('Next Round Starting...', canvas.width / 2, canvas.height / 2 + 80);
    }

    // Draw MiniTanks
    miniTanks.forEach(miniTank => miniTank.draw());

    // Draw laser hazards
    laserHazards.forEach(h => h.draw());

    // Show waiting overlay if not enough players (only in multiplayer mode)
    if (waitingForPlayer && gameMode === 'multiplayer') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for another player...', canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }

    // Draw ping indicator
    ctx.save();
    ctx.font = '16px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`Ping: ${ping} ms`, 16, 28);
    ctx.restore();

    // Draw AI state indicators (only in AI mode)
    if (gameMode === 'ai' && aiTank) {
        ctx.save();
        ctx.font = '14px Arial';
        ctx.fillStyle = '#3498db';
        ctx.textAlign = 'left';
        
        // AI State
        const stateColors = {
            'hunt': '#3498db',
            'retreat': '#e74c3c',
            'aggressive': '#f39c12',
            'defensive': '#27ae60',
            'powerup': '#9b59b6'
        };
        
        const stateColor = stateColors[aiState] || '#3498db';
        ctx.fillStyle = stateColor;
        ctx.fillText(`AI State: ${aiState.toUpperCase()}`, 16, 50);
        
        // AI Difficulty
        const difficultyColor = aiDifficulty > 0.7 ? '#e74c3c' : aiDifficulty > 0.4 ? '#f39c12' : '#27ae60';
        ctx.fillStyle = difficultyColor;
        ctx.fillText(`AI Difficulty: ${Math.round(aiDifficulty * 100)}%`, 16, 70);
        
        // AI Health
        const healthPercent = Math.round((aiTank.health / aiTank.maxHealth) * 100);
        const healthColor = healthPercent > 70 ? '#27ae60' : healthPercent > 30 ? '#f39c12' : '#e74c3c';
        ctx.fillStyle = healthColor;
        ctx.fillText(`AI Health: ${healthPercent}%`, 16, 90);
        
        // Draw AI cover position (if in retreat mode)
        if (aiState === 'retreat' && aiCoverPosition) {
            ctx.save();
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(aiTank.x, aiTank.y);
            ctx.lineTo(aiCoverPosition.x, aiCoverPosition.y);
            ctx.stroke();
            
            // Draw cover marker
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(aiCoverPosition.x, aiCoverPosition.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        // Draw AI prediction line (if difficulty is high)
        if (aiDifficulty > 0.6) {
            const playerTank = tanks.find(t => t.color === '#e74c3c');
            if (playerTank) {
                const predictedX = playerTank.x + (playerTank.x - aiLastKnownPlayerPos.x) * 2;
                const predictedY = playerTank.y + (playerTank.y - aiLastKnownPlayerPos.y) * 2;
                
                ctx.save();
                ctx.strokeStyle = '#f39c12';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(playerTank.x, playerTank.y);
                ctx.lineTo(predictedX, predictedY);
                ctx.stroke();
                
                // Draw prediction marker
                ctx.fillStyle = '#f39c12';
                ctx.beginPath();
                ctx.arc(predictedX, predictedY, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
        
        ctx.restore();
    }

    if (!isHost) {
        // Adaptive interpolation based on ping for smoother movement
        const interpolationFactor = Math.min(0.4, Math.max(0.1, 0.2 + (ping / 1000))); // Adaptive: 0.1-0.4 based on ping
        tanks.forEach(tank => {
            if (typeof tank.targetX === 'number' && typeof tank.targetY === 'number') {
                tank.x = lerp(tank.x, tank.targetX, interpolationFactor);
                tank.y = lerp(tank.y, tank.targetY, interpolationFactor);
            }
            if (typeof tank.targetAngle === 'number') {
                let da = tank.targetAngle - tank.angle;
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;
                tank.angle = tank.angle + da * interpolationFactor;
            }
        });
    }
}

// Game loop runs at 60fps via requestAnimationFrame
// 60fps game loop with consistent frame rate
const targetFrameTime = 1000 / 60; // 16.67ms for 60fps

function gameLoop(currentTime) {
    //console.log('gameLoop called, isHost:', isHost);
    
    // Calculate delta time for smooth 60fps
    const deltaTime = currentTime - lastFrameTime;
    
    if (isHost || gameMode === 'ai') {
        // Host mode or AI mode - run game logic
        if (gameRunning) {
            update();
        } else if (countdownActive) {
            updateCountdown();
        }
        draw();
        lastFrameTime = currentTime;
        requestAnimationFrame(gameLoop);
    } else {
        // Multiplayer viewer mode
        // Always update at 60fps regardless of network conditions
        applyGameState(latestGameState);

        // Improved client-side prediction for blue player
        if (gameRunning && myColor === 'blue' && tanks && tanks.length > 1) {
            // Save previous position for smoothing
            const tank = tanks[1];
            const prevX = tank.x;
            const prevY = tank.y;
            const prevAngle = tank.angle;
            // Update with local input
            tank.update();
            // Interpolate toward host state if available
            if (typeof tank.targetX === 'number' && typeof tank.targetY === 'number') {
                // If the difference is large, snap to host state
                const dx = tank.targetX - tank.x;
                const dy = tank.targetY - tank.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 80) {
                    tank.x = tank.targetX;
                    tank.y = tank.targetY;
                } else {
                    const interpolationFactor = Math.min(0.4, Math.max(0.1, 0.2 + (ping / 1000)));
                    tank.x = lerp(tank.x, tank.targetX, interpolationFactor);
                    tank.y = lerp(tank.y, tank.targetY, interpolationFactor);
                }
                // Angle smoothing
                let da = tank.targetAngle - tank.angle;
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;
                if (Math.abs(da) > Math.PI / 2) {
                    tank.angle = tank.targetAngle;
                } else {
                    const interpolationFactor = Math.min(0.4, Math.max(0.1, 0.2 + (ping / 1000)));
                    tank.angle = tank.angle + da * interpolationFactor;
                }
            }
        }

        draw();
        lastFrameTime = currentTime;
        requestAnimationFrame(gameLoop);
    }
}

// Reset round (keep lives, reset tanks)
function resetRound() {
    // Clear all bullets and power-ups
    bullets = [];
    powerUps = [];
    
    // Reset game state
    gameRunning = true;
    gameOverMessage = '';
    gameOverTimer = 0;
    
    // Reset tank positions and health
    tanks[0].x = canvas.width * 0.25;
    tanks[0].y = canvas.height * 0.5;
    tanks[0].health = tanks[0].maxHealth;
    tanks[0].angle = Math.PI; // Red tank faces left
    tanks[0].lastShot = 0;
    tanks[0].speedBoost = 0;
    tanks[0].rapidFire = 0;
    tanks[0].shield = 0;
    tanks[0].multishot = 0;
    tanks[0].healthRegenTimer = 0;
    tanks[0].flashTimer = 0;
    
    tanks[1].x = canvas.width * 0.75;
    tanks[1].y = canvas.height * 0.5;
    tanks[1].health = tanks[1].maxHealth;
    tanks[1].angle = 0; // Blue tank faces right
    tanks[1].lastShot = 0;
    tanks[1].speedBoost = 0;
    tanks[1].rapidFire = 0;
    tanks[1].shield = 0;
    tanks[1].multishot = 0;
    tanks[1].healthRegenTimer = 0;
    tanks[1].flashTimer = 0;

    miniTanks = [];
    laserHazards = []; // Clear laser hazards on round reset
}

// Start countdown for new round
function startCountdown() {
    countdownActive = true;
    countdownValue = 4;
    countdownTimer = 0;
    gameOverMessage = ''; // Clear message only when countdown starts
    gameOverTimer = 0;
}

// Update countdown
function updateCountdown() {
    if (countdownActive) {
        countdownTimer++;
        if (countdownTimer >= 60) { // 1 second at 60fps
            countdownValue--;
            countdownTimer = 0;
            
            if (countdownValue <= 0) {
                countdownActive = false;
                gameRunning = true; // Re-enable game
                resetRound();
            }
        }
    }
}

// Reset full game (reset lives)
function resetFullGame() {
    // Reset lives
    player1Lives = 7;
    player2Lives = 7;
    roundNumber = 1;
    
    // Reset countdown
    countdownActive = false;
    countdownValue = 4;
    countdownTimer = 0;
    
    // Reset round
    resetRound();

    miniTanks = [];
    laserHazards = []; // Clear laser hazards on full reset
}

// MiniTank class
class MiniTank {
    constructor(owner, target) {
        this.owner = owner; // The player who spawned it
        this.ownerBaseColor = owner.baseColor || owner.color; // Store original tank color
        this.target = target; // The opponent
        this.x = owner.x;
        this.y = owner.y;
        this.radius = 12;
        this.color = owner.color || (owner.color === '#e74c3c' ? '#ffb347' : '#85c1ff');
        this.angle = 0;
        this.speed = 3.5;
        this.health = 200; // Updated health
        this.shootCooldown = 500; // ms
        this.lastShot = 0;
        this.lifetime = 600; // 10 seconds at 60fps
        this.flashTimer = 0;
        this.decayTimer = 0; // For health decay
    }

    update() {
        // Move toward target but keep a minimum distance
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDistance = 60;
        if (dist > minDistance) {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
        // Aim at target
        this.angle = Math.atan2(dy, dx);
        // Shoot at target
        const now = Date.now();
        if (now - this.lastShot > this.shootCooldown) {
            this.shoot();
            this.lastShot = now;
        }
        // Lifetime countdown
        this.lifetime--;
        // Health decay every 0.8 seconds (48 frames)
        this.decayTimer++;
        if (this.decayTimer >= 48) {
            this.health -= 5;
            this.decayTimer = 0;
        }
        if (this.flashTimer > 0) this.flashTimer--;
    }

    shoot() {
        const bulletX = this.x + Math.cos(this.angle) * (this.radius + 8);
        const bulletY = this.y + Math.sin(this.angle) * (this.radius + 8);
        const bulletVX = Math.cos(this.angle) * 10;
        const bulletVY = Math.sin(this.angle) * 10;
        bullets.push(new Bullet(bulletX, bulletY, bulletVX, bulletVY, this.color, 7));
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        // Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Barrel
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -2, this.radius + 7, 4);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-5, -5, 2, 0, Math.PI * 2);
        ctx.arc(-5, 5, 2, 0, Math.PI * 2);
        ctx.fill();
        // White flash effect if hit
        if (this.flashTimer > 0) {
            ctx.globalAlpha = 0.5 * (this.flashTimer / 10);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        // Health bar (drawn above the minitank, not rotated)
        const barWidth = 30;
        const barHeight = 5;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 14;
        ctx.save();
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        const healthPercent = Math.max(0, this.health / 200);
        ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        // Health number
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(`${Math.max(0, Math.round(this.health))}/200`, this.x, barY - 3);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.max(0, Math.round(this.health))}/200`, this.x, barY - 3);
        ctx.restore();
    }

    isExpired() {
        return this.health <= 0;
    }
}

// LaserHazard class
class LaserHazard {
    constructor(x) {
        this.x = x;
        this.state = 'warning'; // 'warning' or 'firing'
        this.timer = 0;
        this.warningDuration = 90; // 1.5 seconds at 60fps
        this.laserDuration = 60; // 1 second at 60fps
        this.width = 40; // Laser width in px
        this.damage = 200; // Laser damage
        this.lastDamageFrame = new Map(); // Map of target -> last frame damaged
    }
    update() {
        this.timer++;
        if (this.state === 'warning' && this.timer >= this.warningDuration) {
            this.state = 'firing';
            this.timer = 0;
            playLaserSound();
        } else if (this.state === 'firing' && this.timer >= this.laserDuration) {
            return false; // Remove hazard
        }
        return true;
    }
    draw() {
        if (this.state === 'warning') {
            // Draw exclamation point at top and bottom
            ctx.save();
            ctx.font = 'bold 36px Arial';
            ctx.fillStyle = '#ffeb3b';
            ctx.textAlign = 'center';
            ctx.fillText('!', this.x, 48);
            ctx.fillText('!', this.x, canvas.height - 24);
            // Draw warning line
            ctx.strokeStyle = 'rgba(255,235,59,0.7)';
            ctx.lineWidth = 6;
            ctx.setLineDash([16, 16]);
            ctx.beginPath();
            ctx.moveTo(this.x, 0);
            ctx.lineTo(this.x, canvas.height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        } else if (this.state === 'firing') {
            ctx.save();
            // Outer glow
            ctx.globalAlpha = 0.4;
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = 60;
            ctx.fillStyle = '#ff1744';
            ctx.fillRect(this.x - this.width/2 - 10, 0, this.width + 20, canvas.height);

            // Main beam (vertical gradient)
            ctx.globalAlpha = 0.85;
            ctx.shadowBlur = 0;
            let grad = ctx.createLinearGradient(this.x, 0, this.x, canvas.height);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(0.2, '#ffb3b3');
            grad.addColorStop(0.5, '#ff1744');
            grad.addColorStop(0.8, '#ffb3b3');
            grad.addColorStop(1, '#fff');
            ctx.fillStyle = grad;
            ctx.fillRect(this.x - this.width/2, 0, this.width, canvas.height);

            // Core
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.fillRect(this.x - 2, 0, 4, canvas.height);

            ctx.restore();
        }
    }
    isFiring() {
        return this.state === 'firing';
    }
}

// At the top of the file, after canvas and ctx:
const audioCtx = typeof window.AudioContext !== 'undefined' ? new window.AudioContext() : null;

// Update playHitSound to use the persistent audioCtx:
function playHitSound() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 440;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.08);
}

// Add this function after playHitSound:
function playBoomSound() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, audioCtx.currentTime);
    o.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.25);
    g.gain.value = 0.25;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.25);
}

// Add this function after playBoomSound:
function playPowerupSound() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(660, audioCtx.currentTime);
    o.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.12);
    g.gain.value = 0.35; // Increased gain
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.15);
}

// Add this function after playPowerupSound:
function playLaserSound() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1800, audioCtx.currentTime);
    o.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.25);
    g.gain.value = 0.35;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.25);
}

// Add this near the top of the file, after audioCtx is defined:
window.addEventListener('keydown', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});
window.addEventListener('mousedown', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}); 