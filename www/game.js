const socket = io('https://incognitogame.online', { transports: ['websocket'], reconnection: true, reconnectionAttempts: 50, reconnectionDelay: 500 });

// --- VERSIÓN DEL CLIENTE (Sube esto cada vez que actualices el APK) ---
const CLIENT_VERSION = 26;

function getDeviceId() { let id = localStorage.getItem('deviceUUID'); if (!id) { id = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now(); localStorage.setItem('deviceUUID', id); } return id; }
const MY_DEVICE_ID = getDeviceId();

const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;
const ADMOB_IDS = { intersticial: 'ca-app-pub-6788680373227341/8374567976', bonificado: 'ca-app-pub-6788680373227341/4416794053' };

let myId = null; let isHost = false; let currentRoom = null; let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let isPremium = localStorage.getItem('isPremium') === 'true';
let unlockedCategories = new Set(JSON.parse(localStorage.getItem('videoUnlocks') || '[]')); 
let myRole = null; let myWord = null; let myHint = null; let myCategory = null; let myPartners = [];
const MAX_VIDEO_UNLOCKS = 2; 
let wakeLock = null; 

const qs = (id) => document.getElementById(id);
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function playSound(id) { const audio = qs(id); if(audio) { audio.currentTime = 0; audio.play().catch(()=>{}); } }

const IMG_ICONS = {
    win: '<span class="result-icon-wrap result-icon-wrap--win" role="img" aria-label="Victoria"><svg class="result-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" fill="rgba(253, 224, 71, 0.45)"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" fill="rgba(253, 224, 71, 0.45)"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" fill="rgba(251, 191, 36, 0.28)"/></svg></span>',
    lose: '<span class="result-icon-wrap result-icon-wrap--lose" role="img" aria-label="Derrota"><svg class="result-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/><path d="M8 20v2h8v-2"/><path d="m12.5 17 .5-1 .5 1h-1z"/><circle cx="9" cy="9" r="1" fill="#fecaca"/><circle cx="15" cy="9" r="1" fill="#fecaca"/><path d="M9.5 13.5c.6 1.3 1.7 2 2.5 2s1.9-.7 2.5-2"/></svg></span>',
    tie: '<span class="result-icon-wrap result-icon-wrap--tie" role="img" aria-label="Empate"><svg class="result-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" fill="rgba(250, 204, 21, 0.14)"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" fill="rgba(250, 204, 21, 0.14)"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 4.5 1.5 4.5 1.5S9.5 10 11.5 10h2c2 0 4.5-1.5 4.5-1.5S20 7 22 7"/></svg></span>',
    boot: '<span class="result-icon-wrap result-icon-wrap--boot" role="img" aria-label="Expulsado"><svg class="result-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg></span>'
};

async function requestWakeLock() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (err) {}
}
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        if (wakeLock !== null) await requestWakeLock();
        if (!socket.connected) { 
            socket.connect(); 
        } else {
            if(currentRoom) socket.emit('joinRoom', { roomCode: currentRoom.code, userId: MY_DEVICE_ID, clientVersion: CLIENT_VERSION }, handleJoin);
        }
    }
});

function showModal(title, text, onConfirm) {
    qs('modalTitle').innerText = title; qs('modalText').innerText = text;
    const modal = qs('customModal'); modal.style.display = 'flex';
    const btnOk = qs('modalBtnOk'); const btnCancel = qs('modalBtnCancel');
    const newOk = btnOk.cloneNode(true); btnOk.parentNode.replaceChild(newOk, btnOk);
    const newCancel = btnCancel.cloneNode(true); btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    newOk.onclick = () => { modal.style.display = 'none'; if(onConfirm) onConfirm(); playSound('soundClick'); };
    newCancel.onclick = () => { modal.style.display = 'none'; playSound('soundClick'); };
}
function showInputModal(title, placeholder, onConfirm) {
    qs('inputModalTitle').innerText = title; const input = qs('modalInput'); input.value = ''; input.placeholder = placeholder;
    const modal = qs('customInputModal'); modal.style.display = 'flex';
    const btnOk = qs('inputModalBtnOk'); const btnCancel = qs('inputModalBtnCancel');
    const newOk = btnOk.cloneNode(true); btnOk.parentNode.replaceChild(newOk, btnOk);
    const newCancel = btnCancel.cloneNode(true); btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    newOk.onclick = () => { modal.style.display = 'none'; if(onConfirm) onConfirm(input.value); playSound('soundClick'); };
    newCancel.onclick = () => { modal.style.display = 'none'; playSound('soundClick'); };
}

