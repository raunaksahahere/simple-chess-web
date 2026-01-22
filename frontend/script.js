/**
 * Frontend chess game client with Socket.IO integration.
 * Handles real-time multiplayer chess gameplay.
 */

// Initialize Socket.IO connection
const socket = io('http://localhost:8000');

// Game state
let game = null;
let currentUsername = '';
let currentRoomId = '';
let selectedSquare = null;
let board = null;

// DOM elements
const lobbyPanel = document.getElementById('lobby');
const gamePanel = document.getElementById('game');
const loadingPanel = document.getElementById('loading');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('roomId');
const joinBtn = document.getElementById('joinBtn');
const randomRoomBtn = document.getElementById('randomRoomBtn');
const leaveBtn = document.getElementById('leaveBtn');
const lobbyStatus = document.getElementById('lobbyStatus');
const gameStatus = document.getElementById('gameStatus');
const loadingText = document.getElementById('loadingText');
const whiteName = document.getElementById('whiteName');
const blackName = document.getElementById('blackName');
const currentTurn = document.getElementById('currentTurn');
const movesList = document.getElementById('movesList');
const errorDiv = document.getElementById('error');

// Chess piece Unicode characters
const pieces = {
    'wP': '♙', 'wR': '♖', 'wN': '♘', 'wB': '♗', 'wQ': '♕', 'wK': '♔',
    'bP': '♟', 'bR': '♜', 'bN': '♞', 'bB': '♝', 'bQ': '♛', 'bK': '♚'
};

// Initialize chess.js game
function initGame() {
    game = new Chess();
    renderBoard();
}

// Render chessboard
function renderBoard() {
    const chessboard = document.getElementById('chessboard');
    chessboard.innerHTML = '';
    
    const boardState = game.board();
    
    for (let rank = 7; rank >= 0; rank--) {
        for (let file = 0; file < 8; file++) {
            const square = document.createElement('div');
            square.className = 'square';
            square.classList.add((rank + file) % 2 === 0 ? 'light-square' : 'dark-square');
            square.dataset.square = String.fromCharCode(97 + file) + (rank + 1);
            
            const piece = boardState[rank][file];
            if (piece) {
                const pieceSymbol = pieces[piece.color + piece.type.toUpperCase()];
                square.textContent = pieceSymbol;
            }
            
            square.addEventListener('click', () => handleSquareClick(square.dataset.square));
            chessboard.appendChild(square);
        }
    }
    
    board = chessboard;
}

// Handle square click
function handleSquareClick(square) {
    if (!game || currentUsername === '') return;
    
    // Disable manual input for "Raunak" - AI handles all moves automatically
    if (currentUsername.toLowerCase() === 'raunak') {
        showError('AI is playing automatically. Please wait for your move.');
        return;
    }
    
    // Check if it's the player's turn
    const isWhiteTurn = game.turn() === 'w';
    const players = [whiteName.textContent, blackName.textContent].filter(p => p !== '-');
    const playerIndex = players.indexOf(currentUsername);
    const isPlayerWhite = (playerIndex === 0);
    
    if (isPlayerWhite !== isWhiteTurn) {
        showError('Not your turn!');
        return;
    }
    
    // If a square is already selected, try to make a move
    if (selectedSquare) {
        if (selectedSquare === square) {
            // Deselect
            clearSelection();
            return;
        }
        
        // Try to make move
        const move = game.move({
            from: selectedSquare,
            to: square,
            promotion: 'q' // Auto-promote to queen
        });
        
        if (move) {
            // Valid move - send to server
            sendMoveToServer();
            clearSelection();
        } else {
            // Invalid move - select new square
            clearSelection();
            selectSquare(square);
        }
    } else {
        // Select square
        selectSquare(square);
    }
}

// Select a square
function selectSquare(square) {
    clearSelection();
    selectedSquare = square;
    
    const squareEl = board.querySelector(`[data-square="${square}"]`);
    if (squareEl) {
        squareEl.classList.add('selected');
        
        // Highlight possible moves
        const moves = game.moves({ square: square, verbose: true });
        moves.forEach(move => {
            const targetSquare = board.querySelector(`[data-square="${move.to}"]`);
            if (targetSquare) {
                targetSquare.classList.add('possible-move');
            }
        });
    }
}

// Clear selection
function clearSelection() {
    selectedSquare = null;
    const squares = board.querySelectorAll('.square');
    squares.forEach(sq => {
        sq.classList.remove('selected', 'possible-move');
    });
}

// Send move to server
function sendMoveToServer() {
    if (!game) return;
    
    const history = game.history({ verbose: true });
    const lastMove = history[history.length - 1];
    
    if (!lastMove) return;
    
    // Construct UCI move (e.g., "e2e4" or "e7e8q" for promotion)
    let moveUci = lastMove.from + lastMove.to;
    if (lastMove.promotion) {
        moveUci += lastMove.promotion.toLowerCase();
    }
    
    socket.emit('player_move', {
        username: currentUsername,
        room_id: currentRoomId,
        fen: game.fen(),
        move_uci: moveUci
    });
}

// Update board from FEN
function updateBoardFromFEN(fen) {
    if (!game) return;
    
    game.load(fen);
    renderBoard();
    updateUI();
}

// Update UI elements
function updateUI() {
    if (!game) return;
    
    // Update turn indicator
    const isWhiteTurn = game.turn() === 'w';
    const turnIndicator = document.querySelector('.turn-indicator');
    turnIndicator.className = 'turn-indicator ' + (isWhiteTurn ? 'white-turn' : 'black-turn');
    currentTurn.textContent = isWhiteTurn ? 'White to move' : 'Black to move';
    
    // Update move history
    const history = game.history();
    movesList.innerHTML = '';
    for (let i = 0; i < history.length; i += 2) {
        const moveDiv = document.createElement('div');
        moveDiv.className = 'move-item';
        const whiteMove = history[i] || '-';
        const blackMove = history[i + 1] || '-';
        moveDiv.textContent = `${Math.floor(i / 2) + 1}. ${whiteMove} ${blackMove}`;
        movesList.appendChild(moveDiv);
    }
}

