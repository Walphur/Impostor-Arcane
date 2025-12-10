const socket = io();

// ==========================================
// 1. SONIDOS Y DATOS
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
// 2. LÓGICA DE PANTALLAS (UI)
// ==========================================
function showScreen(id) {
    playSound('click');
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
}

// Navegación
document.getElementById('btnGoCreate').onclick = () => showScreen('screenCreate');
document.getElementById('btnGoJoin').onclick = () => showScreen('screenJoin');
document.getElementById('backFromCreate').onclick = () => showScreen('screenHome');
document.getElementById('backFromJoin').onclick = () => showScreen('screenHome');
document.getElementById('backFromCategories').onclick = () => showScreen('screenCreate');
document.getElementById('btnGoCategories').onclick = () => showScreen('screenCategories');
document.getElementById('btnConfirmCategories').onclick = () => { 
    showScreen('screenCreate'); 
    document.getElementById('catCountDisplay').innerText = selectedCategories.size; 
};

// Modal Cómo Jugar
document.getElementById('btnHowToPlay').onclick = () => { playSound('click'); document.getElementById('modalHowToPlay').style.display='flex'; };
document.getElementById('btnCloseHowToPlay').onclick = () => { playSound('click'); document.getElementById('modalHowToPlay').style.display='none'; };

// Contadores (+/-)
window.adjustValue = function(inputId, delta) {
    playSound('click');
    const input = document.getElementById(inputId);
    let val = parseInt(input.value);
    if(inputId === 'maxPlayers') { val = Math.min(15, Math.max(3, val + delta)); document.getElementById('displayPlayers').innerText = val; }
    if(inputId === 'impostors') { val = Math.min(4, Math.max(1, val + delta)); document.getElementById('displayImpostors').innerText = val; }
    if(inputId === 'timeTurn') { val = Math.min(60, Math.max(5, val + delta)); document.getElementById('displayTurn').innerText = val; }
    if(inputId === 'timeVote') { val = Math.min(300, Math.max(30, val + delta)); document.getElementById('displayVote').innerText = val; }
    input.value = val;
};

// Toggle Switch
document.getElementById('toggleLocalMode').onclick = function() {
    playSound('click');
    const check = document.getElementById('localMode');
    check.checked = !check.checked;
    this.classList.toggle('active', check.checked);
};

