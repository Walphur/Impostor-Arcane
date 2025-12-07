const socket = io();

// DOM References
const lobbyOverlay = document.getElementById('lobbyOverlay');
const mainContent = document.getElementById('mainContent');
const phasePill = document.getElementById('phasePill');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersListEl = document.getElementById('playersList');
const votingGrid = document.getElementById('votingGrid');

// Views
const viewCard = document.getElementById('viewCard');
const viewTurn = document.getElementById('viewTurn');
const viewVoting = document.getElementById('viewVoting');

// Dynamics
const turnPlayerName = document.getElementById('turnPlayerName');
const turnTimerDisplay = document.getElementById('turnTimerDisplay');
const turnAvatar = document.querySelector('.turn-avatar-circle');
const roleDisplay = document.getElementById('roleDisplay');
const wordDisplay = document.getElementById('wordDisplay');
const ejectionOverlay = document.getElementById('ejectionOverlay');

// Buttons
const btnStart = document.getElementById('btnStartRound');
const btnSkip = document.getElementById('btnSkipVote');

// State
let myId = null;
let isHost = false;
let localTimer = null;
let selectedVoteId = null;

// --- TABS ---
document.getElementById('tabCreate').onclick = (e) => switchTab(e, 'panelCreate');
document.getElementById('tabJoin').onclick = (e) => switchTab(e, 'panelJoin');

function switchTab(e, panelId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById('panelCreate').style.display = panelId === 'panelCreate' ? 'block' : 'none';
    document.getElementById('panelJoin').style.display = panelId === 'panelJoin' ? 'block' : 'none';
}

// --- CONNECT ---
document.getElementById('btnCreateRoom').onclick = () => {
    socket.emit('createRoom', { 
        name: document.getElementById('hostName').value || 'Host',
        maxPlayers: document.getElementById('maxPlayers').value,
        impostors: document.getElementById('impostors').value
    }, handleConnection);
};

document.getElementById('btnJoinRoom').onclick = () => {
    socket.emit('joinRoom', { 
        name: document.getElementById('joinName').value || 'Player',
        roomCode: document.getElementById('joinCode').value
    }, handleConnection);
};

function handleConnection(res) {
    if (res.ok) {
        lobbyOverlay.style.display = 'none';
        mainContent.classList.remove('blurred');
        myId = res.me.id;
        isHost = res.isHost;
        roomCodeDisplay.innerText = res.roomCode;
        if (res.discordLink) window.open(res.discordLink, '_blank');
    } else {
        alert(res.error);
    }
}

// --- GAME LOGIC ---
btnStart.onclick = () => socket.emit('startRound');
btnSkip.onclick = () => {
    socket.emit('submitVote', { targetId: null });
    btnSkip.innerText = "ESPERANDO...";
    btnSkip.disabled = true;
};

socket.on('roomState', (room) => {
    updateHeader(room);
    renderSidebar(room); // Renderiza tarjetas sidebar
    updateGameView(room);
});

socket.on('yourRole', (data) => {
    const card = document.querySelector('.secret-card');
    if (data.role === 'impostor') {
        roleDisplay.innerText = 'ERES EL IMPOSTOR';
        wordDisplay.innerText = '???';
        card.style.background = 'linear-gradient(135deg, #020617, #7f1d1d)';
    } else {
        roleDisplay.innerText = 'CIUDADANO';
        wordDisplay.innerText = data.word;
        card.style.background = 'linear-gradient(135deg, #f97316, #9f1239)';
    }
});

socket.on('votingResults', (data) => {
    ejectionOverlay.style.display = 'flex';
    const title = document.getElementById('ejectedName');
    const subtitle = document.getElementById('ejectedRole');
    
    if (data.kickedPlayer) {
        title.innerText = `${data.kickedPlayer.name} fue expulsado.`;
        subtitle.innerText = data.isImpostor ? "ERA EL IMPOSTOR" : "ERA INOCENTE";
        subtitle.className = data.isImpostor ? "eject-subtitle impostor-text" : "eject-subtitle innocent-text";
    } else {
        title.innerText = "Nadie fue expulsado.";
        subtitle.innerText = "SKIP / EMPATE";
        subtitle.className = "eject-subtitle";
    }

    if (data.gameResult) {
        setTimeout(() => {
            title.innerText = "JUEGO TERMINADO";
            subtitle.innerText = data.gameResult === 'citizensWin' ? "¡VICTORIA CIUDADANA!" : "¡VICTORIA IMPOSTORA!";
            subtitle.className = data.gameResult === 'citizensWin' ? "eject-subtitle innocent-text" : "eject-subtitle impostor-text";
        }, 2000);
    }

    setTimeout(() => {
        ejectionOverlay.style.display = 'none';
        btnSkip.innerText = "SALTAR VOTO";
        btnSkip.disabled = false;
    }, 5000);
});

