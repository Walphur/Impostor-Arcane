const socket = io();

// ELEMENTOS DOM PRINCIPALES
const lobbyOverlay = document.getElementById('lobbyOverlay');
const mainContent = document.getElementById('mainContent');
const phasePill = document.getElementById('phasePill');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const myInfoDisplay = document.getElementById('myInfo');

// BOTONES ACCION
const btnStart = document.getElementById('btnStartRound');
const btnSkip = document.getElementById('btnSkipVote');

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

// VARIABLES ESTADO
let myId = null;
let isHost = false;
let localTimer = null;
let selectedVoteId = null;

// --- GESTIÓN TABS LOBBY ---
document.getElementById('tabCreate').onclick = (e) => switchTab(e, 'panelCreate');
document.getElementById('tabJoin').onclick = (e) => switchTab(e, 'panelJoin');

function switchTab(e, panelId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById('panelCreate').style.display = panelId === 'panelCreate' ? 'block' : 'none';
    document.getElementById('panelJoin').style.display = panelId === 'panelJoin' ? 'block' : 'none';
}

// --- CONEXIÓN ---
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
        
        if (res.discordLink) {
            console.log("Abriendo Discord...", res.discordLink);
            window.open(res.discordLink, '_blank');
        }
    } else {
        alert(res.error);
    }
}

// --- ACCIONES ---
btnStart.onclick = () => socket.emit('startRound');

btnSkip.onclick = () => {
    socket.emit('submitVote', { targetId: null });
    // Feedback visual inmediato
    btnSkip.innerText = "ESPERANDO...";
    btnSkip.disabled = true;
    document.querySelectorAll('.vote-card').forEach(c => c.style.opacity = '0.5');
};

// --- SOCKET LISTENERS ---
socket.on('roomState', (room) => {
    updateHeader(room);
    updateGameView(room);
});

socket.on('yourRole', (data) => {
    // Configuramos visualmente la carta según el rol
    const cardElement = document.querySelector('.secret-card');
    
    if (data.role === 'impostor') {
        roleDisplay.innerText = 'ERES EL IMPOSTOR';
        roleDisplay.style.color = 'white';
        wordDisplay.innerText = '???';
        cardElement.style.background = 'linear-gradient(135deg, #020617, #7f1d1d)';
    } else {
        roleDisplay.innerText = 'CIUDADANO';
        wordDisplay.innerText = data.word;
        cardElement.style.background = 'linear-gradient(135deg, #f97316, #9f1239)';
    }
});

socket.on('votingResults', (data) => {
    // ACTIVAR PANTALLA DRAMÁTICA
    const title = document.getElementById('ejectedName');
    const subtitle = document.getElementById('ejectedRole');
    
    ejectionOverlay.style.display = 'flex'; 
    
    // 1. MOSTRAR QUIÉN FUE EXPULSADO
    if (data.kickedPlayer) {
        title.innerText = `${data.kickedPlayer.name} fue expulsado.`;
        if (data.isImpostor) {
            subtitle.innerText = "ERA EL IMPOSTOR";
            subtitle.className = "eject-subtitle impostor-text";
        } else {
            subtitle.innerText = "ERA INOCENTE";
            subtitle.className = "eject-subtitle innocent-text";
        }
    } else {
        title.innerText = "Nadie fue expulsado.";
        subtitle.innerText = "EMPATE / SKIP";
        subtitle.className = "eject-subtitle";
    }

    // 2. MOSTRAR SI EL JUEGO TERMINÓ (VICTORIA)
    if (data.gameResult) {
        setTimeout(() => {
            title.innerText = "JUEGO TERMINADO";
            if (data.gameResult === 'citizensWin') {
                subtitle.innerText = "¡VICTORIA CIUDADANA!";
                subtitle.className = "eject-subtitle innocent-text";
            } else {
                subtitle.innerText = "¡VICTORIA IMPOSTORA!";
                subtitle.className = "eject-subtitle impostor-text";
            }
        }, 2000); // Cambio de texto a los 2 segundos
    }

    // Ocultar overlay después de 5 segundos
    setTimeout(() => {
        ejectionOverlay.style.display = 'none';
        // Resetear botones voto
        btnSkip.innerText = "SALTAR VOTO 💨";
        btnSkip.disabled = false;
        // Resetear opacidad cartas
        document.querySelectorAll('.vote-card').forEach(c => c.style.opacity = '1');
    }, 5000);
});

