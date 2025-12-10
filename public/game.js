const socket = io();

// ==========================================
// 1. CONFIG Y DATOS
// ==========================================
const audioFiles = {
    click: new Audio('sounds/click-345983.mp3'),
    join: new Audio('sounds/new-notification-019-363747.mp3'),
    start: new Audio('sounds/game-start-317318.mp3'),
    eject: new Audio('sounds/fatal-body-fall-thud-352716.mp3'),
    win: new Audio('sounds/level-up-04-243762.mp3')
};
function playSound(name) { try { if(audioFiles[name]) { audioFiles[name].currentTime=0; audioFiles[name].volume=0.5; audioFiles[name].play().catch(e=>{}); } } catch(e){} }

const CATEGORIES_DATA = [
    { id: 'lugares', icon: '📍', name: 'Lugares' },
    { id: 'comidas', icon: '🍔', name: 'Comidas' },
    { id: 'objetos', icon: '🛠️', name: 'Objetos' },
    { id: 'animales', icon: '🐾', name: 'Animales' },
    { id: 'profesiones', icon: '💼', name: 'Profesiones' },
    { id: 'deportes', icon: '🏆', name: 'Deportes' },
    { id: 'tecnologia', icon: '💻', name: 'Tecnología' },
    { id: 'fantasia', icon: '🧙‍♂️', name: 'Fantasía' }
];

let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);

let myId = null;
let isHost = false;
let currentRoom = null;
let currentPhase = 'lobby';
let hasSeenCard = false;
let voteLocked = false;

// ==========================================
// 2. UTILIDADES DE UI
// ==========================================
function qs(id) { return document.getElementById(id); }

function bindClick(id, handler) {
    const el = qs(id);
    if (el) el.addEventListener('click', handler);
}

function showScreen(screenId) {
    const screens = ['screenHome', 'screenCreate', 'screenJoin'];
    screens.forEach(id => { qs(id).style.display = (id === screenId ? 'flex' : 'none'); });
}

function adjustValue(inputId, delta) {
    const hidden = qs(inputId);
    if (!hidden) return;
    let val = parseInt(hidden.value) || 0;

    if (inputId === 'maxPlayers') {
        val = Math.min(15, Math.max(3, val + delta));
        hidden.value = val;
        qs('displayPlayers').innerText = val;
    } else if (inputId === 'impostors') {
        val = Math.min(4, Math.max(1, val + delta));
        hidden.value = val;
        qs('displayImpostors').innerText = val;
    } else if (inputId === 'timeVote') {
        val = Math.min(300, Math.max(60, val + delta));
        hidden.value = val;
        qs('displayVoteTime').innerText = val;
    }
}

// ==========================================
// 3. CATEGORÍAS
// ==========================================
function renderCategories() {
    const grid = qs('categoriesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    CATEGORIES_DATA.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-pill' + (selectedCategories.has(cat.id) ? ' active' : '');
        btn.innerHTML = `<span class="icon">${cat.icon}</span><span>${cat.name}</span>`;
        btn.onclick = () => {
            if (selectedCategories.has(cat.id)) {
                selectedCategories.delete(cat.id);
            } else {
                selectedCategories.add(cat.id);
            }
            if (selectedCategories.size === 0) {
                // Siempre al menos una
                selectedCategories.add(cat.id);
            }
            renderCategories();
        };
        grid.appendChild(btn);
    });
}

// ==========================================
// 4. EVENTOS INICIALES
// ==========================================
window.addEventListener('load', () => {
    renderCategories();

    bindClick('btnGoCreate', () => { showScreen('screenCreate'); playSound('click'); });
    bindClick('btnGoJoin', () => { showScreen('screenJoin'); playSound('click'); });
    bindClick('backFromCreate', () => { showScreen('screenHome'); playSound('click'); });
    bindClick('backFromJoin', () => { showScreen('screenHome'); playSound('click'); });
    
    bindClick('btnDiscordGlobal', () => window.open('https://discord.com', '_blank')); // Pon tu link real
    bindClick('btnExit', () => location.reload());
    bindClick('btnCopyCode', () => navigator.clipboard.writeText(qs('roomCodeDisplay').innerText));

    // Acciones de Juego
    bindClick('btnCreateRoom', createRoom);
    bindClick('btnJoinRoom', joinRoom);
    bindClick('btnStartRound', () => {
        if (!isHost) return;
        playSound('click');
        socket.emit('startRound');
    });
    bindClick('btnBackToLobby', () => {
        qs('ejectionOverlay').style.display = 'none';
        updateGameView(currentRoom);
    });

    const secretCard = qs('secretCard');
    if (secretCard) {
        secretCard.addEventListener('click', () => {
            if (!currentRoom || currentPhase !== 'word') return;
            secretCard.classList.add('revealed');
            hasSeenCard = true;
        });
    }
});

