const socket = io();

// REFERENCIAS AL DOM
const lobbyOverlay = document.getElementById('lobbyOverlay');
const mainContent = document.getElementById('mainContent');
const phasePill = document.getElementById('phasePill');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const myInfoDisplay = document.getElementById('myInfo');
const btnStart = document.getElementById('btnStartRound');

// VISTAS CENTRALES
const viewCard = document.getElementById('viewCard');
const viewTurn = document.getElementById('viewTurn');
const viewVoting = document.getElementById('viewVoting');

// ELEMENTOS DINÁMICOS
const turnPlayerName = document.getElementById('turnPlayerName');
const turnTimerDisplay = document.getElementById('turnTimerDisplay');
const wordDisplay = document.getElementById('wordDisplay');
const roleDisplay = document.getElementById('roleDisplay');
const votingGrid = document.getElementById('votingGrid');
const ejectionOverlay = document.getElementById('ejectionOverlay');

// VARIABLES DE ESTADO
let myId = null;
let isHost = false;
let localTimer = null;
let selectedVoteId = null;

// --- GESTIÓN DE PESTAÑAS LOBBY ---
document.getElementById('tabCreate').onclick = (e) => switchTab(e, 'panelCreate');
document.getElementById('tabJoin').onclick = (e) => switchTab(e, 'panelJoin');

function switchTab(e, panelId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById('panelCreate').style.display = panelId === 'panelCreate' ? 'block' : 'none';
    document.getElementById('panelJoin').style.display = panelId === 'panelJoin' ? 'block' : 'none';
}

// --- BOTONES DE CONEXIÓN ---
document.getElementById('btnCreateRoom').onclick = () => {
    const name = document.getElementById('hostName').value || 'Host';
    const maxPlayers = document.getElementById('maxPlayers').value;
    const impostors = document.getElementById('impostors').value;
    socket.emit('createRoom', { name, maxPlayers, impostors }, handleConnection);
};

document.getElementById('btnJoinRoom').onclick = () => {
    const name = document.getElementById('joinName').value || 'Player';
    const code = document.getElementById('joinCode').value;
    socket.emit('joinRoom', { name, roomCode: code }, handleConnection);
};

function handleConnection(res) {
    if (res.ok) {
        lobbyOverlay.style.display = 'none';
        mainContent.classList.remove('blurred');
        myId = res.me.id;
        isHost = res.isHost;
        roomCodeDisplay.innerText = res.roomCode;
        
        // ABRIR DISCORD AUTOMÁTICAMENTE
        if (res.discordLink) {
            console.log("Abriendo Discord:", res.discordLink);
            window.open(res.discordLink, '_blank');
        }
    } else {
        alert(res.error);
    }
}

// --- CONTROL DE PARTIDA ---
btnStart.onclick = () => socket.emit('startRound');
document.getElementById('btnSkipVote').onclick = () => {
    socket.emit('submitVote', { targetId: null });
    showView(viewCard); // Volver a vista neutra mientras esperan
};

// --- EVENTOS DEL SOCKET ---
socket.on('roomState', (room) => {
    updateHeader(room);
    updateGameView(room);
});

socket.on('yourRole', (data) => {
    if (data.role === 'impostor') {
        roleDisplay.innerText = 'ERES EL IMPOSTOR';
        roleDisplay.style.color = 'white'; 
        wordDisplay.innerText = '???';
        document.querySelector('.secret-card').style.background = 'linear-gradient(135deg, #000, #b91c1c)';
    } else {
        roleDisplay.innerText = 'CIUDADANO';
        wordDisplay.innerText = data.word;
        document.querySelector('.secret-card').style.background = 'linear-gradient(135deg, #f97316, #be123c)';
    }
});

socket.on('votingResults', (data) => {
    // PANTALLA DE EXPULSIÓN
    const title = document.getElementById('ejectedName');
    const subtitle = document.getElementById('ejectedRole');
    
    ejectionOverlay.style.display = 'flex';
    
    if (data.kickedPlayer) {
        title.innerText = `${data.kickedPlayer.name} fue expulsado.`;
        if (data.isImpostor) {
            subtitle.innerText = "ERA EL IMPOSTOR";
            subtitle.className = "eject-subtitle impostor-text";
        } else {
            subtitle.innerText = "NO ERA EL IMPOSTOR";
            subtitle.className = "eject-subtitle innocent-text";
        }
    } else {
        title.innerText = "Nadie fue expulsado.";
        subtitle.innerText = "EMPATE / SKIP";
        subtitle.className = "eject-subtitle";
    }

    // Ocultar overlay después de 4 segundos
    setTimeout(() => {
        ejectionOverlay.style.display = 'none';
    }, 4000);
});


// --- FUNCIONES DE LÓGICA VISUAL ---

function updateHeader(room) {
    phasePill.innerText = room.phase.toUpperCase();
    
    // Botón Iniciar solo para Host en Lobby
    if (isHost && room.phase === 'lobby' && room.players.length >= 3) {
        btnStart.disabled = false;
        btnStart.style.opacity = "1";
        btnStart.innerText = "INICIAR PARTIDA";
    } else {
        btnStart.disabled = true;
        btnStart.style.opacity = "0.3";
        if (room.phase !== 'lobby') btnStart.innerText = "PARTIDA EN CURSO";
    }
    
    myInfoDisplay.innerText = isHost ? '👑 Eres el Anfitrión' : '👤 Eres Jugador';
}

function updateGameView(room) {
    // 1. FASE VOTACIÓN
    if (room.phase === 'votacion') {
        showView(viewVoting);
        renderVotingGrid(room.players);
        return;
    }

    // 2. FASE PALABRAS (TURNOS)
    if (room.phase === 'palabras') {
        const activePlayer = room.players[room.turnIndex];
        
        if (activePlayer) {
            // Mostrar vista de Turno
            showView(viewTurn);
            turnPlayerName.innerText = activePlayer.name;
            
            // Iniciar temporizador visual suave
            startLocalTimer(room.timeLeft);
            
            // Si soy yo, avisar visualmente extra
            if (activePlayer.id === myId) {
                turnPlayerName.style.color = '#f59e0b'; // Amarillo
                turnPlayerName.innerText = "¡ES TU TURNO!";
            } else {
                turnPlayerName.style.color = 'white';
            }
        }
        return;
    }

    // 3. FASE LOBBY (DEFAULT)
    showView(viewCard);
    stopLocalTimer();
}

function showView(element) {
    [viewCard, viewTurn, viewVoting].forEach(el => el.style.display = 'none');
    element.style.display = 'block';
}

// --- TEMPORIZADOR SUAVE ---
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

function stopLocalTimer() {
    if (localTimer) clearInterval(localTimer);
}

// --- RENDERIZAR GRILLA DE VOTACIÓN ---
function renderVotingGrid(players) {
    votingGrid.innerHTML = '';
    
    players.forEach(p => {
        // No te puedes votar a ti mismo (opcional, pero común)
        if (p.id === myId) return;

        const card = document.createElement('div');
        card.className = 'vote-card';
        if (selectedVoteId === p.id) card.classList.add('selected');
        
        card.innerHTML = `
            <div class="vote-avatar">👤</div>
            <div class="vote-name">${p.name}</div>
        `;
        
        card.onclick = () => {
            // Deseleccionar anteriores
            document.querySelectorAll('.vote-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedVoteId = p.id;
            
            // Enviar voto
            socket.emit('submitVote', { targetId: p.id });
        };
        
        votingGrid.appendChild(card);
    });
}