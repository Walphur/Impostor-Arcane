const socket = io('https://incognitogame.online', { transports: ['websocket'] });
const MY_ID_KEY = 'incognito_uuid';
function getDeviceId() { let id = localStorage.getItem(MY_ID_KEY); if (!id) { id = 'u_' + Date.now() + Math.random().toString(36).substr(2); localStorage.setItem(MY_ID_KEY, id); } return id; }
const MY_DEVICE_ID = getDeviceId();

const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;
const ADMOB_IDS = { intersticial: 'ca-app-pub-6788680373227341/8374567976', bonificado: 'ca-app-pub-6788680373227341/4416794053' };

let myId = null; let isHost = false; let currentRoom = null; let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas']);
let isPremium = localStorage.getItem('isPremium') === 'true';
let unlockedCategories = new Set(JSON.parse(localStorage.getItem('videoUnlocks') || '[]')); 
let myRole = null; 
let wakeLock = null;

const qs = (id) => document.getElementById(id);
const playSound = (id) => { try { const a = qs(id); a.currentTime=0; a.play().catch(()=>{}); } catch(e){} };

// --- WAKE LOCK & RECONNECT ---
async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        if(wakeLock !== null) await requestWakeLock();
        if(!socket.connected) socket.connect();
    }
});

socket.on('connect', () => {
    const lastCode = localStorage.getItem('lastRoomCode');
    const lastName = localStorage.getItem('playerName');
    if (lastCode && lastName) {
        socket.emit('joinRoom', { roomCode: lastCode, name: lastName, userId: MY_DEVICE_ID }, (res) => {
            if (res.ok) handleJoinSuccess(res);
            else { localStorage.removeItem('lastRoomCode'); updateGameView(null); }
        });
    }
});

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    setupButtons();
    renderCategories();
    requestWakeLock();
    
    const saved = localStorage.getItem('playerName');
    if(saved) { qs('hostName').value = saved; qs('joinName').value = saved; }
    
    // Default mode
    qs('modeGroup').classList.add('selected-mode');
    
    // AdMob en background
    if(AdMob) AdMob.initialize({ requestTrackingAuthorization: true }).catch(()=>{});
});

