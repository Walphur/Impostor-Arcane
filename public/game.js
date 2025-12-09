const socket = io();

// ==========================================
// 1. DATA & AUDIO
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
    { id: 'animales', icon: '🦁', name: 'Animales' },
    { id: 'profesiones', icon: '👮', name: 'Profesiones' },
    { id: 'cine', icon: '🎬', name: 'Cine' }
];

let myId = null;
let isHost = false;
let isMyPlayerDead = false;
let localTimer = null;
let selectedVoteId = null;
let selectedCategories = new Set(['lugares', 'comidas', 'objetos', 'animales', 'profesiones']);

// ==========================================
// 2. UI LOGIC (Menus & Settings)
// ==========================================
// Navegación Básica
function showScreen(id) {
    playSound('click');
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex'; // Usamos flex para layout
}

document.getElementById('btnGoCreate').onclick = () => showScreen('screenCreate');
document.getElementById('btnGoJoin').onclick = () => showScreen('screenJoin');
document.getElementById('backFromCreate').onclick = () => showScreen('screenHome');
document.getElementById('backFromJoin').onclick = () => showScreen('screenHome');

// Modal Cómo Jugar
document.getElementById('btnHowToPlay').onclick = () => { playSound('click'); document.getElementById('modalHowToPlay').style.display='flex'; };
document.getElementById('btnCloseHowToPlay').onclick = () => { playSound('click'); document.getElementById('modalHowToPlay').style.display='none'; };

// --- CONFIGURACIÓN (GRID + CONTADORES) ---
// Generar Categorias
const catGrid = document.getElementById('categoriesGrid');
CATEGORIES_DATA.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'cat-card selected'; // Por defecto seleccionadas
    el.innerHTML = `<div class="cat-icon">${cat.icon}</div><div class="cat-name">${cat.name}</div><div class="cat-check">✓</div>`;
    el.onclick = () => {
        playSound('click');
        if(selectedCategories.has(cat.id)) {
            selectedCategories.delete(cat.id);
            el.classList.remove('selected');
        } else {
            selectedCategories.add(cat.id);
            el.classList.add('selected');
        }
    };
    catGrid.appendChild(el);
});

// Ajuste Valores (+/-)
window.adjustValue = function(inputId, delta) {
    playSound('click');
    const input = document.getElementById(inputId);
    let val = parseInt(input.value);
    
    // Límites
    if(inputId === 'maxPlayers') { val = Math.min(15, Math.max(3, val + delta)); document.getElementById('displayPlayers').innerText = val; }
    if(inputId === 'impostors') { val = Math.min(4, Math.max(1, val + delta)); document.getElementById('displayImpostors').innerText = val; }
    if(inputId === 'timeTurn') { val = Math.min(60, Math.max(5, val + delta)); document.getElementById('displayTurn').innerText = val; }
    
    input.value = val;
};

// Toggle Local
document.getElementById('toggleLocalMode').onclick = function() {
    playSound('click');
    const check = document.getElementById('localMode');
    check.checked = !check.checked;
    this.classList.toggle('active', check.checked);
    this.querySelector('.toggle-status').innerText = check.checked ? 'ON' : 'OFF';
};

// ==========================================
// 3. CONEXIÓN
// ==========================================
document.getElementById('btnCreateRoom').onclick = () => {
    if(selectedCategories.size === 0) return alert("Elige al menos una categoría.");
    playSound('click');
    socket.emit('createRoom', {
        name: document.getElementById('hostName').value || 'Agente X',
        maxPlayers: document.getElementById('maxPlayers').value,
        impostors: document.getElementById('impostors').value,
        categories: Array.from(selectedCategories),
        isLocal: document.getElementById('localMode').checked,
        turnTime: document.getElementById('timeTurn').value,
        voteTime: 120 // Default vote time
    }, handleConnection);
};

document.getElementById('btnJoinRoom').onclick = () => {
    playSound('click');
    socket.emit('joinRoom', {
        name: document.getElementById('joinName').value || 'Agente Y',
        roomCode: document.getElementById('joinCode').value
    }, handleConnection);
};

