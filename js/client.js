// --- CONFIGURATION ---
// Replace with your actual Render URL
const BACKEND_URL = "https://budallas-backend.onrender.com"; 

const socket = io(BACKEND_URL, { 
    transports: ["websocket"],
    cors: { origin: "*" }
});

// --- STATE MANAGEMENT ---
let gameState = null;
let myName = "";
let myRoom = "";
let selectedHandCard = null;
let selectedTableCard = null;

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
    statDefender: document.getElementById('stat-defender')
};

// --- LOGIN EVENTS ---
ui.btnJoin.addEventListener('click', () => {
    const name = ui.nameInput.value.trim();
    const room = ui.roomInput.value.trim().toLowerCase(); 
    
    if (!name || !room) return alert("Please enter both Name and Room ID");
    
    myName = name;
    myRoom = room;
    
    screens.login.classList.add('hidden');
    screens.lobby.classList.remove('hidden');
    ui.lobbyRoomName.innerText = `Room: ${myRoom}`;

    socket.emit('join_game', { 
        room: room, 
        name: name, 
        userId: myUserId 
    });
});

// --- LOBBY EVENTS ---
socket.on('lobby_update', (data) => {
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
    
    // Switch screens if needed
    if (!screens.lobby.classList.contains('hidden') || !screens.gameOver.classList.contains('hidden')) {
        screens.lobby.classList.add('hidden');
        screens.gameOver.classList.add('hidden');
        screens.game.classList.remove('hidden');
    }
    
    renderGame();
});

socket.on('game_over', (data) => {
    // Show the custom Game Over screen
    ui.gameOverMsg.innerText = data.message;
    screens.gameOver.classList.remove('hidden');
});

socket.on('error', (data) => {
    console.error(data);
    alert("Error: " + data.message);
});

// --- ACTIONS (Global for HTML onclick) ---

window.restartGame = function() {
    if (confirm("Are you sure you want to restart the game for everyone?")) {
        socket.emit('restart_game', {});
        // Hide game over screen immediately to prevent double clicks
        screens.gameOver.classList.add('hidden');
    }
};

window.attemptAction = function(action) {
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
    // Clear visual selection classes immediately
    document.querySelectorAll('.card').forEach(c => c.classList.remove('selected-hand', 'selected-target'));
    renderGame();
}

// --- RENDERING ---

function renderGame() {
    if (!gameState) return;

    // 1. HEADER INFO
    ui.trumpContainer.innerHTML = '';
    if (gameState.trump_card) {
        ui.trumpContainer.appendChild(createCardElement(gameState.trump_card));
    } else {
        // If deck is empty/trump taken, show the suit symbol
        ui.trumpContainer.innerText = gameState.trump_suit || "";
    }

    ui.deckCount.innerText = gameState.deck_count;
    ui.statAttacker.innerText = gameState.active_attacker_name || '-';
    ui.statDefender.innerText = gameState.defender_name || '-';

    // Status Message
    let statusText = "";
    if (gameState.active_attacker_name === myName) statusText = "Your Turn to ATTACK";
    else if (gameState.defender_name === myName) statusText = "DEFEND YOURSELF";
    else statusText = `${gameState.active_attacker_name} is attacking...`;
    
    ui.status.innerText = statusText;
    ui.status.classList.remove('hidden');

    renderOpponents();
    renderTable();
    renderHand();
}

function renderOpponents() {
    ui.opponents.innerHTML = '';
    gameState.players.forEach(p => {
        if (p.is_me) return;
        
        const el = document.createElement('div');
        // Highlight active players
        const isActive = (gameState.active_attacker_name === p.name || gameState.defender_name === p.name);
        el.className = `opponent-card ${isActive ? 'active' : ''}`;
        
        el.innerHTML = `
            <div class="opponent-avatar">${p.name.charAt(0).toUpperCase()}</div>
            <div style="font-size:0.8rem; color:white; margin-top:5px; font-weight:600; text-shadow:0 1px 2px black;">${p.name}</div>
            <div style="font-size:0.7rem; color:#cbd5e1; text-shadow:0 1px 2px black;">${p.card_count} cards</div>
        `;
        ui.opponents.appendChild(el);
    });
}

function renderTable() {
    ui.table.innerHTML = '';
    const defCards = gameState.table_defense || []; // These come in pairs: [Attack, Defense, Attack, Defense...]
    const attCards = gameState.table_attack || [];  // Unanswered attacks

    // Render Defended Pairs
    for (let i = 0; i < defCards.length; i += 2) {
        const attackC = defCards[i];
        const defendC = defCards[i+1];
        if(!attackC || !defendC) continue;

        const group = document.createElement('div');
        group.className = 'card-group pair'; // 'pair' class can add overlap styling in CSS
        
        const aEl = createCardElement(attackC);
        aEl.classList.add('beaten'); // Optional styling for beaten cards
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
            // Only defender needs to click table cards
            if (gameState.defender_name !== myName) return;
            selectedTableCard = (selectedTableCard && isSameCard(card, selectedTableCard)) ? null : card;
            renderGame(); // Re-render to update selection
        };

        group.appendChild(cardEl);
        ui.table.appendChild(group);
    });
}

function renderHand() {
    const me = gameState.players.find(p => p.is_me);
    ui.hand.innerHTML = '';
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
    
    // Handle display string parsing safely
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