// Show error message
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

// Show loading screen
function showLoading(message = 'Connecting to game server...') {
    loadingText.textContent = message;
    lobbyPanel.classList.add('hidden');
    gamePanel.classList.add('hidden');
    loadingPanel.classList.remove('hidden');
}

// Hide loading screen
function hideLoading() {
    loadingPanel.classList.add('hidden');
}

// Get random room
async function getRandomRoom() {
    try {
        const response = await fetch('http://localhost:8000/api/rooms');
        const data = await response.json();
        
        if (data.rooms && data.rooms.length > 0) {
            // Pick a random room from available rooms
            const randomRoom = data.rooms[Math.floor(Math.random() * data.rooms.length)];
            return randomRoom.room_id;
        } else {
            // No available rooms, generate a random room ID
            return 'room' + Math.floor(Math.random() * 10000);
        }
    } catch (error) {
        console.error('Error fetching rooms:', error);
        // Fallback: generate random room ID
        return 'room' + Math.floor(Math.random() * 10000);
    }
}

// Join room
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim() || 'default';
    
    if (!username) {
        showError('Please enter a username');
        return;
    }
    
    currentUsername = username;
    currentRoomId = roomId;
    
    // Show loading screen
    showLoading('Joining room...');
    
    socket.emit('join_room', {
        username: username,
        room_id: roomId
    });
});

// Random room button
randomRoomBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showError('Please enter a username first');
        usernameInput.focus();
        return;
    }
    
    randomRoomBtn.disabled = true;
    randomRoomBtn.textContent = '🔄 Finding...';
    
    try {
        const randomRoomId = await getRandomRoom();
        roomIdInput.value = randomRoomId;
        
        currentUsername = username;
        currentRoomId = randomRoomId;
        
        // Show loading screen
        showLoading(`Joining room ${randomRoomId}...`);
        
        socket.emit('join_room', {
            username: username,
            room_id: randomRoomId
        });
    } catch (error) {
        showError('Failed to find a room. Please try again.');
        console.error('Error:', error);
    } finally {
        randomRoomBtn.disabled = false;
        randomRoomBtn.textContent = '🎲 Random';
    }
});

// Leave game
leaveBtn.addEventListener('click', () => {
    socket.disconnect();
    socket.connect();
    hideLoading();
    lobbyPanel.classList.remove('hidden');
    gamePanel.classList.add('hidden');
    game = null;
    currentUsername = '';
    currentRoomId = '';
    initGame();
});

// Socket.IO event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    lobbyStatus.textContent = 'Connected to server';
    lobbyStatus.style.color = 'green';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    lobbyStatus.textContent = 'Disconnected from server';
    lobbyStatus.style.color = 'red';
});

socket.on('game_state', (data) => {
    console.log('Game state received:', data);
    
    // Hide loading screen
    hideLoading();
    
    if (!game) {
        initGame();
    }
    
    // Update board from FEN
    if (data.fen) {
        updateBoardFromFEN(data.fen);
    }
    
    // Update player names
    if (data.players && data.players.length > 0) {
        whiteName.textContent = data.players[0] || '-';
        if (data.players.length > 1) {
            blackName.textContent = data.players[1] || '-';
        } else {
            blackName.textContent = '-';
        }
    }
    
    // Update game status
    if (data.status === 'ongoing') {
        if (data.players && data.players.length === 2) {
            // Check if it's Raunak's turn and show AI status
            const isWhiteTurn = data.turn === 'white';
            const players = data.players || [];
            const isRaunakTurn = (isWhiteTurn && players[0]?.toLowerCase() === 'raunak') ||
                                 (!isWhiteTurn && players[1]?.toLowerCase() === 'raunak');
            
            if (isRaunakTurn && currentUsername.toLowerCase() === 'raunak') {
                gameStatus.textContent = 'AI is calculating your move...';
                gameStatus.style.color = '#28a745';
            } else {
                gameStatus.textContent = 'Game in progress';
                gameStatus.style.color = '#667eea';
            }
        } else {
            gameStatus.textContent = 'Waiting for opponent...';
            gameStatus.style.color = '#ffc107';
        }
    } else {
        gameStatus.textContent = `Game over: ${data.status}`;
        gameStatus.style.color = '#dc3545';
    }
    
    // Show game panel
    lobbyPanel.classList.add('hidden');
    gamePanel.classList.remove('hidden');
});

socket.on('move_update', (data) => {
    console.log('Move update received:', data);
    
    if (data.fen) {
        updateBoardFromFEN(data.fen);
    }
});

socket.on('player_joined', (data) => {
    console.log('Player joined:', data);
    gameStatus.textContent = 'Game in progress';
    gameStatus.style.color = '#667eea';
    
    if (data.players && data.players.length > 1) {
        blackName.textContent = data.players[1] || '-';
    }
});

socket.on('opponent_disconnected', () => {
    showError('Opponent disconnected');
    gameStatus.textContent = 'Opponent disconnected';
    gameStatus.style.color = '#dc3545';
});

socket.on('error', (data) => {
    console.error('Server error:', data);
    showError(data.message || 'An error occurred');
    // Hide loading screen on error
    hideLoading();
    lobbyPanel.classList.remove('hidden');
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    
    // Allow Enter key to join
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
    
    roomIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
});