// --- LÓGICA DE VISTAS ---
function updateHeader(room) {
    phasePill.innerText = room.phase.toUpperCase();
    
    // Botón Iniciar solo en Lobby para Host
    if (room.phase === 'lobby') {
        btnStart.style.display = 'block';
        btnSkip.style.display = 'none';
        if (isHost && room.players.length >= 3) {
            btnStart.disabled = false;
            btnStart.innerText = "INICIAR PARTIDA";
            btnStart.style.opacity = "1";
        } else {
            btnStart.disabled = true;
            btnStart.innerText = "ESPERANDO JUGADORES...";
            btnStart.style.opacity = "0.5";
        }
    } else if (room.phase === 'votacion') {
        btnStart.style.display = 'none';
        btnSkip.style.display = 'block';
    } else {
        // En partida
        btnStart.style.display = 'block';
        btnStart.disabled = true;
        btnStart.innerText = "PARTIDA EN CURSO";
        btnSkip.style.display = 'none';
    }
    
    myInfoDisplay.innerText = isHost ? '👑 Eres el Anfitrión' : '👤 Eres Jugador';
}

function updateGameView(room) {
    const cardEl = document.querySelector('.secret-card');

    // 1. FASE DE LECTURA (Nuevo: Zoom y atención)
    if (room.phase === 'lectura') {
        showView(viewCard);
        cardEl.style.transform = "scale(1.1)"; // Zoom in
        roleDisplay.innerText = "¡MIRA TU ROL!";
        stopLocalTimer();
        return;
    }

    // 2. FASE VOTACIÓN
    if (room.phase === 'votacion') {
        cardEl.style.transform = "scale(1)";
        showView(viewVoting);
        renderVotingGrid(room.players);
        stopLocalTimer();
        return;
    }

    // 3. FASE PALABRAS (TURNOS)
    if (room.phase === 'palabras') {
        cardEl.style.transform = "scale(1)";
        const activePlayer = room.players[room.turnIndex];
        
        if (activePlayer) {
            showView(viewTurn);
            turnPlayerName.innerText = activePlayer.name;
            
            // Iniciar temporizador
            startLocalTimer(room.timeLeft);
            
            // Si soy yo, cambiar color
            if (activePlayer.id === myId) {
                turnPlayerName.style.color = '#f59e0b';
                document.querySelector('.turn-avatar-circle').style.borderColor = '#f59e0b';
                document.querySelector('.turn-hint').innerText = "¡ES TU TURNO DE HABLAR!";
            } else {
                turnPlayerName.style.color = 'white';
                document.querySelector('.turn-avatar-circle').style.borderColor = '#1e293b';
                document.querySelector('.turn-hint').innerText = "TURNO DE HABLAR";
            }
        }
        return;
    }

    // 4. LOBBY (Default)
    cardEl.style.transform = "scale(1)";
    showView(viewCard);
    stopLocalTimer();
}

function showView(element) {
    [viewCard, viewTurn, viewVoting].forEach(el => el.style.display = 'none');
    element.style.display = 'block';
}

// --- UTILS ---
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

function renderVotingGrid(players) {
    votingGrid.innerHTML = '';
    
    players.forEach(p => {
        // Opción: No votarse a sí mismo
        if (p.id === myId) return;

        const card = document.createElement('div');
        card.className = 'vote-card';
        if (selectedVoteId === p.id) card.classList.add('selected');
        
        card.innerHTML = `
            <div class="vote-avatar">👤</div>
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