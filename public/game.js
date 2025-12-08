const socket = io();

// ==========================================
// 1. SISTEMA DE SONIDOS
// ==========================================
const audioFiles = {
    click: new Audio('sounds/click-345983.mp3'),
    join: new Audio('sounds/new-notification-019-363747.mp3'), 
    start: new Audio('sounds/game-start-317318.mp3'),
    eject: new Audio('sounds/fatal-body-fall-thud-352716.mp3'),
    win: new Audio('sounds/level-up-04-243762.mp3')
};

function playSound(name) {
    try {
        if(audioFiles[name]) {
            audioFiles[name].currentTime = 0; 
            audioFiles[name].volume = 0.5;    
            audioFiles[name].play().catch(e => console.log("Audio bloqueado:", e));
        }
    } catch(e) { console.error("Error audio:", e); }
}

// ==========================================
// 2. REFERENCIAS DOM
// ==========================================
// PANTALLAS NUEVAS
const screenHome = document.getElementById('screenHome');
const screenCreate = document.getElementById('screenCreate');
const screenJoin = document.getElementById('screenJoin');
const lobbyOverlay=document.getElementById('lobbyOverlay');

// MODAL CATEGORIAS
const modalCats = document.getElementById('modalCategories');
const btnOpenCats = document.getElementById('btnOpenCategories');
const btnCloseCats = document.getElementById('btnCloseCategories');
const catCountLabel = document.getElementById('catCount');

const mainContent=document.getElementById('mainContent'), roomCodeDisplay=document.getElementById('roomCodeDisplay'), playersListEl=document.getElementById('playersList'), votingGrid=document.getElementById('votingGrid');
const viewCard=document.getElementById('viewCard'), viewTurn=document.getElementById('viewTurn'), viewVoting=document.getElementById('viewVoting');
const turnPlayerName=document.getElementById('turnPlayerName'), turnTimerDisplay=document.getElementById('turnTimerDisplay'), turnAvatar=document.querySelector('.turn-avatar-circle'), roleDisplay=document.getElementById('roleDisplay'), wordDisplay=document.getElementById('wordDisplay'), teammateDisplay=document.getElementById('teammateDisplay'), ejectionOverlay=document.getElementById('ejectionOverlay');
const btnStart=document.getElementById('btnStartRound'), btnSkip=document.getElementById('btnSkipVote'), btnFinishTurn=document.getElementById('btnFinishTurn'), btnDiscordManual=document.getElementById('btnDiscordManual'), btnExit=document.getElementById('btnExit');
const gameBoard = document.querySelector('.game-board');
const voteCounter = document.getElementById('voteCounter');
const votingTimer = document.getElementById('votingTimer');

let myId=null, isHost=false, localTimer=null, selectedVoteId=null, isMyPlayerDead=false, currentDiscordLink=null;

// Ocultar juego al inicio
mainContent.style.display = 'none';

// --- NAVEGACIÓN MENU (CONCEPT 2) ---
function showScreen(screenName) {
    playSound('click');
    screenHome.style.display = 'none';
    screenCreate.style.display = 'none';
    screenJoin.style.display = 'none';

    if(screenName === 'home') screenHome.style.display = 'flex';
    if(screenName === 'create') screenCreate.style.display = 'flex';
    if(screenName === 'join') screenJoin.style.display = 'flex';
}

document.getElementById('btnGoCreate').onclick = () => showScreen('create');
document.getElementById('btnGoJoin').onclick = () => showScreen('join');
document.getElementById('backFromCreate').onclick = () => showScreen('home');
document.getElementById('backFromJoin').onclick = () => showScreen('home');

// --- LÓGICA MODAL CATEGORÍAS ---
btnOpenCats.onclick = () => { playSound('click'); modalCats.style.display = 'flex'; };
btnCloseCats.onclick = () => { 
    playSound('click'); 
    modalCats.style.display = 'none'; 
    const count = document.querySelectorAll('.cat-chip input:checked').length;
    catCountLabel.innerText = count;
};


// --- BOTONES CREAR / UNIRSE ---
document.getElementById('btnCreateRoom').onclick = () => {
    playSound('click');
    const checkboxes = document.querySelectorAll('.cat-chip input[type="checkbox"]:checked');
    const categories = Array.from(checkboxes).map(cb => cb.value);
    
    if(categories.length === 0) return alert("¡Elige al menos una categoría!");

    const hostNameEl = document.getElementById('hostName');
    const maxPlayersEl = document.getElementById('maxPlayers');
    const impostorsEl = document.getElementById('impostors');
    const turnTimeEl = document.getElementById('timeTurn');
    const voteTimeEl = document.getElementById('timeVote');
    const localModeEl = document.getElementById('localMode');

    if(!hostNameEl) return alert("Recarga la página, faltan elementos.");

    socket.emit('createRoom', { 
        name: hostNameEl.value || 'Host', 
        maxPlayers: maxPlayersEl.value, 
        impostors: impostorsEl.value, 
        categories: categories,
        isLocal: localModeEl ? localModeEl.checked : false,
        turnTime: turnTimeEl ? turnTimeEl.value : 15, 
        voteTime: voteTimeEl ? voteTimeEl.value : 120
    }, handleConnection);
};

