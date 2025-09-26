// Game client JavaScript
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // WebSocket connection
        this.ws = null;
        this.serverUrl = 'wss://codepath-mmorg.onrender.com';
        this.connected = false;
        
        // Player data
        this.myPlayerId = null;
        this.myPlayer = null;
        this.players = new Map(); // playerId -> player data
        this.avatars = new Map(); // avatarName -> avatar data
        this.avatarImages = new Map(); // avatarName -> loaded Image objects
        
        // Viewport/camera
        this.viewportX = 0;
        this.viewportY = 0;
        
        // Rendering
        this.avatarSize = 32; // Base avatar size
        this.needsRedraw = true;
        
        // Movement
        this.pressedKeys = new Set();
        this.isMoving = false;
        this.isRunning = false; // Speed toggle
        
        // Loading state
        this.loadingProgress = 0;
        this.loadingSteps = [
            'Connecting to server...',
            'Loading world map...',
            'Joining game...',
            'Loading avatars...',
            'Ready!'
        ];
        this.currentLoadingStep = 0;
        
        // Mini-map
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.minimapScale = 0.1; // Scale factor for mini-map
        
        this.init();
    }
    
    init() {
        // Set canvas size to fill the browser window
        this.resizeCanvas();
        
        // Start loading sequence
        this.startLoading();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Handle keyboard input
        this.setupKeyboardControls();
        
        // Start rendering loop
        this.startRenderLoop();
    }
    
    // Loading system
    startLoading() {
        this.updateLoadingProgress(0, 'Connecting to server...');
        
        // Load world map
        this.loadWorldMap();
        
        // Connect to game server
        this.connectToServer();
    }
    
    updateLoadingProgress(progress, text) {
        this.loadingProgress = progress;
        document.querySelector('.loading-text').textContent = text;
        document.querySelector('.progress-bar').style.width = `${progress}%`;
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        const gameUI = document.getElementById('gameUI');
        
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            gameUI.style.display = 'block';
        }, 500);
    }
    
    resizeCanvas() {
        // Set canvas size to match the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Resize mini-map canvas
        this.minimapCanvas.width = 200;
        this.minimapCanvas.height = 200;
        
        // Update viewport if we have a player
        if (this.myPlayer) {
            this.updateViewport();
        }
        
        this.needsRedraw = true;
    }
    
    loadWorldMap() {
        this.updateLoadingProgress(20, 'Loading world map...');
        
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            console.log('World map loaded successfully');
            this.updateLoadingProgress(40, 'World map loaded!');
            this.needsRedraw = true;
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
            this.drawError();
        };
        this.worldImage.src = 'world.jpg';
    }
    
    // WebSocket connection methods
    connectToServer() {
        try {
            this.ws = new WebSocket(this.serverUrl);
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.connected = true;
                this.updateLoadingProgress(60, 'Connected! Joining game...');
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.connected = false;
                // Attempt to reconnect after 3 seconds
                setTimeout(() => this.connectToServer(), 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }
    
    joinGame() {
        if (!this.connected) return;
        
        const message = {
            action: 'join_game',
            username: 'Tim'
        };
        
        this.ws.send(JSON.stringify(message));
        console.log('Sent join_game message');
    }
    
    // Keyboard controls
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
    }
    
    handleKeyDown(event) {
        // Handle speed toggle
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            this.toggleSpeed();
            return;
        }
        
        // Prevent default behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
        }
        
        // Only process if we haven't already processed this key
        if (this.pressedKeys.has(event.code)) {
            return;
        }
        
        this.pressedKeys.add(event.code);
        this.updateMovement();
    }
    
    handleKeyUp(event) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
        }
        
        this.pressedKeys.delete(event.code);
        this.updateMovement();
    }
    
    toggleSpeed() {
        this.isRunning = !this.isRunning;
        const speedIndicator = document.getElementById('speedIndicator');
        const speedText = document.getElementById('speedText');
        
        if (this.isRunning) {
            speedIndicator.classList.add('running');
            speedText.textContent = 'Run';
        } else {
            speedIndicator.classList.remove('running');
            speedText.textContent = 'Walk';
        }
        
        console.log('Speed mode:', this.isRunning ? 'Run' : 'Walk');
    }
    
    updateMovement() {
        const directions = this.getMovementDirections();
        
        if (directions.length > 0) {
            // Send move command for the first direction (prioritize first pressed key)
            this.sendMoveCommand(directions[0]);
            this.isMoving = true;
            
            // Update player facing direction for immediate visual feedback
            this.updatePlayerFacing(directions[0]);
            
            // Update viewport immediately for responsive feel
            this.updateViewport();
        } else {
            // No keys pressed, send stop command
            this.sendStopCommand();
            this.isMoving = false;
        }
    }
    
    updatePlayerFacing(direction) {
        if (!this.myPlayer) return;
        
        // Update facing direction for immediate visual feedback
        const directionMap = {
            'up': 'north',
            'down': 'south',
            'left': 'west',
            'right': 'east'
        };
        
        this.myPlayer.facing = directionMap[direction];
        this.needsRedraw = true;
    }
    
    getMovementDirections() {
        const directions = [];
        
        if (this.pressedKeys.has('ArrowUp')) directions.push('up');
        if (this.pressedKeys.has('ArrowDown')) directions.push('down');
        if (this.pressedKeys.has('ArrowLeft')) directions.push('left');
        if (this.pressedKeys.has('ArrowRight')) directions.push('right');
        
        return directions;
    }
    
    sendMoveCommand(direction) {
        if (!this.connected) return;
        
        const message = {
            action: 'move',
            direction: direction
        };
        
        this.ws.send(JSON.stringify(message));
        console.log('Sent move command:', direction);
    }
    
    sendStopCommand() {
        if (!this.connected) return;
        
        const message = {
            action: 'stop'
        };
        
        this.ws.send(JSON.stringify(message));
        console.log('Sent stop command');
    }
    
    // Message handling
    handleMessage(data) {
        console.log('Received message:', data);
        
        switch (data.action) {
            case 'join_game':
                this.handleJoinGame(data);
                break;
            case 'players_moved':
                this.handlePlayersMoved(data);
                break;
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;
            case 'player_left':
                this.handlePlayerLeft(data);
                break;
            default:
                console.log('Unknown message type:', data.action);
        }
    }
    
    handleJoinGame(data) {
        if (data.success) {
            this.myPlayerId = data.playerId;
            this.myPlayer = data.players[data.playerId];
            
            // Store all players
            this.players.clear();
            for (const [playerId, player] of Object.entries(data.players)) {
                this.players.set(playerId, player);
            }
            
            // Store avatar data
            this.avatars.clear();
            for (const [avatarName, avatar] of Object.entries(data.avatars)) {
                this.avatars.set(avatarName, avatar);
                this.loadAvatarImages(avatarName, avatar);
            }
            
            console.log('Joined game successfully. My player:', this.myPlayer);
            this.updateViewport();
            this.needsRedraw = true;
            
            // Complete loading
            this.updateLoadingProgress(100, 'Ready!');
            setTimeout(() => this.hideLoadingScreen(), 1000);
        } else {
            console.error('Failed to join game:', data.error);
        }
    }
    
    handlePlayersMoved(data) {
        for (const [playerId, player] of Object.entries(data.players)) {
            this.players.set(playerId, player);
        }
        this.needsRedraw = true;
    }
    
    handlePlayerJoined(data) {
        this.players.set(data.player.id, data.player);
        this.avatars.set(data.avatar.name, data.avatar);
        this.loadAvatarImages(data.avatar.name, data.avatar);
        this.needsRedraw = true;
    }
    
    handlePlayerLeft(data) {
        this.players.delete(data.playerId);
        this.needsRedraw = true;
    }
    
    // Avatar image loading
    loadAvatarImages(avatarName, avatarData) {
        const imagePromises = [];
        
        for (const [direction, frames] of Object.entries(avatarData.frames)) {
            for (let i = 0; i < frames.length; i++) {
                const imageKey = `${avatarName}_${direction}_${i}`;
                if (!this.avatarImages.has(imageKey)) {
                    const promise = this.loadImage(frames[i]).then(img => {
                        this.avatarImages.set(imageKey, img);
                    });
                    imagePromises.push(promise);
                }
            }
        }
        
        Promise.all(imagePromises).then(() => {
            this.needsRedraw = true;
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    
    // Viewport/camera system
    updateViewport() {
        if (!this.myPlayer) return;
        
        // Center the viewport on the player
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Calculate viewport offset
        this.viewportX = this.myPlayer.x - centerX;
        this.viewportY = this.myPlayer.y - centerY;
        
        // Clamp viewport to world boundaries
        this.viewportX = Math.max(0, Math.min(this.viewportX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(this.viewportY, this.worldHeight - this.canvas.height));
    }
    
    // Coordinate transformation
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.viewportX,
            y: worldY - this.viewportY
        };
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.viewportX,
            y: screenY + this.viewportY
        };
    }
    
    // Rendering methods
    startRenderLoop() {
        const render = () => {
            if (this.needsRedraw) {
                this.render();
                this.needsRedraw = false;
            }
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
    
    render() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw world map
        this.drawWorldMap();
        
        // Draw all players
        this.drawPlayers();
        
        // Draw connection status
        this.drawConnectionStatus();
        
        // Draw mini-map
        this.drawMinimap();
    }
    
    drawWorldMap() {
        if (!this.worldImage) return;
        
        // Draw the world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewportX, this.viewportY, this.canvas.width, this.canvas.height, // Source rectangle
            0, 0, this.canvas.width, this.canvas.height // Destination rectangle
        );
    }
    
    drawPlayers() {
        for (const [playerId, player] of this.players) {
            this.drawPlayer(player);
        }
    }
    
    drawPlayer(player) {
        const screenPos = this.worldToScreen(player.x, player.y);
        
        // Check if player is visible on screen
        if (screenPos.x < -this.avatarSize || screenPos.x > this.canvas.width + this.avatarSize ||
            screenPos.y < -this.avatarSize || screenPos.y > this.canvas.height + this.avatarSize) {
            return;
        }
        
        // Draw green glow for own player
        if (player.id === this.myPlayerId) {
            this.drawPlayerGlow(screenPos.x, screenPos.y);
        }
        
        // Draw avatar
        this.drawAvatar(player, screenPos.x, screenPos.y);
        
        // Draw username label
        this.drawPlayerLabel(player.username, screenPos.x, screenPos.y);
    }
    
    drawPlayerGlow(x, y) {
        this.ctx.save();
        this.ctx.shadowColor = '#00ff00';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // Draw a circle for the glow effect
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.avatarSize / 2 + 5, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawAvatar(player, x, y) {
        const avatarData = this.avatars.get(player.avatar);
        if (!avatarData) return;
        
        const direction = player.facing;
        const frameIndex = player.animationFrame || 0;
        const imageKey = `${player.avatar}_${direction}_${frameIndex}`;
        const avatarImage = this.avatarImages.get(imageKey);
        
        if (!avatarImage) return;
        
        // Calculate avatar size maintaining aspect ratio
        const aspectRatio = avatarImage.width / avatarImage.height;
        const width = this.avatarSize;
        const height = this.avatarSize / aspectRatio;
        
        // Center the avatar
        const drawX = x - width / 2;
        const drawY = y - height / 2;
        
        // Flip horizontally for west direction
        if (direction === 'west') {
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(avatarImage, -drawX - width, drawY, width, height);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(avatarImage, drawX, drawY, width, height);
        }
    }
    
    drawPlayerLabel(username, x, y) {
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        const labelY = y - this.avatarSize / 2 - 5;
        
        // Draw text with outline
        this.ctx.strokeText(username, x, labelY);
        this.ctx.fillText(username, x, labelY);
    }
    
    drawConnectionStatus() {
        this.ctx.fillStyle = this.connected ? '#27ae60' : '#e74c3c';
        this.ctx.fillRect(10, 10, 10, 10);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(this.connected ? 'Connected' : 'Disconnected', 25, 20);
    }
    
    // Mini-map rendering
    drawMinimap() {
        if (!this.worldImage || !this.myPlayer) return;
        
        // Clear mini-map
        this.minimapCtx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
        
        // Draw world map background
        this.minimapCtx.drawImage(
            this.worldImage,
            0, 0, this.worldWidth * this.minimapScale, this.worldHeight * this.minimapScale
        );
        
        // Draw all players as dots
        for (const [playerId, player] of this.players) {
            const minimapX = player.x * this.minimapScale;
            const minimapY = player.y * this.minimapScale;
            
            this.minimapCtx.fillStyle = playerId === this.myPlayerId ? '#00ff00' : '#ff0000';
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(minimapX, minimapY, 3, 0, 2 * Math.PI);
            this.minimapCtx.fill();
        }
        
        // Draw viewport rectangle
        this.minimapCtx.strokeStyle = '#ffff00';
        this.minimapCtx.lineWidth = 2;
        this.minimapCtx.strokeRect(
            this.viewportX * this.minimapScale,
            this.viewportY * this.minimapScale,
            this.canvas.width * this.minimapScale,
            this.canvas.height * this.minimapScale
        );
    }
    
    drawError() {
        // Draw error message if world map fails to load
        this.ctx.fillStyle = '#e74c3c';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Failed to load world map', this.canvas.width / 2, this.canvas.height / 2);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});