function setupButtons() {
    const show = (id) => {
        ['screenHome','screenCreate','screenJoin','screenCategories','screenPremium','mainContent','lobbyOverlay'].forEach(s => qs(s).style.display = 'none');
        if(id === 'mainContent') qs('mainContent').style.display = 'block';
        else { qs('lobbyOverlay').style.display = 'flex'; qs(id).style.display = 'flex'; }
    };

    qs('btnGoCreate').onclick = () => show('screenCreate');
    qs('btnGoJoin').onclick = () => show('screenJoin');
    qs('backFromCreate').onclick = () => show('screenHome');
    qs('backFromJoin').onclick = () => show('screenHome');
    qs('btnOpenCategories').onclick = () => show('screenCategories');
    qs('backFromCategories').onclick = () => show('screenCreate');
    qs('btnPremium').onclick = () => show('screenPremium');
    qs('btnBackFromPremium').onclick = () => show('screenHome');
    qs('btnHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'flex';
    qs('btnCloseHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'none';
    
    qs('btnCreateRoom').onclick = createRoom;
    qs('btnJoinRoom').onclick = joinRoom;
    qs('btnStartRound').onclick = () => socket.emit('startRound');
    qs('btnExit').onclick = () => location.reload();
    qs('btnSaveCategories').onclick = () => { updateCategoriesSummary(); show('screenCreate'); };
    
    // --- CARTA SIN BUGS (EVENTO ÚNICO) ---
    const card = qs('cardContainer');
    if(card) {
        card.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            qs('secretCardInner').classList.toggle('flipped');
            playSound('soundFlip');
        };
    }
    
    qs('btnSkipVote').onclick = () => socket.emit('submitVote', { targetId: 'skip' });
    qs('btnSendClue').onclick = () => {
        const txt = qs('inputClue').value.trim();
        if(txt) { socket.emit('submitClue', { text: txt }); qs('inputClue').value=''; }
    };
    qs('btnEndTurn').onclick = () => socket.emit('endTurnEarly');
    
    // SELECTOR DE MODO
    ['modeText','modeGroup','modeDiscord'].forEach(m => {
        qs(m).onclick = () => {
            ['modeText','modeGroup','modeDiscord'].forEach(x => qs(x).classList.remove('selected-mode'));
            qs(m).classList.add('selected-mode');
        };
    });
}

// --- LOGICA JUEGO ---
function createRoom() {
    const name = qs('hostName').value || 'Agente';
    localStorage.setItem('playerName', name);
    let mode = 'group';
    if(qs('modeText').classList.contains('selected-mode')) mode = 'text';
    
    socket.emit('createRoom', {
        name, userId: MY_DEVICE_ID,
        maxPlayers: qs('maxPlayers').value, impostors: qs('impostors').value, voteTime: qs('timeVote').value,
        categories: Array.from(selectedCategories), mode
    }, (res) => {
        if(res.ok) handleJoinSuccess(res); else alert(res.error);
    });
}

function joinRoom() {
    const name = qs('joinName').value || 'Agente';
    const code = qs('joinCode').value;
    localStorage.setItem('playerName', name);
    socket.emit('joinRoom', { roomCode: code, name, userId: MY_DEVICE_ID }, (res) => {
        if(res.ok) handleJoinSuccess(res); else alert(res.error);
    });
}

function handleJoinSuccess(res) {
    myId = res.me.id; isHost = res.isHost; currentRoom = res.room;
    localStorage.setItem('lastRoomCode', res.roomCode);
    qs('roomCodeDisplay').innerText = res.roomCode;
    // Ocultar todo el lobby y mostrar juego
    qs('lobbyOverlay').style.display = 'none';
    qs('mainContent').style.display = 'block';
    updateGameView(res.room);
}

socket.on('roomState', (room) => { currentRoom = room; updateGameView(room); });
socket.on('privateRole', (data) => {
    myRole = data.role;
    qs('roleTitle').innerText = data.role;
    qs('secretWordDisplay').innerText = data.word;
    qs('wordHint').innerText = data.hint;
    if(data.role === 'IMPOSTOR') qs('secretCardInner').classList.add('impostor-card');
    else qs('secretCardInner').classList.remove('impostor-card');
});

socket.on('roundResult', (data) => {
    const overlay = qs('ejectionOverlay');
    const title = qs('resultTitle');
    const sub = qs('resultSubtitle');
    const icon = qs('resultIcon');
    const info = qs('finalSecretWord').parentElement; 
    
    overlay.style.display = 'flex';
    info.style.display = 'none'; 
    
    if (data.result === 'tie') {
        title.innerText = "NADIE EXPULSADO"; title.style.color = "#facc15"; icon.innerText = "⚖️";
        playSound('soundLose');
    } else if (data.result === 'ejected') {
        title.innerText = "EXPULSADO"; title.style.color = "#f97316"; icon.innerText = "👢";
        playSound('soundLose');
    } else {
        info.style.display = 'flex';
        qs('finalSecretWord').innerText = data.secretWord;
        qs('finalImpostors').innerText = data.impostors.join(', ');
        if ( (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR') ) {
            title.innerText = "¡VICTORIA!"; title.style.color = "#4ade80"; icon.innerText = "🏆"; playSound('soundWin');
        } else {
            title.innerText = "DERROTA"; title.style.color = "#ef4444"; icon.innerText = "💀"; playSound('soundLose');
        }
    }
    sub.innerText = data.reason;
});

function updateGameView(room) {
    if (!room) return;
    currentPhase = room.phase;
    isHost = (room.hostId === myId) || (room.hostId === socket.id);

    if(room.phase !== 'result') qs('ejectionOverlay').style.display = 'none';

    ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => qs(v).style.display = 'none');
    
    if(room.phase === 'lobby') qs('viewLobby').style.display = 'block';
    else if(room.phase === 'word') qs('viewWord').style.display = 'block';
    else if(room.phase === 'turn') { qs('viewTurn').style.display = 'block'; updateTurnView(room); }
    else if(room.phase === 'vote') { qs('viewVote').style.display = 'block'; renderVotes(room); }

    qs('timerNumber').innerText = room.timerText;
    qs('currentPlayersCount').innerText = room.players.length;
    renderPlayerList(room);
    
    const btn = qs('btnStartRound');
    if(btn) btn.style.display = (isHost && room.phase === 'lobby') ? 'block' : 'none';
}

function updateTurnView(room) {
    const p = room.players.find(x => x.id === room.currentTurnId);
    qs('currentTurnPlayer').innerText = p ? p.name : '...';
    const isMe = (room.currentTurnId === myId);
    qs('turnInputArea').style.display = (isMe && room.mode === 'text') ? 'flex' : 'none';
    qs('turnActionsNormal').style.display = (isMe && room.mode !== 'text') ? 'block' : 'none';
    qs('turnWaitMessage').style.display = isMe ? 'none' : 'block';
    const hist = qs('cluesHistory'); hist.innerHTML = '';
    room.clues.forEach(c => hist.innerHTML += `<div><b>${c.name}:</b> ${c.text}</div>`);
}

function renderVotes(room) {
    const grid = qs('votePlayersGrid'); grid.innerHTML = '';
    const me = room.players.find(p => p.id === myId);
    if (me && me.isDead) {
        qs('voteSubtitle').innerText = "Estás muerto (Silencio)";
        qs('btnSkipVote').style.display = 'none';
        return;
    }
    qs('btnSkipVote').style.display = 'block';
    room.players.forEach(p => {
        if(p.isDead || p.id === myId) return;
        const btn = document.createElement('div');
        btn.className = 'mini-card'; btn.innerText = p.name;
        if(room.votes[myId] === p.id) btn.style.border = '2px solid red';
        btn.onclick = () => socket.emit('submitVote', { targetId: p.id });
        grid.appendChild(btn);
    });
}

function renderPlayerList(room) {
    const list = qs('playersList'); list.innerHTML = '';
    room.players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-row';
        div.style.opacity = p.isDead ? 0.5 : 1;
        div.innerHTML = `<div style="background:${p.color};width:20px;height:20px;border-radius:50%"></div> ${p.name} ${p.disconnected?'🔌':''} ${p.isDead?'💀':''} ${p.id===room.hostId?'👑':''}`;
        list.appendChild(div);
    });
}