document.getElementById('btnJoinRoom').onclick=()=>{ 
    playSound('click');
    const nameEl = document.getElementById('joinName');
    const codeEl = document.getElementById('joinCode');
    socket.emit('joinRoom', { 
        name: nameEl.value || 'Player', 
        roomCode: codeEl.value 
    }, handleConnection); 
};

// === MANEJO DE CONEXIÓN ===
function handleConnection(res){ 
    if(res.ok){ 
        playSound('join'); 
        lobbyOverlay.style.display='none'; 
        
        // MOSTRAR JUEGO Y ACTIVAR TRANSICIÓN SUAVE
        mainContent.style.display='block'; 
        setTimeout(() => {
            mainContent.classList.remove('blurred');
        }, 50); 
        
        myId=res.me.id; isHost=res.isHost; roomCodeDisplay.innerText=res.roomCode; 
        
        if(res.discordLink) { 
            currentDiscordLink = res.discordLink; 
            btnDiscordManual.style.display = 'flex'; 
            window.open(res.discordLink, '_blank'); 
        } else { 
            btnDiscordManual.style.display = 'none'; 
        }
    } else { 
        alert(res.error); 
    } 
}

btnDiscordManual.onclick = () => { playSound('click'); if(currentDiscordLink) window.open(currentDiscordLink, '_blank'); };
btnExit.onclick = () => { playSound('click'); location.reload(); };

// --- ACCIONES JUEGO ---
btnStart.onclick=()=>{ 
    playSound('click'); 
    socket.emit('startRound'); 
};

btnFinishTurn.onclick=()=>{ 
    playSound('click'); 
    socket.emit('finishTurn'); 
};

btnSkip.onclick=()=>{ 
    if(isMyPlayerDead) return; 
    playSound('click');
    socket.emit('submitVote', {targetId:null}); 
    btnSkip.innerText="ESPERANDO..."; 
    btnSkip.disabled=true; 
};

// --- EVENTOS SERVIDOR ---
socket.on('roomState', (room)=>{ 
    const me = room.players.find(p => p.id === myId);
    if(me) isMyPlayerDead = me.isDead || false;
    
    if(room.votesInfo && voteCounter) {
        voteCounter.innerText = `VOTOS: ${room.votesInfo.current} / ${room.votesInfo.total}`;
    }
    
    updateHeader(room); renderSidebar(room); updateGameView(room); 
});

socket.on('yourRole', (data)=>{
    playSound('start'); 
    const card=document.querySelector('.secret-card'); teammateDisplay.style.display='none';
    if(data.role==='impostor'){ 
        roleDisplay.innerText='ERES EL IMPOSTOR'; wordDisplay.innerText='ERES EL IMPOSTOR'; wordDisplay.classList.add('impostor-word');
        // El color ahora se maneja por CSS para ser más sutil, pero dejamos esto por si acaso
        if(data.teammates&&data.teammates.length>0){teammateDisplay.style.display='block';teammateDisplay.innerText=`ALIADO: ${data.teammates.join(', ')}`;} 
    } else { 
        roleDisplay.innerText='CIUDADANO'; wordDisplay.innerText=data.word; wordDisplay.classList.remove('impostor-word');
    }
});

socket.on('votingResults', (data)=>{
    if(data.gameResult) playSound('win'); 
    else playSound('eject');

    ejectionOverlay.style.display='flex';
    const t=document.getElementById('ejectedName'), s=document.getElementById('ejectedRole');
    if(data.kickedPlayer){ 
        t.innerText=`${data.kickedPlayer.name} fue expulsado.`; 
        s.innerText=data.isImpostor?"ERA EL IMPOSTOR":"ERA INOCENTE"; 
        s.className=data.isImpostor?"eject-subtitle impostor-text":"eject-subtitle innocent-text"; 
    } else { t.innerText="Nadie fue expulsado."; s.innerText="SKIP / EMPATE"; s.className="eject-subtitle"; }
    
    if(data.gameResult){ 
        setTimeout(()=>{ 
            t.innerText="JUEGO TERMINADO"; 
            s.innerText=data.gameResult==='citizensWin'?"¡VICTORIA CIUDADANA!":"¡VICTORIA IMPOSTORA!"; 
            s.className=data.gameResult==='citizensWin'?"eject-subtitle innocent-text":"eject-subtitle impostor-text"; 
        },2000); 
    }
    setTimeout(()=>{ ejectionOverlay.style.display='none'; btnSkip.innerText="SALTAR VOTO"; btnSkip.disabled=false; },5000);
});