const CATEGORIES_DATA = [
  { id: 'lugares', premium: false, name: 'Lugares', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' },
  { id: 'comidas', premium: false, name: 'Comidas', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="M2 16l20-8-8 20-4-10-4 10L2 16z"/></svg>' },
  { id: 'objetos', premium: false, name: 'Objetos', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
  { id: 'animales', premium: true, name: 'Animales', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><circle cx="9" cy="20" r="2"/><path d="M9 10a5 5 0 0 1 5 5v7l-1.9-1.27A3 3 0 0 0 11 17.38V15"/></svg>' },
  { id: 'profesiones', premium: true, name: 'Profesiones', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>' },
  { id: 'deportes', premium: true, name: 'Deportes', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 20 20"/><path d="M20 4 9.5 14.5"/><path d="M4 20l5.5-5.5"/><path d="M4 4l5.5 5.5"/><path d="M9.5 9.5 4 4"/><path d="M14.5 14.5 20 20"/></svg>' },
  { id: 'tecnologia', premium: true, name: 'Tecnología', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
  { id: 'fantasia', premium: true, name: 'Fantasía', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>' }
];

async function initAdMob() {
    if(!AdMob) return;
    try { await AdMob.initialize({ requestTrackingAuthorization: true, initializeForTesting: true }); await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado, isTesting: true }); await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial, isTesting: true }); } catch(e) {}
}
async function showRewardForCategory(catId) {
    if(isPremium) { unlockCategory(catId); return; }
    if (unlockedCategories.size >= MAX_VIDEO_UNLOCKS && !unlockedCategories.has(catId)) { showModal("Límite Gratuito", "Ya desbloqueaste 2 categorías. Hazte Premium para más.", () => { qs('screenCategories').style.display = 'none'; qs('screenPremium').style.display = 'flex'; }); return; }
    if(!AdMob) { alert("[MODO WEB] Simulando video..."); setTimeout(() => unlockCategory(catId), 1000); return; }
    try { await AdMob.showRewardVideoAd(); unlockCategory(catId); await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado, isTesting: true }); } catch(e) { alert("Error cargando anuncio."); }
}
function unlockCategory(catId) { unlockedCategories.add(catId); localStorage.setItem('videoUnlocks', JSON.stringify(Array.from(unlockedCategories))); selectedCategories.add(catId); renderCategoriesGrid(); playSound('soundWin'); }
async function handleCreateRoomFlow() {
    if (isPremium || !AdMob) { createRoom(); return; }
    try { await AdMob.showInterstitial(); createRoom(); await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial, isTesting: true }); } catch(e) { createRoom(); await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial }); }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (isPremium) unlockedCategories = new Set(CATEGORIES_DATA.map(c => c.id));
  await initAdMob(); 
  
  // PROTECCIÓN CONTRA EL ERROR NULL
  const grid = qs('categoriesGrid');
  if(grid) renderCategoriesGrid(); 
  
  updateCategoriesSummary(); 
  setupEventListeners();
  const savedName = localStorage.getItem('playerName'); if(savedName) { qs('hostName').value = savedName; qs('joinName').value = savedName; }
  setupModeSelectors(); 
  requestWakeLock();
});

function setupModeSelectors() {
    const modes = ['modeText', 'modeGroup', 'modeDiscord'];
    modes.forEach(m => {
        const el = qs(m);
        if (el) {
            const select = () => {
                modes.forEach(om => { const o = qs(om); if (o) o.classList.remove('selected-mode'); });
                el.classList.add('selected-mode');
                playSound('soundClick');
            };
            el.addEventListener('click', select);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select();
                }
            });
        }
    });
}