// --- RENDER FUNCTIONS ---
function renderSidebar(room) {
    playersListEl.innerHTML = '';
    room.players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card';
        // Borde del color del jugador
        card.style.borderLeftColor = p.color;
        
        // Si está hablando, iluminar
        if (room.phase === 'palabras' && room.players[room.turnIndex]?.id === p.id) {
            card.classList.add('talking');
        }

        // Icono de estado (Check si votó)
        let statusIcon = '';
        if (room.phase === 'votacion' && p.hasVoted) statusIcon = '✅';

        card.innerHTML = `
            <div class="p-avatar" style="background:${p.color}"></div>
            <div class="p-name">${p.name} ${p.id === myId ? '(Tú)' : ''}</div>
            <div class="p-status">${statusIcon}</div>
        `;
        playersListEl.appendChild(card);
    });
}

function updateGameView(room) {
    // 1. LECTURA
    if (room.phase === 'lectura') {
        showView(viewCard);
        document.querySelector('.secret-card').style.transform = "scale(1.1)";
        roleDisplay.innerText = "¡MIRA TU ROL!";
        stopLocalTimer();
        return;
    }
    // 2. VOTACION
    if (room.phase === 'votacion') {
        document.querySelector('.secret-card').style.transform = "scale(1)";
        showView(viewVoting);
        renderVotingGrid(room.players);
        stopLocalTimer();
        return;
    }
    // 3. TURNOS
    if (room.phase === 'palabras') {
        document.querySelector('.secret-card').style.transform = "scale(1)";
        const activePlayer = room.players[room.turnIndex];
        if (activePlayer) {
            showView(viewTurn);
            turnPlayerName.innerText = activePlayer.name;
            turnPlayerName.style.color = activePlayer.color;
            turnAvatar.style.borderColor = activePlayer.color;
            startLocalTimer(room.timeLeft);
        }
        return;
    }
    // 4. LOBBY
    document.querySelector('.secret-card').style.transform = "scale(1)";
    showView(viewCard);
    stopLocalTimer();
}

function renderVotingGrid(players) {
    votingGrid.innerHTML = '';
    players.forEach(p => {
        if (p.id === myId) return; // No votarse a sí mismo

        const card = document.createElement('div');
        card.className = 'vote-card';
        if (selectedVoteId === p.id) card.classList.add('selected');

        card.innerHTML = `
            <div class="vote-avatar" style="background:${p.color}"></div>
            <div class="vote-name">${p.name}</div>
        `;
        card.onclick = () => {
            document.querySelectorAll('.vote-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedVoteId = p.id;
            socket.emit('submitVote', { targetId: p.id });
        };
        votingGrid.appendChild(card);
    });
}

function updateHeader(room) {
    phasePill.innerText = room.phase.toUpperCase();
    if (room.phase === 'lobby') {
        btnStart.style.display = 'block';
        btnSkip.style.display = 'none';
        if (isHost && room.players.length >= 3) {
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
        } else {
            btnStart.disabled = true;
            btnStart.style.opacity = '0.5';
        }
    } else if (room.phase === 'votacion') {
        btnStart.style.display = 'none';
        btnSkip.style.display = 'block';
    } else {
        btnStart.style.display = 'block';
        btnStart.disabled = true;
        btnSkip.style.display = 'none';
    }
}

function showView(el) {
    [viewCard, viewTurn, viewVoting].forEach(v => v.style.display = 'none');
    el.style.display = 'block';
}

function startLocalTimer(seconds) {
    stopLocalTimer();
    turnTimerDisplay.innerText = seconds;
    localTimer = setInterval(() => {
        seconds--;
        if (seconds < 0) seconds = 0;
        turnTimerDisplay.innerText = seconds;
        if (seconds === 0) stopLocalTimer();
    }, 1000);
}
function stopLocalTimer() { if (localTimer) clearInterval(localTimer); }