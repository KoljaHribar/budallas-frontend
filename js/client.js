// --- CONFIGURATION ---
const BACKEND_URL = "https://budallas-backend.onrender.com"; 

const socket = io(BACKEND_URL, { 
    transports: ["websocket"],
    cors: { origin: "*" }
});

socket.on('connect', () => {
    console.log("🟢 FRONTEND: Successfully connected to the backend server!");
});

socket.on('connect_error', (err) => {
    console.error("🔴 FRONTEND: Connection Error:", err);
});

// --- STATE MANAGEMENT ---
let gameState = null;
let myName = "";
let myRoom = "";
let selectedHandCard = null;
let selectedTableCard = null;
let amISpectator = false; // Track if I am watching

// --- USER ID LOGIC (Reconnection Support) ---
let myUserId = localStorage.getItem("budallas_userId");
if (!myUserId) {
    myUserId = crypto.randomUUID(); 
    localStorage.setItem("budallas_userId", myUserId);
}

// --- UI REFERENCES ---
const screens = {
    login: document.getElementById('login-overlay'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-interface'),
    gameOver: document.getElementById('game-over-screen')
};

const ui = {
    nameInput: document.getElementById('username'),
    roomInput: document.getElementById('room'),
    btnJoin: document.getElementById('btn-join'),
    
    lobbyRoomName: document.getElementById('lobby-room-name'),
    lobbyList: document.getElementById('lobby-player-list'),
    lobbyStatus: document.getElementById('lobby-status-text'),
    btnStart: document.getElementById('btn-start-game'),

    hand: document.getElementById('my-hand'),
    table: document.getElementById('battlefield'),
    opponents: document.getElementById('opponents-container'),
    status: document.getElementById('status-message'),
    gameOverMsg: document.getElementById('game-over-message'),
    
    trumpContainer: document.getElementById('trump-card-container'),
    deckCount: document.getElementById('deck-count'),
    statAttacker: document.getElementById('stat-attacker'),
    statDefender: document.getElementById('stat-defender'),

    // Chat references
    chatBtn: document.getElementById('chat-toggle-btn'),
    chatBox: document.getElementById('chat-container'),
    chatMsgs: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    chatBadge: document.getElementById('chat-badge')
};

// --- INITIALIZATION ---
// Chat button visibility logic (Standard)
ui.chatBtn.classList.add('hidden');

// --- LOGIN EVENTS ---
ui.btnJoin.addEventListener('click', () => {
    const name = ui.nameInput.value.trim();
    const room = ui.roomInput.value.trim().toLowerCase(); 
    
    if (!name || !room) return alert("Please enter both Name and Room ID");
    
    myName = name;
    myRoom = room;
    
    screens.login.classList.add('hidden');
    screens.lobby.classList.remove('hidden');
    
    // Show chat in lobby
    ui.chatBtn.classList.remove('hidden');

    ui.lobbyRoomName.innerText = `Room: ${myRoom}`;

    socket.emit('join_game', { 
        room: room, 
        name: name, 
        userId: myUserId 
    });
});

// --- LOBBY EVENTS ---
socket.on('lobby_update', (data) => {
    console.log("🔵 FRONTEND: Received lobby data from server:", data);
    const players = data.players || [];
    ui.lobbyList.innerHTML = '';
    players.forEach(pName => {
        const li = document.createElement('li');
        li.innerText = pName === myName ? `${pName} (You)` : pName;
        ui.lobbyList.appendChild(li);
    });

    // Show start button if enough players
    if (players.length >= 2) {
        ui.btnStart.classList.remove('hidden');
        ui.lobbyStatus.innerText = "Ready to begin.";
    } else {
        ui.btnStart.classList.add('hidden');
        ui.lobbyStatus.innerText = "Waiting for more players...";
    }
});

ui.btnStart.addEventListener('click', () => {
    socket.emit('start_game', {});
});

// --- GAME LOGIC ---

socket.on('game_update', (state) => {
    gameState = state;
    amISpectator = state.is_spectator; 
    
    // Switch screens if needed
    if (!screens.lobby.classList.contains('hidden') || !screens.gameOver.classList.contains('hidden')) {
        screens.lobby.classList.add('hidden');
        screens.gameOver.classList.add('hidden');
        screens.game.classList.remove('hidden');
        
        ui.chatBtn.classList.remove('hidden');
    }
    
    renderGame();
});

socket.on('game_over', (data) => {
    ui.gameOverMsg.innerText = data.message;
    screens.gameOver.classList.remove('hidden');

    // Auto-return to lobby
    setTimeout(() => {
        returnToLobby();
    }, 5000); 
});

socket.on('error', (data) => {
    console.error(data);
    alert("Error: " + data.message);
});

// --- ACTIONS ---

window.restartGame = function() {
    if (confirm("Are you sure you want to restart the game for everyone?")) {
        socket.emit('restart_game', {});
        screens.gameOver.classList.add('hidden');
    }
};

window.returnToLobby = function() {
    screens.gameOver.classList.add('hidden');
    screens.game.classList.add('hidden');
    screens.lobby.classList.remove('hidden');
    gameState = null;
    amISpectator = false;
};

window.attemptAction = function(action) {
    if (amISpectator) return;

    if (action === 'skip') { socket.emit('skip', {}); resetSelection(); return; }
    if (action === 'take') { socket.emit('take', {}); resetSelection(); return; }

    if (['attack', 'pass'].includes(action)) {
        if (!selectedHandCard) return alert("Select a card from your hand first!");
        socket.emit(action, { rank: selectedHandCard.rank, suit: selectedHandCard.suit });
        resetSelection();
    }
    
    if (action === 'defend') {
        if (!selectedHandCard) return alert("Select a card from your hand.");
        if (!selectedTableCard) return alert("Select the attack card on the table.");
        socket.emit('defend', {
            attack_rank: selectedTableCard.rank,
            attack_suit: selectedTableCard.suit,
            defend_rank: selectedHandCard.rank,
            defend_suit: selectedHandCard.suit
        });
        resetSelection();
    }
};

function resetSelection() {
    selectedHandCard = null;
    selectedTableCard = null;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('selected-hand', 'selected-target'));
    renderGame();
}

