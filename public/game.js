const socket = io();

// ==========================================
// 1. SONIDOS
// ==========================================
const audioFiles = {
    click: new Audio('sounds/click-345983.mp3'),
    join: new Audio('sounds/new-notification-019-363747.mp3'), 
    start: new Audio('sounds/game-start-317318.mp3'),
    eject: new Audio('sounds/fatal-body-fall-thud-352716.mp3'),
    win: new Audio('sounds/level-up-04-243762.mp3')
};
function playSound(name) {
    try { if(audioFiles[name]) { audioFiles[name].currentTime=0; audioFiles[name].volume=0.5; audioFiles[name].play().catch(e=>{}); } } catch(e){}
}

// ==========================================
// 2. REFERENCIAS
// ==========================================
// Pantallas
const screenHome = document.getElementById('screenHome');
const screenCreate = document.getElementById('screenCreate');
const screenJoin = document.getElementById('screenJoin');
const lobbyOverlay = document.getElementById('lobbyOverlay');
const mainContent = document.getElementById('mainContent');

// Modales
const modalCats = document.getElementById('modalCategories');
const modalHelp = document.getElementById('modalHowToPlay');

// Elementos Juego
const instructionsCard = document.getElementById('instructionsCard');
const roleCard = document.getElementById('roleCard');
const wordDisplay = document.getElementById('wordDisplay');
const roleDisplay = document.getElementById('roleDisplay');
const teammateDisplay = document.getElementById('teammateDisplay'); // Caja container
const teammateNames = document.getElementById('teammateNames');    // Texto nombres

// Variables Estado
let myId = null;
let isHost = false;
let isMyPlayerDead = false;
let localTimer = null;
let selectedVoteId = null;

// ==========================================
// 3. NAVEGACIÓN
// ==========================================
function showScreen(name) {
    playSound('click');
    [screenHome, screenCreate, screenJoin].forEach(el => el.style.display = 'none');
    if(name === 'home') screenHome.style.display = 'flex';
    if(name === 'create') screenCreate.style.display = 'flex';
    if(name === 'join') screenJoin.style.display = 'flex';
}

document.getElementById('btnGoCreate').onclick = () => showScreen('create');
document.getElementById('btnGoJoin').onclick = () => showScreen('join');
document.getElementById('backFromCreate').onclick = () => showScreen('home');
document.getElementById('backFromJoin').onclick = () => showScreen('home');

// Botón Cómo Jugar
document.getElementById('btnHowToPlay').onclick = () => { playSound('click'); modalHelp.style.display = 'flex'; };
document.getElementById('btnCloseHowToPlay').onclick = () => { playSound('click'); modalHelp.style.display = 'none'; };

// Categorías
document.getElementById('btnOpenCategories').onclick = () => { playSound('click'); modalCats.style.display = 'flex'; };
document.getElementById('btnCloseCategories').onclick = () => { 
    playSound('click'); 
    modalCats.style.display = 'none';
    document.getElementById('catCount').innerText = document.querySelectorAll('.cat-chip input:checked').length;
};

// ==========================================
// 4. CONEXIÓN Y CREACIÓN
// ==========================================
document.getElementById('btnCreateRoom').onclick = () => {
    playSound('click');
    const cats = Array.from(document.querySelectorAll('.cat-chip input:checked')).map(c => c.value);
    if(cats.length === 0) return alert("Selecciona al menos una categoría.");

    socket.emit('createRoom', {
        name: document.getElementById('hostName').value || 'Host',
        maxPlayers: document.getElementById('maxPlayers').value,
        impostors: document.getElementById('impostors').value,
        categories: cats,
        isLocal: document.getElementById('localMode').checked,
        turnTime: document.getElementById('timeTurn').value,
        voteTime: document.getElementById('timeVote').value
    }, handleConnection);
};

document.getElementById('btnJoinRoom').onclick = () => {
    playSound('click');
    socket.emit('joinRoom', {
        name: document.getElementById('joinName').value || 'Player',
        roomCode: document.getElementById('joinCode').value
    }, handleConnection);
};

