/**
 * Frontend chess game client with Socket.IO integration.
 * Handles real-time multiplayer chess gameplay.
 */

// Initialize Socket.IO connection
const socket = io("https://simple-chess.onrender.com", {
    transports: ["websocket"],
    reconnection: true
  });
  
  
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
  
  // Determine if current player is black (for board orientation)
  function isPlayerBlack() {
      const players = [whiteName.textContent, blackName.textContent].filter(p => p !== '-');
      if (players.length < 2) return false;
      const playerIndex = players.indexOf(currentUsername);
      return playerIndex === 1; // Second player is black
  }
  
  // Render chessboard
  function renderBoard() {
      const chessboard = document.getElementById('chessboard');
      chessboard.innerHTML = '';
      
      const boardState = game.board();
      const isBlack = isPlayerBlack();
      
      // Determine rank and file order based on player color
      // boardState[0] is Rank 8, boardState[7] is Rank 1
      const rankIndices = isBlack ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
      const fileIndices = isBlack ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
      
      for (let r = 0; r < 8; r++) {
          const rankIdx = rankIndices[r];
          for (let f = 0; f < 8; f++) {
              const fileIdx = fileIndices[f];
              
              const square = document.createElement('div');
              square.className = 'square';
              
              // Determine square color
              // In 0-indexed board from top-left (a8):
              // (0,0) is Light. (0,1) is Dark.
              // So (rankIdx + fileIdx) is even -> Light.
              const isLight = (rankIdx + fileIdx) % 2 === 0;
              square.classList.add(isLight ? 'light-square' : 'dark-square');
              
              // Set data attribute (algebraic notation)
              // rankIdx 0 -> Rank 8. rankIdx 7 -> Rank 1.
              const rankLabel = 8 - rankIdx;
              const fileLabel = String.fromCharCode(97 + fileIdx);
              square.dataset.square = fileLabel + rankLabel;
              
              const piece = boardState[rankIdx][fileIdx];
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
          clearSelection();
          return;
      }
      
      // Check if it's the player's turn
      const isWhiteTurn = game.turn() === 'w';
      const players = [whiteName.textContent, blackName.textContent].filter(p => p !== '-');
      if (players.length < 2) {
          showError('Waiting for opponent');
          return;
      }
      
      const playerIndex = players.indexOf(currentUsername);
      const isPlayerWhite = (playerIndex === 0);
      
      // Prevent moves when it's not the player's turn
      if (isPlayerWhite !== isWhiteTurn) {
          showError('Not your turn!');
          clearSelection();
          return;
      }
      
      // Check if clicking on own piece when selecting
      const boardState = game.board();
      const squareFile = square.charCodeAt(0) - 97;
      // Convert algebraic rank (1-8) to board index (7-0)
      const squareRank = 8 - parseInt(square[1]);
      const piece = boardState[squareRank][squareFile];
      
      // If a square is already selected, try to make a move
      if (selectedSquare) {
          if (selectedSquare === square) {
              // Deselect
              clearSelection();
              return;
          }
          
          // Check for valid move without mutating state
          const possibleMoves = game.moves({ square: selectedSquare, verbose: true });
          const isMove = possibleMoves.find(m => m.to === square);
          
          if (isMove) {
              // Valid move - send to server (don't update local game yet)
              sendMoveToServer(selectedSquare, square);
              clearSelection();
          } else {
              // Invalid move - try to select new square if it's a piece of the right color
              if (piece && ((piece.color === 'w' && isPlayerWhite) || (piece.color === 'b' && !isPlayerWhite))) {
                  clearSelection();
                  selectSquare(square);
              } else {
                  clearSelection();
                  showError('Invalid move');
              }
          }
      } else {
          // Select square only if it's the player's piece
          if (piece && ((piece.color === 'w' && isPlayerWhite) || (piece.color === 'b' && !isPlayerWhite))) {
              selectSquare(square);
          } else if (piece) {
              showError('Not your piece!');
          }
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
  function sendMoveToServer(from, to) {
      if (!game) return;
      
      // Construct UCI move (e.g., "e2e4" or "e7e8q" for promotion)
      let moveUci = from + to;
      
      // Check if promotion is needed (pawn reaching last rank)
      const boardState = game.board();
      const fromFile = from.charCodeAt(0) - 97;
      // Convert algebraic rank (1-8) to board index (7-0)
      const fromRank = 8 - parseInt(from[1]);
      const piece = boardState[fromRank][fromFile];
      
      if (piece && piece.type === 'p') {
          const toRank = parseInt(to[1]) - 1;
          if ((piece.color === 'w' && toRank === 7) || (piece.color === 'b' && toRank === 0)) {
              moveUci += 'q'; // Auto-promote to queen
          }
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
          const response = await fetch('https://simple-chess.onrender.com/api/rooms');
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
  