// --- RENDERING ---

function renderGame() {
    if (!gameState) return;

    // 1. TRUMP & DECK (Original Simple Logic)
    ui.trumpContainer.innerHTML = '';
    ui.deckCount.innerText = gameState.deck_count;
    ui.deckCount.style.color = '#cbd5e1'; // Reset color

    if (gameState.trump_card) {
        // Just render the trump card, no deck pile, no special stacking
        const trumpEl = createCardElement(gameState.trump_card);
        ui.trumpContainer.appendChild(trumpEl);
    } else {
        ui.trumpContainer.innerText = gameState.trump_suit || "";
        ui.trumpContainer.style.fontSize = "3rem";
        ui.trumpContainer.style.opacity = "0.3";
    }

    // Player Status
    ui.statAttacker.innerText = gameState.active_attacker_name || '-';
    ui.statDefender.innerText = gameState.defender_name || '-';

    // Status Message
    if (amISpectator) {
        ui.status.innerText = "YOU WON! SPECTATOR MODE";
        ui.status.style.background = "#10b981"; 
        ui.status.classList.remove('hidden');
    } else {
        let statusText = "";
        if (gameState.active_attacker_name === myName) statusText = "Your Turn to ATTACK";
        else if (gameState.defender_name === myName) statusText = "DEFEND YOURSELF";
        else statusText = `${gameState.active_attacker_name} is attacking...`;
        
        ui.status.innerText = statusText;
        ui.status.style.background = "#fbbf24"; 
        ui.status.classList.remove('hidden');
    }

    renderOpponents();
    renderTable();
    renderHand();
}

function renderOpponents() {
    ui.opponents.innerHTML = '';
    gameState.players.forEach(p => {
        if (p.is_me) return;
        
        const el = document.createElement('div');
        const isWinner = gameState.winners && gameState.winners.includes(p.name);
        const isActive = (gameState.active_attacker_name === p.name || gameState.defender_name === p.name);
        
        el.className = `opponent-card ${isActive ? 'active' : ''} ${isWinner ? 'winner-glow' : ''}`;
        
        let htmlContent = `
            <div class="opponent-avatar">${p.name.charAt(0).toUpperCase()}</div>
            <div style="font-size:0.8rem; color:white; margin-top:5px; font-weight:600; text-shadow:0 1px 2px black;">${p.name}</div>
        `;

        if (isWinner) {
             htmlContent += `<div style="color:#fbbf24; font-size:0.7rem; font-weight:bold;">🏆 WINNER</div>`;
        } else {
             htmlContent += `<div style="font-size:0.7rem; color:#cbd5e1; text-shadow:0 1px 2px black;">${p.card_count} cards</div>`;
        }

        if (amISpectator && p.hand && p.hand.length > 0) {
            htmlContent += `<div class="spectator-hand-view">`;
            p.hand.forEach(c => {
                 const isRed = ['♥', '♦'].includes(c.suit);
                 htmlContent += `<span style="color:${isRed ? '#ff6b6b' : '#a0aec0'}; margin-right:4px; font-weight:bold;">${c.display}</span>`;
            });
            htmlContent += `</div>`;
        }

        el.innerHTML = htmlContent;
        ui.opponents.appendChild(el);
    });
}

