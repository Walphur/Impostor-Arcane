const socket = io();

// --- CONFIGURACIÓN DE ADMOB (PUBLICIDAD) ---
const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;
const ADMOB_IDS = {
    intersticial: 'ca-app-pub-6788680373227341/8374567976', 
    bonificado: 'ca-app-pub-6788680373227341/4416794053'   
};

// ESTADO DEL JUEGO
let myId = null;
let isHost = false;
let currentRoom = null;
let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let unlockedCategories = new Set(); 
let myRole = null; 
let myWord = null;
let myHint = null;
let voteLocked = false;
const MAX_VIDEO_UNLOCKS = 2; // <--- LÍMITE DE VIDEOS

const qs = (id) => document.getElementById(id);

function playSound(id) {
  const audio = qs(id);
  if(audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
}

// --- DATOS DE CATEGORÍAS ---
const CATEGORIES_DATA = [
  { id: 'lugares', premium: false, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>', name: 'Lugares' },
  { id: 'comidas', premium: false, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fbbf24"><path d="M20.79 11.25c-1.28-3.7-4.71-6.3-8.79-6.3s-7.51 2.6-8.79 6.3c-.13.38.06.8.43.94.08.03.16.05.24.05.29 0 .56-.16.7-.43 1.07-2.18 3.2-3.61 5.65-3.8V10h3.54V7.99c2.45.19 4.58 1.62 5.65 3.8.15.29.48.46.8.4.37-.08.62-.43.57-.81zM12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8h16c0 4.41-3.59 8-8 8z"/></svg>', name: 'Comidas' },
  { id: 'objetos', premium: false, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#a78bfa"><path d="M21 11.5v-6c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v6c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-2c0-1.1-.9-2-2-2zM11 5h2v3h1V5h2v3h3v2H5V8h3V5h2v3h1V5zm10 12.5c0 .28-.22.5-.5.5h-17c-.28 0-.5-.22-.5-.5v-1c0-.28.22-.5.5-.5h17c.28 0 .5.22.5.5v1z"/></svg>', name: 'Objetos' },
  { id: 'animales', premium: true, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4ade80"><path d="M19.64 3.8c-.3-.62-1.26-.65-1.61-.05-.38.66-1.08 1.1-1.88 1.1H7.85c-.8 0-1.5-.44-1.88-1.1-.35-.6-1.31-.57-1.61.05C2.79 6.92 2 10.86 2 15c0 3.31 2.69 6 6 6 1.19 0 2.31-.35 3.26-.97.38-.24.7-.59 1.01-.95.27.36.62.71 1.01.95.94.62 2.06.97 3.26.97 3.31 0 6-2.69 6-6 0-4.14-.79-8.08-2.36-11.2zM8 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm8 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>', name: 'Animales' },
  { id: 'profesiones', premium: true, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f472b6"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-8-2h4v2h-4V4zm8 13H4V8h16v9z"/></svg>', name: 'Profesiones' },
  { id: 'deportes', premium: true, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f87171"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.89-7.61L13 11V6h-2v5l-2.89 1.39c-.85.41-1.21 1.43-.8 2.29.41.85 1.43 1.21 2.29.8L12 14l2.41 1.46c.85.41 1.88.05 2.29-.8.41-.86.05-1.88-.81-2.27z"/></svg>', name: 'Deportes' },
  { id: 'tecnologia', premium: true, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#60a5fa"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>', name: 'Tecnología' },
  { id: 'fantasia', premium: true, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#818cf8"><path d="M10.59 4.59C10.21 4.21 9.7 4 9.17 4 8.1 4 7.17 4.94 7.27 6.2l.27 3.54-2.32-.8c-.36-.13-.76-.06-1.06.17-.32.25-.5.63-.5 1.04 0 .31.1.6.29.85l4.92 6.42c.48.62 1.3 1.02 2.2 1.02H19c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2h-3.17l-1.87-6.42c-.19-.67-.8-1.11-1.49-1.11-.4 0-.78.16-1.07.45l-.81.83zM5 18H3v2h2v-2zm-2-4h2v2H3v-2z"/></svg>', name: 'Fantasía' }
];

// --- LÓGICA DE ANUNCIOS ---
async function initAdMob() {
    if(!AdMob) return;
    try {
        await AdMob.initialize({ requestTrackingAuthorization: true, initializeForTesting: true });
        await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado, isTesting: true });
        await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial, isTesting: true });
    } catch(e) { console.error("Error AdMob", e); }
}

async function showRewardForCategory(catId) {
    // 1. Verificar límite de videos (Máximo 2)
    if (unlockedCategories.size >= MAX_VIDEO_UNLOCKS) {
        alert(`❌ Límite alcanzado.\nSolo puedes desbloquear ${MAX_VIDEO_UNLOCKS} categorías gratis viendo anuncios.\n\n¡Hazte Premium para desbloquear todo sin límites!`);
        return;
    }

    if(!AdMob) {
        // [MODO WEB/PC]
        alert("[MODO WEB] Simulando video... Categoría desbloqueada.");
        unlockedCategories.add(catId);
        selectedCategories.add(catId);
        renderCategoriesGrid();
        return;
    }
    try {
        await AdMob.showRewardVideoAd();
        unlockedCategories.add(catId);
        selectedCategories.add(catId);
        renderCategoriesGrid();
        await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado, isTesting: true });
    } catch(e) {
        alert("No se pudo cargar el anuncio. Intenta de nuevo.");
        await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado, isTesting: true });
    }
}

async function showInterstitialEndGame() {
    if(!AdMob) return;
    try {
        await AdMob.showInterstitial();
        await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial, isTesting: true });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  initAdMob();
  renderCategoriesGrid();
  updateCategoriesSummary();
  setupEventListeners();
});