// ==========================================
// 5. CONEXIÓN / ROOM
// ==========================================
function createRoom() {
    if (selectedCategories.size === 0) return alert("Elige al menos una categoría.");
    playSound('click');
    socket.emit('createRoom', {
        name: qs('hostName').value || 'Agente X',
        maxPlayers: qs('maxPlayers').value,
        impostors: qs('impostors').value,
        categories: Array.from(selectedCategories),
        turnTime: 15, // Fijo en 15 para simplificar UI
        voteTime: qs('timeVote').value
    }, handleConnection);
}

function joinRoom() {
    playSound('click');
    socket.emit('joinRoom', {
        name: qs('joinName').value || 'Agente Y',
        roomCode: qs('joinCode').value
    }, handleConnection);
}

function handleConnection(res) {
    if (res.ok) {
        playSound('join');
        qs('lobbyOverlay').style.display = 'none';
        qs('mainContent').style.display = 'block';
        
        myId = res.me.id; 
        isHost = res.isHost;
        qs('roomCodeDisplay').innerText = res.roomCode;
        
        if (res.discordLink) {
            const btn = qs('btnDiscordManual');
            if (btn) {
                btn.style.display = 'flex';
                btn.onclick = () => window.open(res.discordLink, '_blank');
            }
        }
        
        updateGameView({ phase: 'lobby', players: [] });
    } else { 
        alert(res.error); 
    }
}

// --- RECEPCIÓN DE ESTADO ---
socket.on('roomState', (room) => {
    currentRoom = room;
    updateGameView(room);
});

// --- RESULTADO FINAL ---
socket.on('roundResult', (data) => {
    // data: { result, winners, impostors }
    const overlay = qs('ejectionOverlay');
    const titleEl = qs('resultTitle');
    const subtitleEl = qs('resultSubtitle');
    const winnersEl = qs('finalWinners');
    const impsEl = qs('finalImpostors');
    const detailsBox = qs('finalDetailsBox');
    const iconEl = qs('resultIcon');

    overlay.style.display = 'flex';
    detailsBox.style.display = 'block';

    winnersEl.innerText = (data.winners || []).join(', ') || '---';
    impsEl.innerText = (data.impostors || []).join(', ') || '---';

    if (data.result === 'crew') {
        iconEl.textContent = '✅';
        titleEl.textContent = 'GANÓ LA TRIPULACIÓN';
        subtitleEl.textContent = 'Descubrieron al impostor.';
        playSound('win');
    } else if (data.result === 'impostor') {
        iconEl.textContent = '🚨';
        titleEl.textContent = 'GANÓ EL IMPOSTOR';
        subtitleEl.textContent = 'Logró engañar a la tripulación.';
        playSound('eject');
    } else {
        iconEl.textContent = '⚖️';
        titleEl.textContent = 'RONDA TERMINADA';
        subtitleEl.textContent = 'Sin resultado claro.';
    }
});