// Generar Grid Categorías
const catGrid = document.getElementById('categoriesGrid');
CATEGORIES_DATA.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'cat-card selected'; 
    el.innerHTML = `<div class="cat-icon">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
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

// ==========================================
// 3. CONEXIÓN SOCKET.IO
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
        voteTime: document.getElementById('timeVote').value
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
        } else {
            document.getElementById('btnDiscordManual').style.display = 'none';
        }
        
        updateGameView({ phase: 'lobby', players: [] });
    } else { 
        alert(res.error); 
    }
}

document.getElementById('btnExit').onclick = () => location.reload();
document.getElementById('btnCopyCode').onclick = () => { navigator.clipboard.writeText(document.getElementById('roomCodeDisplay').innerText); };

// ==========================================
// 4. LÓGICA DE JUEGO
// ==========================================
document.getElementById('secretCardContainer').onclick = function() { playSound('click'); this.classList.toggle('revealed'); };
document.getElementById('btnStartRound').onclick = () => { playSound('click'); socket.emit('startRound'); };
document.getElementById('btnFinishTurn').onclick = () => { playSound('click'); socket.emit('finishTurn'); };
document.getElementById('btnSkipVote').onclick = () => { 
    if(!isMyPlayerDead) { 
        socket.emit('submitVote', {targetId:null}); 
        const b = document.getElementById('btnSkipVote'); 
        b.innerText="ESPERANDO..."; b.disabled=true; 
    } 
};

// --- RECEPCIÓN DE ESTADO ---
socket.on('roomState', (room) => {
    const me = room.players.find(p => p.id === myId);
    isMyPlayerDead = me ? me.isDead : false;
    
    const btnStart = document.getElementById('btnStartRound');
    const btnSkip = document.getElementById('btnSkipVote');
    
    // CORRECCIÓN: Permitir iniciar con 2 jugadores para pruebas
    if(room.phase === 'lobby') { 
        btnStart.style.display = 'block'; 
        btnStart.disabled = !(isHost && room.players.length >= 2); 
        btnSkip.style.display = 'none'; 
    } else if(room.phase === 'votacion') { 
        btnStart.style.display = 'none'; 
        btnSkip.style.display = 'block'; 
        btnSkip.innerText = "SALTAR VOTO";
        btnSkip.disabled = isMyPlayerDead || !!room.votes[myId];
    } else { 
        btnStart.style.display = 'none'; 
        btnSkip.style.display = 'none'; 
    }

    renderPlayers(room); 
    updateGameView(room);
});

socket.on('yourRole', (data) => {
    playSound('start');
    const cardWrap = document.getElementById('secretCardContainer'); 
    cardWrap.classList.remove('revealed'); 
    cardWrap.style.display = 'block';
    
    document.getElementById('instructionsPanel').style.display = 'none';
    document.getElementById('ejectionOverlay').style.display = 'none';
    document.getElementById('finalDetailsBox').style.display = 'none';

    const back = document.getElementById('cardBackContent'); 
    const icon = document.getElementById('roleIconDisplay'); 
    const title = document.getElementById('roleTitleDisplay'); 
    const word = document.getElementById('wordDisplay'); 
    const teamBox = document.getElementById('teammateBox');
    
    back.className = 'card-back'; 
    
    if(data.role === 'impostor') {
        back.classList.add('impostor-theme'); 
        icon.innerText = '👺'; 
        title.innerText = 'IMPOSTOR'; 
        word.innerText = 'ERROR 404'; 
        
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
    
    localStorage.setItem('myRole', data.role);
});

socket.on('votingResults', (data) => {
    const overlay = document.getElementById('ejectionOverlay'); 
    const title = document.getElementById('resultTitle'); 
    const sub = document.getElementById('resultSubtitle'); 
    const icon = document.getElementById('resultIcon'); 
    const detailsBox = document.getElementById('finalDetailsBox'); 
    const rWord = document.getElementById('resultWord'); 
    const rImp = document.getElementById('resultImpostorName'); 
    const btnBack = document.getElementById('btnBackToLobby');
    
    const myRole = localStorage.getItem('myRole');

    if(data.gameResult) {
        playSound('win'); 
        overlay.style.display = 'flex'; 
        detailsBox.style.display = 'block';
        
        rWord.innerText = data.secretWord || "---"; 
        rImp.innerText = data.realImpostorName || "---";

        const citizensWon = (data.gameResult === 'citizensWin');
        let iWon = false;
        if(citizensWon && myRole === 'ciudadano') iWon = true;
        if(!citizensWon && myRole === 'impostor') iWon = true;

        if(iWon) { 
            title.innerText = "¡VICTORIA!"; 
            title.style.color = '#00E055'; 
            icon.innerText = '🏆'; 
        } else { 
            title.innerText = "DERROTA"; 
            title.style.color = '#FF4D4D'; 
            icon.innerText = '💀'; 
        }
        sub.innerText = citizensWon ? "El sistema está seguro." : "Infiltración exitosa.";
        btnBack.innerText = "NUEVA MISIÓN";
        btnBack.onclick = () => { 
            overlay.style.display = 'none'; 
            document.getElementById('secretCardContainer').style.display = 'none'; 
            document.getElementById('instructionsPanel').style.display = 'flex'; 
        };
    } else {
        playSound('eject'); 
        overlay.style.display = 'flex'; 
        detailsBox.style.display = 'none';
        title.innerText = "EXPULSIÓN"; 
        title.style.color = '#fff'; 
        icon.innerText = '🥾';
        if(data.kickedPlayer) { sub.innerText = `${data.kickedPlayer.name} ha sido eliminado.`; } 
        else { sub.innerText = "Nadie fue eliminado."; }
        
        btnBack.innerText = "CONTINUAR"; 
        btnBack.onclick = () => { overlay.style.display = 'none'; };
    }
});

// ==========================================
// 5. FUNCIONES VISUALES
// ==========================================
function renderPlayers(room) { 
    const list = document.getElementById('playersList'); 
    list.innerHTML = ''; 
    room.players.forEach(p => { 
        const row = document.createElement('div'); 
        row.className = 'player-row'; 
        if(p.isDead) row.classList.add('dead'); 
        
        row.innerHTML = `<div class="p-dot" style="background:${p.color}"></div><span>${p.name} ${p.id===myId?'(Tú)':''}</span>`; 
        list.appendChild(row); 
    }); 
}

function updateGameView(room) {
    const vCard = document.getElementById('viewCard'); 
    const vTurn = document.getElementById('viewTurn'); 
    const vVote = document.getElementById('viewVoting');
    
    [vCard, vTurn, vVote].forEach(el => el.style.display = 'none'); 
    stopTimer();

    // FASE: LECTURA DE ROL (Inicio)
    if(room.phase === 'lobby' || room.phase === 'lectura') { 
        vCard.style.display = 'block'; 
        // Feedback visual crítico para que el jugador sepa qué hacer
        if(room.phase === 'lectura') {
            document.getElementById('instructionsPanel').style.display = 'block';
            document.getElementById('instructionsPanel').innerHTML = `<h3>¡MISIÓN INICIADA!</h3><p style="color:#00E055">Toca el candado para ver tu rol</p>`;
        } else {
             document.getElementById('instructionsPanel').innerHTML = `<h3>ESPERANDO AGENTES...</h3><div class="loading-bar"><div class="bar-fill"></div></div>`;
        }
    } 
    // FASE: PALABRAS (Turnos)
    else if(room.phase === 'palabras') {
        vTurn.style.display = 'block'; 
        const ap = room.players[room.turnIndex];
        if(ap) { 
            document.getElementById('turnPlayerName').innerText = ap.name; 
            document.querySelector('.turn-avatar').innerText = ap.name.charAt(0).toUpperCase(); // Mostrar Inicial
            document.querySelector('.turn-avatar').style.borderColor = ap.color; 
            const btn = document.getElementById('btnFinishTurn'); 
            btn.style.display = (ap.id === myId) ? 'block' : 'none'; 
            startTimer(room.timeLeft, document.getElementById('turnTimerDisplay')); 
        }
    } 
    // FASE: VOTACION
    else if(room.phase === 'votacion') {
        vVote.style.display = 'block'; 
        startTimer(room.timeLeft, document.getElementById('votingTimer')); 
        document.getElementById('voteCounter').innerText = `${room.votesInfo.current} / ${room.votesInfo.total}`;
        
        const grid = document.getElementById('votingGrid'); 
        grid.innerHTML = '';
        room.players.forEach(p => { 
            if(p.isDead || p.id === myId) return; 
            const card = document.createElement('div'); 
            card.className = 'vote-card'; 
            if(selectedVoteId === p.id) card.classList.add('selected'); 
            
            // Aquí usamos la clase .vote-avatar que agregamos al CSS
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
    localTimer = setInterval(() => { 
        s--; 
        if(s<0) s=0; 
        if(el) el.innerText=s; 
        if(s===0) stopTimer(); 
    }, 1000); 
}

function stopTimer() { 
    if(localTimer) clearInterval(localTimer); 
}