function setupEventListeners() {
  const screens = ['screenHome', 'screenCreate', 'screenJoin', 'screenCategories'];
  const show = (id) => screens.forEach(s => {
      const el = qs(s);
      if(el) el.style.display = (s === id ? 'flex' : 'none');
  });

  qs('btnGoCreate').onclick = () => { playSound('soundClick'); show('screenCreate'); };
  qs('btnGoJoin').onclick = () => { playSound('soundClick'); show('screenJoin'); };
  qs('backFromCreate').onclick = () => { playSound('soundClick'); show('screenHome'); };
  qs('backFromJoin').onclick = () => { playSound('soundClick'); show('screenHome'); };
  
  // Categorías
  qs('btnOpenCategories').onclick = () => { playSound('soundClick'); show('screenCategories'); };
  qs('backFromCategories').onclick = () => { playSound('soundClick'); show('screenCreate'); };
  qs('btnSaveCategories').onclick = () => { playSound('soundClick'); updateCategoriesSummary(); show('screenCreate'); };
  
  // Como Jugar
  qs('btnHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'flex';
  qs('btnCloseHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'none';

  // PREMIUM
  const btnPrem = qs('btnPremium');
  if(btnPrem) btnPrem.onclick = () => { playSound('soundClick'); qs('premiumOverlay').style.display = 'flex'; };
  const btnClosePrem = qs('btnClosePremium');
  if(btnClosePrem) btnClosePrem.onclick = () => qs('premiumOverlay').style.display = 'none';

  qs('btnCreateRoom').onclick = () => { playSound('soundClick'); createRoom(); };
  qs('btnJoinRoom').onclick = () => { playSound('soundClick'); joinRoom(); };
  qs('btnStartRound').onclick = () => { if(isHost) socket.emit('startRound'); };
  qs('btnExit').onclick = () => location.reload();
  qs('btnBackToLobby').onclick = () => { qs('ejectionOverlay').style.display = 'none'; if(currentRoom) updateGameView(currentRoom); };
  
  const copyBtn = qs('btnCopyCode');
  copyBtn.onclick = () => { 
    const code = qs('roomCodeDisplay').innerText; 
    if(code !== '------') {
        navigator.clipboard.writeText(code);
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
        setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 2000);
    }
  };

  qs('btnSkipVote').onclick = () => { if(!currentRoom || currentPhase !== 'vote' || voteLocked) return; socket.emit('submitVote', { targetId: 'skip' }); voteLocked = true; qs('voteSubtitle').innerText = 'Has votado saltar.'; };
  qs('btnEndTurn').onclick = () => { if(currentRoom && currentPhase === 'turn') socket.emit('endTurnEarly'); };
  qs('btnDiscord').onclick = () => { if(currentRoom?.discordLink) window.open(currentRoom.discordLink, '_blank'); };
}

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid');
  grid.innerHTML = '';
  
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('div');
    const isSelected = selectedCategories.has(cat.id);
    const isLocked = cat.premium && !unlockedCategories.has(cat.id);

    btn.className = 'category-card-square';
    if(isSelected && !isLocked) btn.className += ' active';
    if(isLocked) btn.className += ' locked'; 

    let content = `<div class="cat-icon">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
    
    if(isLocked) {
        content += `<div style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.6); border-radius:50%; padding:4px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/></svg>
        </div>`;
    }

    btn.innerHTML = content;
    btn.style.position = 'relative'; 

    btn.onclick = () => {
      playSound('soundClick');
      if (isLocked) {
          if(confirm(`Categoría ${cat.name} bloqueada. ¿Ver video para desbloquear? (Max ${MAX_VIDEO_UNLOCKS})`)) {
              showRewardForCategory(cat.id);
          }
      } else {
          if(selectedCategories.has(cat.id)) selectedCategories.delete(cat.id);
          else selectedCategories.add(cat.id);
          if(selectedCategories.size === 0) selectedCategories.add(cat.id); 
          renderCategoriesGrid();
      }
    };
    grid.appendChild(btn);
  });
}

function updateCategoriesSummary() { const names = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name); qs('categoriesSummary').innerText = names.join(', '); }

window.adjustValue = function(id, delta) {
  const input = qs(id);
  let val = parseInt(input.value);
  if(id === 'maxPlayers') val = Math.min(15, Math.max(3, val + delta));
  if(id === 'impostors') val = Math.min(4, Math.max(1, val + delta));
  if(id === 'timeVote') val = Math.min(300, Math.max(60, val + delta));
  input.value = val;
  if(id === 'maxPlayers') qs('displayPlayers').innerText = val;
  if(id === 'impostors') qs('displayImpostors').innerText = val;
  if(id === 'timeVote') qs('displayVoteTime').innerText = val;
};

window.toggleSecretCard = function() { 
    if(currentPhase !== 'word') return; 
    const cardInner = qs('secretCardInner');
    if (cardInner.classList.contains('flipped')) {
        cardInner.classList.remove('flipped');
    } else {
        playSound('soundFlip'); 
        cardInner.classList.add('flipped');
    }
};

function createRoom() {
  if(selectedCategories.size === 0) return alert('Elige categorías');
  socket.emit('createRoom', {
    name: qs('hostName').value || 'Agente', maxPlayers: qs('maxPlayers').value, impostors: qs('impostors').value,
    categories: Array.from(selectedCategories), voteTime: qs('timeVote').value, 
    groupMode: qs('groupModeToggle').checked
  }, handleJoin);
}
function joinRoom() { socket.emit('joinRoom', { name: qs('joinName').value || 'Agente', roomCode: qs('joinCode').value }, handleJoin); }

function handleJoin(res) {
  if(!res.ok) return alert(res.error || 'Error');
  myId = res.me.id; isHost = res.isHost;
  qs('lobbyOverlay').style.display = 'none'; qs('mainContent').style.display = 'block'; qs('roomCodeDisplay').innerText = res.roomCode;
  if(res.discordLink && !isHost) setTimeout(() => window.open(res.discordLink, '_blank'), 500); 
  if(res.room) { currentRoom = res.room; updateGameView(res.room); }
}

socket.on('roomState', (room) => { currentRoom = room; updateGameView(room); });
socket.on('privateRole', (data) => { 
  myRole = data.role; myWord = data.word; myHint = data.hint; 
  if(currentPhase === 'word') updateWordCard(); 
  if(myRole === 'IMPOSTOR') qs('secretCardInner').classList.add('impostor-card');
  else qs('secretCardInner').classList.remove('impostor-card');
});

socket.on('roundResult', (data) => {
  const resultTitle = qs('resultTitle');
  const resultSubtitle = qs('resultSubtitle');
  const resultIcon = qs('resultIcon');
  const finalWordRow = qs('finalSecretWord').parentElement;
  const finalImpostorsRow = qs('finalImpostors').parentElement;

  showInterstitialEndGame();

  if (data.result === 'tie') {
      playSound('soundLose'); 
      resultTitle.innerText = "EMPATE";
      resultTitle.style.color = "#facc15"; 
      resultSubtitle.innerText = data.reason;
      resultIcon.innerHTML = '⚖️'; 
      finalWordRow.style.display = 'none'; 
      finalImpostorsRow.style.display = 'none'; 
  } else {
      qs('finalSecretWord').innerText = data.secretWord;
      qs('finalImpostors').innerText = data.impostors.join(', ');
      finalWordRow.style.display = 'flex';
      finalImpostorsRow.style.display = 'flex';

      const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR');
      if(iWon) { 
          playSound('soundWin'); 
          resultTitle.innerText = "VICTORIA"; 
          resultTitle.style.color = "#4ade80";
          resultIcon.innerHTML = '🏆';
      } else { 
          playSound('soundLose'); 
          resultTitle.innerText = "DERROTA"; 
          resultTitle.style.color = "#ef4444";
          resultIcon.innerHTML = '💀';
      }
      resultSubtitle.innerText = data.reason;
  }
  qs('ejectionOverlay').style.display = 'flex';
});

function updateGameView(room) {
  if (!room) return;
  currentPhase = room.phase; isHost = (room.hostId === myId);

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  const setDisplay = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; };

  setTxt('phaseLabel', currentPhase.toUpperCase());
  setTxt('timerNumber', room.timerText || '--');
  setTxt('currentPlayersCount', room.players.length);
  setTxt('currentImpostorsCount', room.impostors);

  const list = document.getElementById('playersList');
  if (list) {
      list.innerHTML = '';
      (room.players || []).forEach(p => {
        const row = document.createElement('div'); 
        row.className = 'player-row';
        if(p.isDead) row.style.opacity = '0.5';
        if(room.currentTurnId === p.id) row.style.border = '1px solid #3b82f6';
        
        const badge = p.id === room.hostId ? '<span style="font-size:0.6rem; background:#ffffff20; padding:2px 6px; border-radius:4px; margin-left:auto;">HOST</span>' : '';
        
        row.innerHTML = `
            <div style="width:28px;height:28px;background:${p.color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#000;font-size:0.8rem;">${p.name.charAt(0).toUpperCase()}</div>
            <div style="font-weight:600; font-size:0.9rem; margin-left:10px;">${p.name}</div>
            ${badge}
        `;
        list.appendChild(row);
      });
  }

  const btnStart = document.getElementById('btnStartRound');
  if (btnStart) {
      btnStart.style.display = (isHost && currentPhase === 'lobby' && room.players.length >= 2) ? 'block' : 'none';
  }

  const btnDiscord = document.getElementById('btnDiscord');
  if (btnDiscord) btnDiscord.style.display = room.discordLink ? 'flex' : 'none';

  ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => setDisplay(v, false));

  if (currentPhase === 'lobby') { 
      setDisplay('viewLobby', true);
      const st = document.getElementById('statusText');
      if(st) st.innerHTML = isHost ? "Inicia cuando estén listos." : `Esperando<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>`;
  } 
  else if (currentPhase === 'word') { 
      setDisplay('viewWord', true);
      const card = document.getElementById('secretCardInner');
      if(card) card.classList.remove('flipped'); 
      updateWordCard();
      setTxt('statusText', "Memorizando roles...");
  } 
  else if (currentPhase === 'turn') { 
      setDisplay('viewTurn', true);
      const turnP = room.players.find(p => p.id === room.currentTurnId);
      setTxt('currentTurnPlayer', turnP ? turnP.name : '...');
      
      const turnActions = document.getElementById('turnActions');
      if(turnActions) turnActions.style.display = (room.currentTurnId === myId) ? 'block' : 'none';
      
      setTxt('statusText', "Ronda de pistas.");
  } 
  else if (currentPhase === 'vote') { 
      setDisplay('viewVote', true);
      renderVoteGrid(room);
      setTxt('statusText', "Votación en curso.");
  }
}

function updateWordCard() { 
    const rt = qs('roleTitle'); if(rt) rt.innerText = myRole; 
    const sw = qs('secretWordDisplay'); if(sw) sw.innerText = myWord; 
    const wh = qs('wordHint'); if(wh) wh.innerText = myHint; 
}

function renderVoteGrid(room) {
  const grid = qs('votePlayersGrid'); if(!grid) return;
  grid.innerHTML = ''; voteLocked = !!(room.votes && room.votes[myId]);
  room.players.filter(p => !p.isDead && p.id !== myId).forEach(p => {
    const btn = document.createElement('div'); btn.className = 'mini-card'; btn.style.cursor = 'pointer';
    if(room.votes && room.votes[myId] === p.id) btn.style.border = '2px solid #ef4444';
    btn.innerHTML = `<div style="font-weight:bold;">${p.name}</div>`;
    btn.onclick = () => { if(voteLocked) return; socket.emit('submitVote', { targetId: p.id }); voteLocked = true; qs('voteSubtitle').innerText = `Votaste a ${p.name}`; };
    grid.appendChild(btn);
  });
}