function renderTable() {
    ui.table.innerHTML = '';
    const defCards = gameState.table_defense || []; 
    const attCards = gameState.table_attack || [];

    // Render Defended Pairs
    for (let i = 0; i < defCards.length; i += 2) {
        const attackC = defCards[i];
        const defendC = defCards[i+1];
        if(!attackC || !defendC) continue;

        const group = document.createElement('div');
        group.className = 'card-group pair'; 
        
        const aEl = createCardElement(attackC);
        aEl.classList.add('beaten'); 
        group.appendChild(aEl);
        
        const dEl = createCardElement(defendC);
        dEl.classList.add('defender-card');
        group.appendChild(dEl);
        
        ui.table.appendChild(group);
    }

    // Render Active Attacks
    attCards.forEach(card => {
        const group = document.createElement('div');
        group.className = 'card-group';
        const cardEl = createCardElement(card);
        
        if (selectedTableCard && isSameCard(card, selectedTableCard)) {
            cardEl.classList.add('selected-target');
        }

        cardEl.onclick = () => {
            if (amISpectator || gameState.defender_name !== myName) return;
            selectedTableCard = (selectedTableCard && isSameCard(card, selectedTableCard)) ? null : card;
            renderGame(); 
        };

        group.appendChild(cardEl);
        ui.table.appendChild(group);
    });
}

function renderHand() {
    const me = gameState.players.find(p => p.is_me);
    ui.hand.innerHTML = '';
    
    if (amISpectator) {
        ui.hand.innerHTML = '<div style="color:rgba(255,255,255,0.7); font-style:italic;">You have finished the game. Enjoy the show!</div>';
        return;
    }

    if (!me || !me.hand) return;

    me.hand.forEach(card => {
        const el = createCardElement(card);
        if (selectedHandCard && isSameCard(card, selectedHandCard)) {
            el.classList.add('selected-hand');
        }
        el.onclick = () => {
            selectedHandCard = (selectedHandCard && isSameCard(card, selectedHandCard)) ? null : card;
            renderGame();
        };
        ui.hand.appendChild(el);
    });
}

function createCardElement(cardData) {
    const div = document.createElement('div');
    const isRed = ['♥', '♦'].includes(cardData.suit);
    div.className = `card ${isRed ? 'red' : 'black'}`;
    
    const suitChar = cardData.suit;
    const displayStr = cardData.display || ""; 
    const rankStr = displayStr.replace(suitChar, '');

    div.innerHTML = `
        <div class="card-top">${rankStr} <small>${suitChar}</small></div>
        <div class="card-center" style="font-size:2rem">${suitChar}</div>
        <div class="card-bottom" style="transform:rotate(180deg)">${rankStr} <small>${suitChar}</small></div>
    `;
    return div;
}

function isSameCard(c1, c2) {
    return c1 && c2 && c1.rank === c2.rank && c1.suit === c2.suit;
}

// --- RULES MODAL LOGIC ---
window.toggleRules = function(show) {
    const el = document.getElementById('rules-overlay');
    if (show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
};

// --- CHAT LOGIC ---
let isChatOpen = false;
let unreadCount = 0;

window.toggleChat = function() {
    isChatOpen = !isChatOpen;
    const chatBox = document.getElementById('chat-container');
    const badge = document.getElementById('chat-badge');
    
    if (isChatOpen) {
        chatBox.classList.remove('hidden');
        unreadCount = 0;
        badge.innerText = "0";
        badge.classList.add('hidden');
        setTimeout(() => document.getElementById('chat-input').focus(), 100);
    } else {
        chatBox.classList.add('hidden');
    }
};

window.sendChat = function() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    socket.emit('send_chat', {
        message: msg,
        name: myName, 
        room: myRoom
    });
    
    input.value = ""; 
};

window.handleChatKey = function(e) {
    if (e.key === 'Enter') sendChat();
};

socket.on('receive_chat', (data) => {
    const chatBox = document.getElementById('chat-messages');
    const msgElement = document.createElement('div');
    
    const isMe = (data.name === myName);
    
    msgElement.style.display = "flex";
    msgElement.style.flexDirection = "column";
    msgElement.style.alignItems = isMe ? "flex-end" : "flex-start";
    
    // Simple chat without extra bubble styling
    msgElement.innerHTML = `
        <span class="chat-name">${isMe ? "You" : data.name}</span>
        <div class="chat-msg ${isMe ? "my-msg" : "their-msg"}">${data.message}</div>
    `;
    
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight; 

    if (!isChatOpen) {
        unreadCount++;
        const badge = document.getElementById('chat-badge');
        badge.innerText = unreadCount;
        badge.classList.remove('hidden');
    }
});

window.leaveRoom = function() {
    if (confirm("Are you sure you want to leave the room?")) {
        // 1. Tell the server
        socket.emit('leave_game', {});
        
        // 2. Reset local variables
        gameState = null;
        myName = "";
        myRoom = "";
        
        // 3. Switch back to login screen
        screens.game.classList.add('hidden');
        screens.lobby.classList.add('hidden');
        screens.gameOver.classList.add('hidden');
        screens.login.classList.remove('hidden');
        
        // Hide chat
        ui.chatBtn.classList.add('hidden');
        document.getElementById('chat-container').classList.add('hidden');
    }
};