function handleConnection(res) {
    if(res.ok) {
        playSound('join');
        document.getElementById('lobbyOverlay').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        
        myId = res.me.id;
        isHost = res.isHost;
        document.getElementById('roomCodeDisplay').innerText = res.roomCode;
        
        if(res.discordLink) {
            document.getElementById('btnDiscordManual').style.display = 'flex';
            document.getElementById('btnDiscordManual').onclick = () => window.open(res.discordLink, '_blank');
        }
        
        // Reset vistas
        updateGameView({ phase: 'lobby', players: [] }); 
    } else {
        alert(res.error);
    }
}

document.getElementById('btnExit').onclick = () => location.reload();
document.getElementById('btnCopyCode').onclick = () => { navigator.clipboard.writeText(document.getElementById('roomCodeDisplay').innerText); };

// ==========================================
// 4. JUEGO (REVEAL & FLOW)
// ==========================================
// Interacción Tarjeta Secreta
document.getElementById('secretCardContainer').onclick = function() {
    playSound('click');
    this.classList.toggle('revealed');
};

document.getElementById('btnStartRound').onclick = () => { playSound('click'); socket.emit('startRound'); };
document.getElementById('btnFinishTurn').onclick = () => { playSound('click'); socket.emit('finishTurn'); };
document.getElementById('btnSkipVote').onclick = () => { 
    if(!isMyPlayerDead) { 
        socket.emit('submitVote', {targetId:null}); 
        const b = document.getElementById('btnSkipVote');
        b.innerText="ESPERANDO..."; b.disabled=true; 
    }
};

// --- ESTADOS DE SALA ---
socket.on('roomState', (room) => {
    const me = room.players.find(p => p.id === myId);
    isMyPlayerDead = me ? me.isDead : false;
    
    // Botones Globales
    const btnStart = document.getElementById('btnStartRound');
    const btnSkip = document.getElementById('btnSkipVote');
    
    if(room.phase === 'lobby') {
        btnStart.style.display = 'block';
        btnStart.disabled = !(isHost && room.players.length >= 3);
        btnSkip.style.display = 'none';
    } else if(room.phase === 'votacion') {
        btnStart.style.display = 'none';
        btnSkip.style.display = 'block';
        if(isMyPlayerDead) btnSkip.disabled = true;
    } else {
        btnStart.style.display = 'none';
        btnSkip.style.display = 'none';
    }

    renderPlayers(room);
    updateGameView(room);
});

// --- ROL (INICIO RONDA) ---
socket.on('yourRole', (data) => {
    playSound('start');
    
    // Reset tarjeta
    const cardWrap = document.getElementById('secretCardContainer');
    cardWrap.classList.remove('revealed');
    cardWrap.style.display = 'block';
    document.getElementById('instructionsPanel').style.display = 'none';

    // Rellenar datos dorso
    const back = document.getElementById('cardBackContent');
    const icon = document.getElementById('roleIconDisplay');
    const title = document.getElementById('roleTitleDisplay');
    const word = document.getElementById('wordDisplay');
    const teamBox = document.getElementById('teammateBox');

    back.className = 'card-back'; // Reset clases

    if(data.role === 'impostor') {
        back.classList.add('impostor-theme');
        icon.innerText = '👺';
        title.innerText = 'IMPOSTOR';
        word.innerText = '???';
        
        if(data.teammates && data.teammates.length > 0) {
            teamBox.style.display = 'block';
            document.getElementById('teammateNames').innerText = data.teammates.join(', ');
        } else {
            teamBox.style.display = 'none';
        }
    } else {
        icon.innerText = '🕵️';
        title.innerText = 'AGENTE';
        word.innerText = data.word;
        teamBox.style.display = 'none';
    }
});