// --- RENDERIZADO ---
function renderSidebar(room){
    playersListEl.innerHTML='';
    room.players.forEach(p=>{
        const c=document.createElement('div'); c.className='player-card'; c.style.borderLeftColor=p.color;
        
        if(p.isDead) c.classList.add('dead');
        else if(room.phase==='palabras'&&room.players[room.turnIndex]?.id===p.id) c.classList.add('talking');
        
        let status=''; if(room.phase==='votacion'&&p.hasVoted) status='✅'; if(p.isDead) status='💀';
        c.innerHTML=`<div class="p-avatar" style="background:${p.color}"></div><div class="p-name">${p.name} ${p.id===myId?'(Tú)':''}</div><div class="p-status">${status}</div>`;
        playersListEl.appendChild(c);
    });
}

function updateGameView(room){
    if(room.phase==='votacion') gameBoard.classList.add('voting-mode'); else gameBoard.classList.remove('voting-mode');
    
    if(room.phase==='lectura'){ showView(viewCard); document.querySelector('.secret-card').style.transform="scale(1.1)"; roleDisplay.innerText="¡MIRA TU ROL!"; stopLocalTimer(); return; }
    
    if(room.phase==='votacion'){ 
        document.querySelector('.secret-card').style.transform="scale(1)"; showView(viewVoting); 
        renderVotingGrid(room.players); 
        startLocalTimer(room.timeLeft, 'vote'); 
        return; 
    }
    
    if(room.phase==='palabras'){ 
        document.querySelector('.secret-card').style.transform="scale(1)"; const ap=room.players[room.turnIndex]; 
        if(ap){ 
            showView(viewTurn); turnPlayerName.innerText=ap.name; turnPlayerName.style.color=ap.color; turnAvatar.style.borderColor=ap.color; 
            startLocalTimer(room.timeLeft, 'turn'); 
            
            if(ap.id === myId) {
                btnFinishTurn.style.display = 'block';
                if(room.timeLeft > (document.getElementById('timeTurn')?.value - 1) || 14) playSound('join'); 
            } else {
                btnFinishTurn.style.display = 'none'; 
            }
        } 
        return; 
    }
    document.querySelector('.secret-card').style.transform="scale(1)"; showView(viewCard); stopLocalTimer();
}

function renderVotingGrid(players){
    votingGrid.innerHTML='';
    players.forEach(p=>{
        if(p.isDead || p.id===myId) return;
        const c=document.createElement('div'); c.className='vote-card';
        if(selectedVoteId===p.id) c.classList.add('selected');
        c.innerHTML=`<div class="vote-avatar" style="background:${p.color}">👤</div><div class="vote-name">${p.name}</div>`;
        c.onclick=()=>{ 
            if(isMyPlayerDead) return; 
            playSound('click'); 
            document.querySelectorAll('.vote-card').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); selectedVoteId=p.id; socket.emit('submitVote', {targetId:p.id}); 
        };
        votingGrid.appendChild(c);
    });
}

function updateHeader(room){ 
    const phaseLabel = document.getElementById('phasePill');
    if(phaseLabel) phaseLabel.innerText = room.phase.toUpperCase();

    if(room.phase==='lobby'){ btnStart.style.display='block'; btnSkip.style.display='none'; if(isHost&&room.players.length>=3){btnStart.disabled=false; btnStart.style.opacity='1';}else{btnStart.disabled=true; btnStart.style.opacity='0.5';} }
    else if(room.phase==='votacion'){ btnStart.style.display='none'; btnSkip.style.display='block'; if(isMyPlayerDead){btnSkip.innerText="ESTÁS MUERTO"; btnSkip.disabled=true;} }
    else{ btnStart.style.display='block'; btnStart.disabled=true; btnSkip.style.display='none'; } 
}

function showView(el){ [viewCard, viewTurn, viewVoting].forEach(v=>v.style.display='none'); el.style.display='block'; }
function startLocalTimer(s, type){ stopLocalTimer(); updateTimerDisplay(s, type); localTimer=setInterval(()=>{ s--; if(s<0)s=0; updateTimerDisplay(s, type); if(s===0)stopLocalTimer(); },1000); }
function updateTimerDisplay(s, type) { if(type === 'vote' && votingTimer) { votingTimer.innerText = s + "s"; if(s <= 10) votingTimer.classList.add('danger'); else votingTimer.classList.remove('danger'); } else if(turnTimerDisplay) { turnTimerDisplay.innerText = s; } }
function stopLocalTimer(){ if(localTimer)clearInterval(localTimer); }