function setupEventListeners() {
  const screens = ['screenHome', 'screenCreate', 'screenJoin', 'screenCategories', 'screenPremium'];
  const show = (id) => {
      screens.forEach(s => { const el = qs(s); if(el) el.style.display = (s === id ? 'flex' : 'none'); });
      if(id === 'screenJoin') refreshPublicRooms();
  };

  const btnCreate = qs('btnGoCreate'); if(btnCreate) btnCreate.onclick = () => { playSound('soundClick'); show('screenCreate'); };
  const btnJoin = qs('btnGoJoin'); if(btnJoin) btnJoin.onclick = () => { playSound('soundClick'); show('screenJoin'); };
  
  const backCreate = qs('backFromCreate'); if(backCreate) backCreate.onclick = () => { playSound('soundClick'); show('screenHome'); };
  const backJoin = qs('backFromJoin'); if(backJoin) backJoin.onclick = () => { playSound('soundClick'); show('screenHome'); };
  
  const btnOpenCat = qs('btnOpenCategories'); if(btnOpenCat) btnOpenCat.onclick = () => { playSound('soundClick'); show('screenCategories'); };
  const backCat = qs('backFromCategories'); if(backCat) backCat.onclick = () => { playSound('soundClick'); show('screenCreate'); };
  const btnSaveCat = qs('btnSaveCategories'); if(btnSaveCat) btnSaveCat.onclick = () => { playSound('soundClick'); updateCategoriesSummary(); show('screenCreate'); };
  
  const btnHow = qs('btnHowToPlay'); if(btnHow) btnHow.onclick = () => qs('howToPlayOverlay').style.display = 'flex';
  const btnCloseHow = qs('btnCloseHowToPlay'); if(btnCloseHow) btnCloseHow.onclick = () => qs('howToPlayOverlay').style.display = 'none';

  const btnPrem = qs('btnPremium'); if(btnPrem) btnPrem.onclick = () => { playSound('soundClick'); show('screenPremium'); };
  const btnBackPrem = qs('btnBackFromPremium'); if(btnBackPrem) btnBackPrem.onclick = () => { playSound('soundClick'); show('screenHome'); };
  
  const btnCreateRoom = qs('btnCreateRoom'); if(btnCreateRoom) btnCreateRoom.onclick = () => { playSound('soundClick'); handleCreateRoomFlow(); };
  const btnJoinRoom = qs('btnJoinRoom'); if(btnJoinRoom) btnJoinRoom.onclick = () => { playSound('soundClick'); joinRoom(); };

  const joinCodeEl = qs('joinCode');
  if (joinCodeEl) {
    joinCodeEl.addEventListener('input', () => {
      joinCodeEl.value = joinCodeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
  }
  const btnRefreshPublicRooms = qs('btnRefreshPublicRooms');
  if (btnRefreshPublicRooms) btnRefreshPublicRooms.onclick = () => { playSound('soundClick'); refreshPublicRooms(); };
  
  const btnStart = qs('btnStartRound');
  if(btnStart) btnStart.onclick = () => { 
      if(isHost) {
          if(currentRoom && currentRoom.players.length < 3) return showModal("Faltan Jugadores", "Se necesitan mínimo 3 para jugar.");
          showModal("¿Iniciar Partida?", "Todos recibirán sus roles.", () => socket.emit('startRound'));
      }
  };
  
  const btnExit = qs('btnExit'); if(btnExit) btnExit.onclick = () => { showModal("¿Salir?", "Volverás al menú principal.", () => location.reload()); };
  const btnBackLobby = qs('btnBackToLobby'); if(btnBackLobby) btnBackLobby.onclick = () => { qs('ejectionOverlay').style.display = 'none'; if(currentRoom) updateGameView(currentRoom); };
  const btnReady = qs('btnReady'); if(btnReady) btnReady.onclick = () => { socket.emit('skipIntro'); qs('btnReady').style.display='none'; };

  const copyBtn = qs('btnCopyCode');
  if(copyBtn) {
      copyBtn.onclick = () => { 
          const code = qs('roomCodeDisplay').innerText; 
          if(code !== '------') { 
              navigator.clipboard.writeText(code); 
              copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'; 
              setTimeout(() => { copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; }, 2000); 
          } 
      };
  }

  const btnSkip = qs('btnSkipVote');
  if(btnSkip) btnSkip.onclick = () => { if(!currentRoom || currentPhase !== 'vote') return; socket.emit('submitVote', { targetId: 'skip' }); };
  
  const btnEnd = qs('btnEndTurn');
  if(btnEnd) btnEnd.onclick = () => { if(currentRoom && currentPhase === 'turn') socket.emit('endTurnEarly'); };
  
  const btnDiscord = qs('btnDiscord');
  if(btnDiscord) btnDiscord.onclick = () => { if(currentRoom?.discordLink) window.open(currentRoom.discordLink, '_blank'); };
  
  const btnSend = qs('btnSendClue');
  if(btnSend) btnSend.onclick = () => { const input = qs('inputClue'); const text = input.value.trim(); if(!text) return; socket.emit('submitClue', { text: text }); input.value = ''; };

  const btnCancel = document.getElementById('btnCancelRound');
  if(btnCancel) btnCancel.onclick = () => { showModal("¿Cancelar Ronda?", "Volverán todos al Lobby.", () => socket.emit('cancelRound')); };

  const btnBuy = qs('btnBuyPremium'); 
  if(btnBuy) btnBuy.onclick = () => { 
      showInputModal("Código Promocional", "Ingresa tu código...", (code) => {
          if (code && code.toUpperCase() === "INC2025") activatePremium();
          else showModal("Error", "Código inválido o expirado.");
      });
  };

  const cardContainer = document.getElementById('cardContainer');
  if(cardContainer) {
      const newCard = cardContainer.cloneNode(true);
      cardContainer.parentNode.replaceChild(newCard, cardContainer);
      newCard.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const inner = newCard.querySelector('.secret-card-inner');
          if(inner) { playSound('soundFlip'); inner.classList.toggle('flipped'); }
      });
  }
}