// ==========================================
// 6. UPDATE GENERAL DE UI
// ==========================================
function updateGameView(room) {
    if (!room) return;
    currentRoom = room;
    currentPhase = room.phase || 'lobby';

    const phaseLabel = qs('phaseLabel');
    const statusText = qs('statusText');
    const playersList = qs('playersList');
    const voteGrid = qs('votePlayersGrid');
    const turnTitle = qs('turnTitle');
    const turnInstruction = qs('turnInstruction');
    const currentTurnPlayer = qs('currentTurnPlayer');
    const timerLabel = qs('timerLabel');

    // Fase
    if (phaseLabel) {
        if (currentPhase === 'lobby') phaseLabel.innerText = 'LOBBY';
        else if (currentPhase === 'word') phaseLabel.innerText = 'PALABRA';
        else if (currentPhase === 'turn') phaseLabel.innerText = 'TURNOS';
        else if (currentPhase === 'vote') phaseLabel.innerText = 'VOTACIÓN';
        else phaseLabel.innerText = currentPhase.toUpperCase();
    }

    // Timer
    if (timerLabel) {
        timerLabel.innerText = room.timerText || '--';
    }

    // Lista de jugadores
    if (playersList) {
        playersList.innerHTML = '';
        (room.players || []).forEach(p => {
            const row = document.createElement('div');
            row.className = 'player-row';
            if (p.isDead) row.style.opacity = 0.5;

            const avatar = document.createElement('div');
            avatar.className = 'p-avatar';
            const ini = (p.name || '?').charAt(0).toUpperCase();
            avatar.textContent = ini;

            const nameEl = document.createElement('div');
            nameEl.className = 'p-name';
            nameEl.textContent = p.name;

            const tag = document.createElement('div');
            tag.className = 'p-tag';
            if (room.hostId === p.id) tag.textContent = 'HOST';
            else if (p.id === myId) tag.textContent = 'TÚ';
            else tag.textContent = '';

            row.appendChild(avatar);
            row.appendChild(nameEl);
            row.appendChild(tag);
            playersList.appendChild(row);
        });

        qs('currentPlayersCount').innerText = (room.players || []).length;
        qs('currentImpostorsCount').innerText = room.impostors || 1;
    }

    // Estado (texto)
    if (statusText) {
        if (currentPhase === 'lobby') statusText.innerText = 'Esperando que el host inicie la ronda.';
        else if (currentPhase === 'word') statusText.innerText = 'Todos viendo su palabra/rol.';
        else if (currentPhase === 'turn') statusText.innerText = 'Turnos de pistas en curso.';
        else if (currentPhase === 'vote') statusText.innerText = 'Momento de votar al posible impostor.';
    }

    // Vistas principales
    const viewLobby = qs('viewLobby');
    const viewWord = qs('viewWord');
    const viewTurn = qs('viewTurn');
    const viewVote = qs('viewVote');

    if (viewLobby) viewLobby.style.display = (currentPhase === 'lobby' ? 'block' : 'none');
    if (viewWord) viewWord.style.display = (currentPhase === 'word' ? 'block' : 'none');
    if (viewTurn) viewTurn.style.display = (currentPhase === 'turn' ? 'block' : 'none');
    if (viewVote) viewVote.style.display = (currentPhase === 'vote' ? 'block' : 'none');

    // Reset de tarjeta de palabra cuando se entra a fase word
    if (currentPhase === 'word') {
        const secretCard = qs('secretCard');
        if (secretCard) {
            secretCard.classList.remove('revealed');
        }
        hasSeenCard = false;
        if (qs('roleTitle')) qs('roleTitle').innerText = room.myRole || 'ROL';
        if (qs('secretWordDisplay')) qs('secretWordDisplay').innerText = room.myWord || '---';
        if (qs('wordHint')) qs('wordHint').innerText = room.myHint || 'No reveles la palabra exacta, solo da pistas.';
    }

    // Fase turnos
    if (currentPhase === 'turn') {
        if (turnTitle) turnTitle.innerText = 'Turno de pistas';
        if (turnInstruction) {
            if (room.currentTurnId === myId) {
                turnInstruction.innerText = 'Es tu turno: di una pista sin revelar la palabra.';
            } else {
                turnInstruction.innerText = 'Escucha las pistas de los demás jugadores.';
            }
        }
        if (currentTurnPlayer) {
            const turnPlayer = (room.players || []).find(p => p.id === room.currentTurnId);
            currentTurnPlayer.innerText = turnPlayer ? turnPlayer.name : 'Esperando...';
        }
    }

    // Fase voto
    if (currentPhase === 'vote' && voteGrid) {
        voteGrid.innerHTML = '';
        voteLocked = !!room.votes && room.votes[myId];
        (room.players || []).filter(p => !p.isDead).forEach(p => {
            const card = document.createElement('div');
            card.className = 'vote-card';
            if (voteLocked && room.votes[myId] === p.id) {
                card.style.borderColor = 'var(--accent-cyan)';
                card.style.boxShadow = '0 0 14px rgba(0,240,255,0.7)';
            }

            card.innerHTML = `
                <div class="vote-avatar">🛰️</div>
                <div>${p.name}</div>
            `;
            card.onclick = () => {
                if (voteLocked) return;
                playSound('click');
                socket.emit('submitVote', { targetId: p.id });
                voteLocked = true;
            };
            voteGrid.appendChild(card);
        });
    }
}

// ==========================================
// 7. ERRORES
// ==========================================
socket.on('connect_error', () => {
    alert('Error de conexión con el servidor.');
});