function renderCategories() {
    const grid = qs('categoriesGrid'); grid.innerHTML = '';
    CATEGORIES_DATA.forEach(cat => {
        const btn = document.createElement('div');
        const sel = selectedCategories.has(cat.id);
        const lock = cat.premium && !unlockedCategories.has(cat.id);
        btn.className = 'category-card-square' + (sel && !lock ? ' active' : '') + (lock ? ' locked' : '');
        btn.innerHTML = `<div class="cat-icon">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
        btn.onclick = () => {
            if(lock) showModal("Bloqueado", "Categoría Premium", ()=>alert("Comprar Premium"));
            else { 
                if(selectedCategories.has(cat.id)) selectedCategories.delete(cat.id); else selectedCategories.add(cat.id);
                if(selectedCategories.size===0) selectedCategories.add(cat.id);
                renderCategories();
            }
        };
        grid.appendChild(btn);
    });
}
function updateCategoriesSummary() { qs('categoriesSummary').innerText = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name).join(', '); }
window.adjustValue = (id, v) => {
    const el = qs(id); let val = parseInt(el.value) + v;
    if(val < 1) val = 1;
    el.value = val;
    if(id==='maxPlayers') qs('displayPlayers').innerText = val;
    if(id==='impostors') qs('displayImpostors').innerText = val;
    if(id==='timeVote') qs('displayVoteTime').innerText = val;
    if(isHost) socket.emit('updateSettings', { [id]: val });
};