function handleConnection(res) {
    if(res.ok) {
        playSound('join');
        lobbyOverlay.style.display = 'none';
        mainContent.style.display = 'flex'; // Flex para activar layout CSS
        setTimeout(() => mainContent.classList.remove('blurred'), 50);

        myId = res.me.id;
        isHost = res.isHost;
        document.getElementById('roomCodeDisplay').innerText = res.roomCode;
        
        // Mostrar botón discord si hay link
        if(res.discordLink) {
            document.getElementById('btnDiscordManual').style.display = 'flex';
            document.getElementById('btnDiscordManual').onclick = () => window.open(res.discordLink, '_blank');
            window.open(res.discordLink, '_blank');
        }

        // Estado inicial: ver instrucciones
        instructionsCard.style.display = 'block';
        roleCard.style.display = 'none';
    } else {
        alert(res.error);
    }
}

document.getElementById('btnExit').onclick = () => location.reload();
document.getElementById('btnCopyCode').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('roomCodeDisplay').innerText);
    alert("Código copiado!");
};

// ==========================================
// 5. LÓGICA DE JUEGO
// ==========================================
document.getElementById('btnStartRound').onclick = () => { playSound('click'); socket.emit('startRound'); };
document.getElementById('btnFinishTurn').onclick = () => { playSound('click'); socket.emit('finishTurn'); };
document.getElementById('btnSkipVote').onclick = () => { if(!isMyPlayerDead) { socket.emit('submitVote', {targetId:null}); document.getElementById('btnSkipVote').innerText="ESPERANDO..."; document.getElementById('btnSkipVote').disabled=true; }};

// --- RECEPCIÓN DE ESTADO ---
socket.on('roomState', (room) => {
    const me = room.players.find(p => p.id === myId);
    isMyPlayerDead = me ? me.isDead : false;

    // Actualizar Header
    const btnStart = document.getElementById('btnStartRound');
    const btnSkip = document.getElementById('btnSkipVote');
    
    if(room.phase === 'lobby') {
        btnStart.style.display = 'block';
        btnSkip.style.display = 'none';
        btnStart.disabled = !(isHost && room.players.length >= 3); // Mínimo 3 para probar
    } else if (room.phase === 'votacion') {
        btnStart.style.display = 'none';
        btnSkip.style.display = 'block';
        if(isMyPlayerDead) btnSkip.disabled = true;
    } else {
        btnStart.style.display = 'none';
        btnSkip.style.display = 'none';
    }

    // Sidebar Jugadores
    renderSidebar(room);

    // Vistas Centrales
    updateGameView(room);
});

// --- ROL ASIGNADO (INICIO DE RONDA) ---
socket.on('yourRole', (data) => {
    playSound('start');
    
    // Ocultar instrucciones, mostrar tarjeta de rol
    instructionsCard.style.display = 'none';
    roleCard.style.display = 'block';
    
    // Resetear visualización
    teammateDisplay.style.display = 'none';
    wordDisplay.style.color = 'white';
    
    if(data.role === 'impostor') {
        roleDisplay.innerText = 'ERES EL IMPOSTOR';
        roleDisplay.style.color = '#E74C3C'; // Rojo
        wordDisplay.innerText = '???';
        wordDisplay.style.color = '#E74C3C';

        // LÓGICA DE COMPAÑEROS
        if(data.teammates && data.teammates.length > 0) {
            teammateDisplay.style.display = 'block';
            teammateNames.innerText = data.teammates.join(', ');
        }
    } else {
        roleDisplay.innerText = 'CIUDADANO';
        roleDisplay.style.color = '#4A90E2'; // Azul
        wordDisplay.innerText = data.word;
    }
});