// --- RESULTADO FINAL (Ref Img 8) ---
socket.on('votingResults', (data) => {
    const overlay = document.getElementById('ejectionOverlay');
    const title = document.getElementById('resultTitle');
    const sub = document.getElementById('resultSubtitle');
    const icon = document.getElementById('resultIcon');
    const rWord = document.getElementById('resultWord');
    const rImp = document.getElementById('resultImpostorName');
    const btnBack = document.getElementById('btnBackToLobby');

    // Lógica para mostrar pantalla intermedia o final
    if(data.gameResult) {
        playSound('win');
        overlay.style.display = 'flex';
        
        if(data.gameResult === 'citizensWin') {
            title.innerText = "¡VICTORIA!";
            title.style.color = '#30D158'; // Verde
            sub.innerText = "El impostor ha sido neutralizado.";
            icon.innerText = '🏆';
        } else {
            title.innerText = "DERROTA";
            title.style.color = '#FF453A'; // Rojo
            sub.innerText = "El impostor ha escapado.";
            icon.innerText = '💀';
        }
        
        // Mostrar datos revelados
        // Nota: Necesitarías que el server mande la palabra real en votingResults, 
        // por ahora asumimos que el server la manda o la tenemos.
        rWord.innerText = "CONFIDENCIAL"; 
        rImp.innerText = data.kickedPlayer ? data.kickedPlayer.name : "Desconocido";

        btnBack.onclick = () => {
            overlay.style.display = 'none';
            document.getElementById('secretCardContainer').style.display = 'none';
            document.getElementById('instructionsPanel').style.display = 'block';
        };

    } else {
        // Solo expulsión (no termina juego)
        playSound('eject');
        overlay.style.display = 'flex';
        title.innerText = "EXPULSIÓN";
        title.style.color = '#fff';
        icon.innerText = '🥾';
        
        if(data.kickedPlayer) {
            sub.innerText = `${data.kickedPlayer.name} fue eliminado.`;
            rImp.innerText = data.isImpostor ? "ERA IMPOSTOR" : "ERA INOCENTE";
        } else {
            sub.innerText = "Nadie fue eliminado (Skip/Empate).";
            rImp.innerText = "---";
        }
        rWord.innerText = "---";
        
        // Botón cambia función a "Cerrar"
        btnBack.innerText = "CONTINUAR";
        btnBack.onclick = () => { overlay.style.display = 'none'; btnBack.innerText="NUEVA MISIÓN"; };
    }
});

// ==========================================
// 5. VIEW HELPERS
// ==========================================
function renderPlayers(room) {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    room.players.forEach(p => {
        const chip = document.createElement('div');
        chip.className = 'player-chip';
        if(p.id === myId) chip.classList.add('is-me');
        if(p.isDead) chip.classList.add('is-dead');
        
        chip.innerHTML = `<span style="color:${p.color}">●</span> ${p.name}`;
        list.appendChild(chip);
    });
}

function updateGameView(room) {
    const vCard = document.getElementById('viewCard');
    const vTurn = document.getElementById('viewTurn');
    const vVote = document.getElementById('viewVoting');
    
    [vCard, vTurn, vVote].forEach(el => el.style.display = 'none');
    stopTimer();

    if(room.phase === 'lobby' || room.phase === 'lectura') {
        vCard.style.display = 'block';
    }
    else if(room.phase === 'palabras') {
        vTurn.style.display = 'block';
        const ap = room.players[room.turnIndex];
        if(ap) {
            document.getElementById('turnPlayerName').innerText = ap.name;
            document.querySelector('.turn-avatar').style.borderColor = ap.color;
            const btn = document.getElementById('btnFinishTurn');
            btn.style.display = (ap.id === myId) ? 'block' : 'none';
            startTimer(room.timeLeft, document.getElementById('turnTimerDisplay'));
        }
    }
    else if(room.phase === 'votacion') {
        vVote.style.display = 'block';
        startTimer(room.timeLeft, document.getElementById('votingTimer'));
        document.getElementById('voteCounter').innerText = `${room.votesInfo.current}/${room.votesInfo.total} Votos`;
        
        const grid = document.getElementById('votingGrid');
        grid.innerHTML = '';
        room.players.forEach(p => {
            if(p.isDead || p.id === myId) return;
            const card = document.createElement('div');
            card.className = 'vote-card';
            if(selectedVoteId === p.id) card.classList.add('selected');
            card.innerHTML = `<div class="vote-avatar" style="color:${p.color}">👤</div><div class="vote-name">${p.name}</div>`;
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

function startTimer(s, el) {
    if(el) el.innerText = s;
    localTimer = setInterval(() => { s--; if(s<0)s=0; if(el)el.innerText=s; if(s===0)stopTimer(); }, 1000);
}
function stopTimer() { if(localTimer) clearInterval(localTimer); }