function refreshPublicRooms() {
    socket.emit('getPublicRooms');
}
socket.on('publicRoomsList', (rooms) => {
    const list = qs('publicRoomsContainer');
    if(!list) return;
    list.innerHTML = '';
    if(rooms.length === 0) {
        list.innerHTML = '<div class="public-rooms-empty">No hay salas públicas ahora.</div>';
        return;
    }
    rooms.forEach(r => {
        const div = document.createElement('div');
        div.className = 'public-room-card';
        div.setAttribute('role', 'listitem');
        div.tabIndex = 0;
        const modeLabel = r.mode === 'discord' ? 'Voz · Discord' : (r.mode === 'text' ? 'Chat' : 'Grupal');
        const title = escapeHtml(r.name || 'Sala');
        const code = escapeHtml(r.code || '');
        div.innerHTML = `<div class="public-room-card-info">
            <div class="public-room-card-title">${title}</div>
            <div class="public-room-card-meta">${r.players}/${r.max} · ${escapeHtml(modeLabel)}</div>
          </div>
          <span class="btn-main btn-primary btn-public-join">Entrar</span>`;
        const go = () => {
            const jc = qs('joinCode');
            if (jc) jc.value = (r.code || '').toUpperCase();
            joinRoom();
        };
        div.onclick = go;
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
            }
        });
        list.appendChild(div);
    });
});

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid'); 
  if(!grid) return; 
  grid.innerHTML = '';
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('div');
    const isSelected = selectedCategories.has(cat.id); const isLocked = cat.premium && !unlockedCategories.has(cat.id);
    btn.className = 'category-card-square' + (isSelected && !isLocked ? ' active' : '') + (isLocked ? ' locked' : '');
    let content = `<div class="cat-icon" style="width:32px; height:32px; margin-bottom:5px;">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
    if(isLocked) content += `<div style="position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,0.7);border-radius:16px;display:flex;align-items:center;justify-content:center;"><span style="font-size:1.5rem;">📺</span></div>`;
    btn.innerHTML = content;
    btn.onclick = () => { playSound('soundClick'); if (isLocked) { showModal("Desbloquear", `¿Ver video para ${cat.name}?`, () => showRewardForCategory(cat.id)); } else { if(selectedCategories.has(cat.id)) selectedCategories.delete(cat.id); else selectedCategories.add(cat.id); if(selectedCategories.size===0) selectedCategories.add(cat.id); renderCategoriesGrid(); } };
    grid.appendChild(btn);
  });
}

function updateCategoriesSummary() { 
    const el = qs('categoriesSummary');
    if (!el) return;
    const names = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name);
    el.innerHTML = names.map(n => `<span class="cat-pill">${n}</span>`).join('');
}

window.changeLobbySetting = function(key, d) {
    if(!isHost || !currentRoom) return;
    const curPlayers = currentRoom.maxPlayers || 10;
    const curImps = currentRoom.impostors || 2;
    const curTime = (currentRoom.config && currentRoom.config.voteTime) ? currentRoom.config.voteTime / 1000 : 120;

    playSound('soundClick');
    let v;
    if(key === 'maxPlayers') { v = Math.min(15, Math.max(3, curPlayers + d)); socket.emit('updateSettings', { maxPlayers: v }); }
    else if(key === 'impostors') { v = Math.min(4, Math.max(1, curImps + d)); socket.emit('updateSettings', { impostors: v }); }
    else if(key === 'timeVote') { v = Math.min(300, Math.max(60, curTime + d)); socket.emit('updateSettings', { voteTime: v }); }
};

function createRoom() {
  const nameInput = qs('hostName');
  if(!nameInput || !nameInput.value.trim()) return showModal("Nombre Requerido", "Debes ponerte un nombre para crear sala.");
  
  if(selectedCategories.size === 0) return alert('Elige categorías');
  let mode = 'group'; 
  const mt = qs('modeText'); if(mt && mt.classList.contains('selected-mode')) mode = 'text';
  const md = qs('modeDiscord'); if(md && md.classList.contains('selected-mode')) mode = 'discord';
  const isPublic = qs('chkPublicRoom') ? qs('chkPublicRoom').checked : false;

  socket.emit('createRoom', { 
      name: nameInput.value.trim(), 
      categories: Array.from(selectedCategories), 
      mode: mode,
      isPublic: isPublic, 
      userId: MY_DEVICE_ID,
      clientVersion: CLIENT_VERSION 
  }, handleJoin);
}

function joinRoom() { 
    const nameInput = qs('joinName');
    if(!nameInput || !nameInput.value.trim()) return showModal("Nombre Requerido", "Debes ponerte un nombre para entrar.");

    const name = nameInput.value.trim();
    localStorage.setItem('playerName', name); 
    socket.emit('joinRoom', { name: name, roomCode: (qs('joinCode').value || '').trim().toUpperCase(), userId: MY_DEVICE_ID, clientVersion: CLIENT_VERSION }, handleJoin); 
}

function handleJoin(res) {
  // ERROR DE VERSIÓN VIEJA
  if(!res.ok && res.error === 'UPDATE_REQUIRED') {
      qs('updateOverlay').style.display = 'flex';
      return;
  }

  if(!res.ok) return showModal("Error", res.error);
  myId = res.me.id; isHost = res.isHost;
  qs('lobbyOverlay').style.display = 'none'; qs('mainContent').style.display = 'block'; qs('roomCodeDisplay').innerText = res.roomCode;
  requestWakeLock();
  if(res.discordLink && !isHost) setTimeout(() => window.open(res.discordLink, '_blank'), 500); 
  if(res.room) { currentRoom = res.room; updateGameView(res.room); }
}

socket.on('roomState', (room) => { currentRoom = room; updateGameView(room); });
socket.on('privateRole', (data) => { 
    myRole = data.role; myWord = data.word; myHint = data.hint; 
    myCategory = data.category; myPartners = data.partners || [];
    const card = qs('secretCardInner'); if(card) card.classList.remove('flipped');
    if(currentPhase === 'word') updateWordCard(); 
    if(myRole === 'IMPOSTOR') qs('secretCardInner').classList.add('impostor-card'); 
    else qs('secretCardInner').classList.remove('impostor-card'); 
});
socket.on('kicked', () => { window.location.reload(); });

socket.on('roundResult', (data) => {
  const t = qs('resultTitle'), s = qs('resultSubtitle'), i = qs('resultIcon');
  if(!isPremium && AdMob) { AdMob.showInterstitial().catch(()=>{}); AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial }); }
  
  const detailsBox = qs('resultDetails');

  if (data.result === 'tie') { 
      playSound('soundLose'); 
      t.innerText = "Nadie Expulsado"; t.style.color = "#facc15"; i.innerHTML = IMG_ICONS.tie; 
      if(detailsBox) detailsBox.style.display = 'none';
  } 
  else if (data.result === 'ejected') {
      playSound('soundLose'); 
      t.innerText = "EXPULSADO"; t.style.color = "#f97316"; i.innerHTML = IMG_ICONS.boot; 
      if(detailsBox) detailsBox.style.display = 'none';
  }
  else {
      if(detailsBox) detailsBox.style.display = 'block';
      qs('finalSecretWord').innerText = data.secretWord; 
      qs('finalImpostors').innerText = data.impostors.join(', '); 
      
      const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR');
      if(iWon) { playSound('soundWin'); t.innerText = "¡VICTORIA!"; t.style.color = "#4ade80"; i.innerHTML = IMG_ICONS.win; } 
      else { playSound('soundLose'); t.innerText = "DERROTA"; t.style.color = "#ef4444"; i.innerHTML = IMG_ICONS.lose; } 
  }
  s.innerText = data.reason;
  
  const btn = qs('btnBackToLobby');
  if (data.result === 'ejected' || data.result === 'tie') {
      btn.innerText = "SIGUIENTE RONDA...";
  } else {
      btn.innerText = "VOLVER AL LOBBY";
  }
  
  qs('ejectionOverlay').style.display = 'flex';
});

function updateGameView(room) {
  if (!room) return;
  currentPhase = room.phase; 
  isHost = (room.hostId === myId) || (room.hostId === socket.id);

  if (currentPhase !== 'lobby') { qs('lobbyOverlay').style.display = 'none'; qs('mainContent').style.display = 'block'; }
  if (currentPhase === 'turn' || currentPhase === 'word') { const overlay = document.getElementById('ejectionOverlay'); if (overlay && overlay.style.display !== 'none') overlay.style.display = 'none'; }

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  const setDisplay = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; };

  setTxt('timerNumber', room.timerText || '--');
  setTxt('currentPlayersCount', room.players.length); 
  setTxt('currentImpostorsCount', room.impostors);

  // RENDERIZAR CLUES EN TURNO Y AHORA TAMBIÉN EN VOTO
  const isTextMode = (room.mode === 'text');
  if(isTextMode) {
      // Función helper para renderizar pistas
      const renderClues = (containerId) => {
          const cluesList = qs(containerId); 
          if(cluesList) {
              cluesList.innerHTML = '';
              if(room.clues && room.clues.length > 0) {
                  room.clues.forEach(clue => {
                      const div = document.createElement('div'); div.style.marginBottom = '5px'; div.style.fontSize = '0.9rem';
                      div.innerHTML = `<span style="color:${clue.color}; font-weight:800;">${clue.name}:</span> <span style="color:#fff;">${clue.text}</span>`;
                      cluesList.appendChild(div);
                  });
              } else { cluesList.innerHTML = '<div style="color:#64748b; font-size:0.8rem; font-style:italic;">Sin pistas escritas aún...</div>'; }
          }
      };

      if(currentPhase === 'turn') renderClues('cluesHistory');
      if(currentPhase === 'vote') renderClues('cluesHistoryVote'); // NUEVO ID PARA VOTO
  }

  if(currentPhase === 'lobby') {
      resetLocalGameData();
      const overlay = document.getElementById('ejectionOverlay');
      if(overlay) overlay.style.display = 'none';

      // FIX: EVITAR UNDEFINED CON FALLBACKS
      const lp = qs('lobbyPlayersVal'); if(lp) lp.innerText = (room.maxPlayers !== undefined) ? room.maxPlayers : 10;
      const li = qs('lobbyImpostorsVal'); if(li) li.innerText = (room.impostors !== undefined) ? room.impostors : 2;
      const lt = qs('lobbyTimeVal'); if(lt && room.config) lt.innerText = (room.config.voteTime / 1000) || 120;
      
      const hostPanel = qs('hostControlsArea');
      if(hostPanel) hostPanel.style.display = isHost ? 'block' : 'none';

      setDisplay('viewLobby', true); 
      const st = document.getElementById('statusText'); if(st) st.innerHTML = isHost ? "Inicia cuando estén listos." : `Esperando al Host...`; 
  }
  else if (currentPhase === 'word') { 
      setDisplay('viewWord', true); 
      updateWordCard(); 
      if(room.introReady && room.introReady.includes(myId)) {
          qs('btnReady').style.display = 'none'; 
      } else {
          qs('btnReady').style.display = 'block'; 
      }
      setTxt('statusText', "Memorizando roles..."); 
  } 
  else if (currentPhase === 'turn') { 
      setDisplay('viewTurn', true); 
      const t = room.players.find(p => p.id === room.currentTurnId); 
      setTxt('currentTurnPlayer', t ? t.name : '...'); 
      
      const cluesContainer = qs('cluesHistoryContainer');
      if(cluesContainer) cluesContainer.style.display = isTextMode ? 'block' : 'none'; 
      
      const isMyTurn = (room.currentTurnId === myId);
      const inputArea = qs('turnInputArea'); if(inputArea) inputArea.style.display = (isMyTurn && isTextMode) ? 'flex' : 'none';
      const actionsNormal = qs('turnActionsNormal'); if(actionsNormal) actionsNormal.style.display = (isMyTurn && !isTextMode) ? 'block' : 'none';
      const waitMsg = qs('turnWaitMessage');
      if(waitMsg) { waitMsg.style.display = isMyTurn ? 'none' : 'block'; waitMsg.innerText = t ? `Esperando a ${t.name}...` : '...'; }

      setTxt('statusText', "Ronda de pistas.");
  } 
  else if (currentPhase === 'vote') { 
      setDisplay('viewVote', true); 
      renderVoteGrid(room); 
      
      // MOSTRAR CLUES TAMBIÉN EN VOTO SI ES MODO TEXTO
      const cluesContainerVote = qs('cluesHistoryContainerVote');
      if(cluesContainerVote) cluesContainerVote.style.display = isTextMode ? 'block' : 'none';

      setTxt('statusText', "Votación en curso."); 
  }

  const list = document.getElementById('playersList');
  if (list) {
      list.innerHTML = ''; 
      (room.players || []).forEach(p => {
        try {
            const pName = p.name ? p.name : 'Agente'; 
            const pColor = p.color ? p.color : '#64748b';
            const initial = pName.charAt(0).toUpperCase();
            const row = document.createElement('div'); row.className = 'player-row';
            
            if(p.isDead) row.style.opacity = '0.5';
            if(p.disconnected) row.style.border = '1px dashed #ef4444'; 
            else if(room.currentTurnId === p.id) row.style.border = '1px solid #3b82f6';

            const badge = p.id === room.hostId ? '<span style="font-size:0.6rem;background:#ffffff20;padding:2px 6px;border-radius:4px;margin-left:auto;">HOST</span>' : '';
            const discIcon = p.disconnected ? '🔌' : '';
            const deadIcon = p.isDead ? '💀' : '';
            
            let kickBtn = '';
            if(isHost && currentPhase === 'lobby' && p.id !== myId) {
                kickBtn = `<div style="display:flex; align-items:center; justify-content:center; width:30px;"><button class="btn-kick" onclick="socket.emit('kickPlayer', '${p.id}')">✖</button></div>`;
            }

            row.innerHTML = `<div style="display:flex;align-items:center;"><div style="width:28px;height:28px;background:${pColor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#000;font-size:0.8rem;">${initial}</div><div style="font-weight:600;font-size:0.9rem;margin-left:10px; color:#fff;">${pName} ${discIcon} ${deadIcon}</div></div><div style="display:flex;align-items:center;gap:5px;">${badge}${kickBtn}</div>`;
            list.appendChild(row);
        } catch (err) {}
      });
  }

  const btnStart = document.getElementById('btnStartRound'); 
  if (btnStart) {
      if (isHost && currentPhase === 'lobby') btnStart.style.display = 'block';
      else btnStart.style.display = 'none';
  }
  
  const btnDiscord = document.getElementById('btnDiscord'); if (btnDiscord) btnDiscord.style.display = room.discordLink ? 'flex' : 'none';
  const btnCancel = document.getElementById('btnCancelRound'); if(btnCancel) btnCancel.style.display = (isHost && currentPhase !== 'lobby') ? 'block' : 'none';

  ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => {
      const el = qs(v);
      if(currentPhase === 'lobby' && v === 'viewLobby') el.style.display = 'block';
      else if(currentPhase === 'word' && v === 'viewWord') el.style.display = 'block';
      else if(currentPhase === 'turn' && v === 'viewTurn') el.style.display = 'block';
      else if(currentPhase === 'vote' && v === 'viewVote') el.style.display = 'block';
      else el.style.display = 'none';
  });
}

function resetLocalGameData() {
    myRole = null; myWord = null; myHint = null; myCategory = null; myPartners = [];
    const card = qs('secretCardInner'); 
    if(card) {
        card.classList.remove('flipped');
        card.classList.remove('impostor-card');
    }
}

function updateWordCard() { 
    const rt = qs('roleTitle'); if(rt) rt.innerText = myRole || '...'; 
    const sw = qs('secretWordDisplay'); if(sw) sw.innerText = myWord || '...'; 
    const wh = qs('wordHint'); 
    
    if(myRole === 'IMPOSTOR') {
        let partnersText = '';
        if(myPartners && myPartners.length > 0) {
            partnersText = `<br><span style="color:#f87171; font-size:0.8rem;">Aliados: ${myPartners.join(', ')}</span>`;
        }
        if(wh) wh.innerHTML = `${myHint || ''}<br><span style="color:#fbbf24; font-weight:bold;">Categoría: ${myCategory || ''}</span>${partnersText}`;
    } else {
        if(wh) wh.innerText = myHint || '...';
    }
}

function votePendingText(room) {
    const n = room.votesPending;
    if (room.phase !== 'vote' || n === undefined || n === null) return '';
    return n === 1 ? 'Falta 1 jugador por votar.' : `Faltan ${n} jugadores por votar.`;
}

function renderVoteGrid(room) { 
    const grid = qs('votePlayersGrid'); if(!grid) return; grid.innerHTML = ''; 
    const subtitle = qs('voteSubtitle');

    const me = room.players.find(p => p.id === myId);
    if (me && me.isDead) {
        subtitle.innerText = "Estás muerto 💀 (Silencio)";
        grid.innerHTML = '<div style="color:#64748b; font-style:italic; padding:20px; text-align:center;">Los muertos no votan...</div>';
        qs('btnSkipVote').style.display = 'none'; 
        return;
    }

    const pendingLine = votePendingText(room);
    const voted = room.votes && Object.prototype.hasOwnProperty.call(room.votes, myId);
    if (subtitle) {
        if (voted) {
            const v = room.votes[myId];
            const choice = v === 'skip' ? 'Saltar' : (room.players.find(x => x.id === v)?.name || '—');
            subtitle.innerText = pendingLine ? `Votaste: ${choice}. ${pendingLine}` : `Votaste: ${choice}.`;
        } else {
            subtitle.innerText = pendingLine ? `${pendingLine} ¿A quién expulsas?` : '¿Quién miente?';
        }
    }

    qs('btnSkipVote').style.display = 'block'; qs('btnSkipVote').style.opacity = voted && room.votes[myId] === 'skip' ? '0.5' : '1';
    
    room.players.filter(p => !p.isDead && p.id !== myId).forEach(p => { 
        const btn = document.createElement('div'); btn.className = 'mini-card'; btn.style.cursor = 'pointer'; 
        if(room.votes && room.votes[myId] === p.id) btn.style.border = '2px solid #ef4444'; 
        btn.innerHTML = `<div style="font-weight:bold;">${p.name}</div>`; 
        btn.onclick = () => { 
            socket.emit('submitVote', { targetId: p.id }); 
            Array.from(grid.children).forEach(c => c.style.border = '1px solid #334155');
            btn.style.border = '2px solid #ef4444';
        }; 
        grid.appendChild(btn); 
    }); 
}
function activatePremium() { isPremium = true; localStorage.setItem('isPremium', 'true'); unlockedCategories = new Set(CATEGORIES_DATA.map(c => c.id)); renderCategoriesGrid(); showModal("¡Éxito!", "Premium Activado. Gracias por apoyar."); qs('screenPremium').style.display = 'none'; qs('screenHome').style.display = 'flex'; }