// --- RESULTADOS VOTACIÓN ---
socket.on('votingResults', (data) => {
    const overlay = document.getElementById('ejectionOverlay');
    const title = document.getElementById('ejectedName');
    const sub = document.getElementById('ejectedRole');

    if(data.gameResult) playSound('win'); else playSound('eject');

    overlay.style.display = 'flex';
    
    if(data.kickedPlayer) {
        title.innerText = `${data.kickedPlayer.name} fue expulsado.`;
        sub.innerText = data.isImpostor ? "ERA UN IMPOSTOR" : "ERA INOCENTE";
        sub.style.color = data.isImpostor ? '#E74C3C' : '#4A90E2';
    } else {
        title.innerText = "NADIE FUE EXPULSADO";
        sub.innerText = "Empate o Skip";
        sub.style.color = "#999";
    }

    if(data.gameResult) {
        setTimeout(() => {
            title.innerText = "PARTIDA TERMINADA";
            sub.innerText = data.gameResult === 'citizensWin' ? "¡GANAN LOS CIUDADANOS!" : "¡GANAN LOS IMPOSTORES!";
            sub.style.color = data.gameResult === 'citizensWin' ? '#27AE60' : '#E74C3C';
        }, 2000);
        setTimeout(() => { 
            overlay.style.display = 'none'; 
            // Volver al lobby visualmente
            instructionsCard.style.display = 'block';
            roleCard.style.display = 'none';
        }, 6000);
    } else {
        setTimeout(() => { overlay.style.display = 'none'; document.getElementById('btnSkipVote').innerText="SALTAR VOTO 💨"; document.getElementById('btnSkipVote').disabled=false; }, 4000);
    }
});

// ==========================================
// 6. FUNCIONES VISUALES AUXILIARES
// ==========================================
function renderSidebar(room) {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    room.players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'player-card';
        if(p.isDead) row.classList.add('dead');
        if(room.phase === 'palabras' && room.players[room.turnIndex]?.id === p.id) row.classList.add('talking');
        
        const status = p.hasVoted && room.phase === 'votacion' ? '✅' : '';
        row.innerHTML = `
            <div class="p-avatar" style="background:${p.color}"></div>
            <div style="flex:1">${p.name} ${p.id===myId?'(Tú)':''}</div>
            <div>${status}</div>
        `;
        list.appendChild(row);
    });
}

function updateGameView(room) {
    const vCard = document.getElementById('viewCard');
    const vTurn = document.getElementById('viewTurn');
    const vVote = document.getElementById('viewVoting');

    // Resetear vistas
    [vCard, vTurn, vVote].forEach(el => el.style.display = 'none');
    stopTimer();

    if(room.phase === 'lobby' || room.phase === 'lectura') {
        vCard.style.display = 'block';
    } 
    else if(room.phase === 'palabras') {
        const ap = room.players[room.turnIndex];
        if(ap) {
            vTurn.style.display = 'block';
            document.getElementById('turnPlayerName').innerText = ap.name;
            document.getElementById('turnPlayerName').style.color = ap.color;
            document.querySelector('.turn-avatar-circle').style.borderColor = ap.color;
            
            // Botón terminar turno solo si soy yo
            const btn = document.getElementById('btnFinishTurn');
            btn.style.display = (ap.id === myId) ? 'block' : 'none';

            startTimer(room.timeLeft, document.getElementById('turnTimerDisplay'));
            // Sonido alerta turno
            if(ap.id === myId && room.timeLeft > (parseInt(document.getElementById('timeTurn').value)-1)) playSound('join');
        }
    } 
    else if(room.phase === 'votacion') {
        vVote.style.display = 'block';
        startTimer(room.timeLeft, document.getElementById('votingTimer'));
        document.getElementById('voteCounter').innerText = `Votos: ${room.votesInfo.current}/${room.votesInfo.total}`;
        
        // Render Grid Votación
        const grid = document.getElementById('votingGrid');
        grid.innerHTML = '';
        room.players.forEach(p => {
            if(p.isDead || p.id === myId) return; // No votarse a si mismo ni a muertos
            const card = document.createElement('div');
            card.className = 'vote-card';
            if(selectedVoteId === p.id) card.classList.add('selected');
            
            card.innerHTML = `
                <div style="font-size:2rem;margin-bottom:5px;">👤</div>
                <div style="font-weight:bold;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
            `;
            card.onclick = () => {
                if(isMyPlayerDead) return;
                playSound('click');
                document.querySelectorAll('.vote-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedVoteId = p.id;
                socket.emit('submitVote', {targetId: p.id});
            };
            grid.appendChild(card);
        });
    }
}

function startTimer(seconds, element) {
    if(element) element.innerText = seconds;
    localTimer = setInterval(() => {
        seconds--;
        if(seconds < 0) seconds = 0;
        if(element) element.innerText = seconds;
        if(seconds === 0) stopTimer();
    }, 1000);
}

function stopTimer() {
    if(localTimer) clearInterval(localTimer);
}