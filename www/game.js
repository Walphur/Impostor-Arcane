const socket = io('https://incognitogame.online', { transports: ['websocket'], reconnection: true, reconnectionAttempts: 20, reconnectionDelay: 1000 });
function getDeviceId() { let id = localStorage.getItem('deviceUUID'); if (!id) { id = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now(); localStorage.setItem('deviceUUID', id); } return id; }
const MY_DEVICE_ID = getDeviceId();

const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;
const ADMOB_IDS = { intersticial: 'ca-app-pub-6788680373227341/8374567976', bonificado: 'ca-app-pub-6788680373227341/4416794053' };

let myId = null; let isHost = false; let currentRoom = null; let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let isPremium = localStorage.getItem('isPremium') === 'true';
let unlockedCategories = new Set(JSON.parse(localStorage.getItem('videoUnlocks') || '[]')); 
let myRole = null; let myWord = null; let myHint = null; let voteLocked = false;
let flipTimeout = null; // Variable para controlar el cierre automático
const MAX_VIDEO_UNLOCKS = 2; 

const qs = (id) => document.getElementById(id);
function playSound(id) { const audio = qs(id); if(audio) { audio.currentTime = 0; audio.play().catch(()=>{}); } }

// --- MODAL GENÉRICO ---
function showModal(title, text, onConfirm) {
    qs('modalTitle').innerText = title;
    qs('modalText').innerText = text;
    const modal = qs('customModal');
    modal.style.display = 'flex';
    
    const btnOk = qs('modalBtnOk');
    const btnCancel = qs('modalBtnCancel');
    
    const newOk = btnOk.cloneNode(true); btnOk.parentNode.replaceChild(newOk, btnOk);
    const newCancel = btnCancel.cloneNode(true); btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    
    newOk.onclick = () => { modal.style.display = 'none'; if(onConfirm) onConfirm(); playSound('soundClick'); };
    newCancel.onclick = () => { modal.style.display = 'none'; playSound('soundClick'); };
}

// --- MODAL INPUT ---
function showInputModal(title, placeholder, onConfirm) {
    qs('inputModalTitle').innerText = title;
    const input = qs('modalInput');
    input.value = ''; input.placeholder = placeholder;
    const modal = qs('customInputModal');
    modal.style.display = 'flex';
    
    const btnOk = qs('inputModalBtnOk');
    const btnCancel = qs('inputModalBtnCancel');
    const newOk = btnOk.cloneNode(true); btnOk.parentNode.replaceChild(newOk, btnOk);
    const newCancel = btnCancel.cloneNode(true); btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    
    newOk.onclick = () => { modal.style.display = 'none'; if(onConfirm) onConfirm(input.value); playSound('soundClick'); };
    newCancel.onclick = () => { modal.style.display = 'none'; playSound('soundClick'); };
}

const CATEGORIES_DATA = [
  { id: 'lugares', premium: false, name: 'Lugares', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' },
  { id: 'comidas', premium: false, name: 'Comidas', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  { id: 'objetos', premium: false, name: 'Objetos', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
  { id: 'animales', premium: true, name: 'Animales', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2"/><path d="M9 10a2 2 0 0 1 2 2v.5"/><path d="M15 10a2 2 0 0 0-2 2v.5"/><path d="M9 16s1.5 2 3 2 3-2 3-2"/></svg>' },
  { id: 'profesiones', premium: true, name: 'Profesiones', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>' },
  { id: 'deportes', premium: true, name: 'Deportes', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>' },
  { id: 'tecnologia', premium: true, name: 'Tecnología', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
  { id: 'fantasia', premium: true, name: 'Fantasía', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>' }
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
  await initAdMob(); renderCategoriesGrid(); updateCategoriesSummary(); setupEventListeners();
  const savedName = localStorage.getItem('playerName'); if(savedName) { qs('hostName').value = savedName; qs('joinName').value = savedName; }
  setupModeSelectors(); 
});

function setupModeSelectors() {
    const modes = ['modeText', 'modeGroup', 'modeDiscord'];
    modes.forEach(m => {
        qs(m).addEventListener('click', () => {
            modes.forEach(om => qs(om).classList.remove('selected-mode'));
            qs(m).classList.add('selected-mode');
            playSound('soundClick');
        });
    });
}

function setupEventListeners() {
  const screens = ['screenHome', 'screenCreate', 'screenJoin', 'screenCategories', 'screenPremium'];
  const show = (id) => screens.forEach(s => { const el = qs(s); if(el) el.style.display = (s === id ? 'flex' : 'none'); });

  qs('btnGoCreate').onclick = () => { playSound('soundClick'); show('screenCreate'); };
  qs('btnGoJoin').onclick = () => { playSound('soundClick'); show('screenJoin'); };
  qs('backFromCreate').onclick = () => { playSound('soundClick'); show('screenHome'); };
  qs('backFromJoin').onclick = () => { playSound('soundClick'); show('screenHome'); };
  qs('btnOpenCategories').onclick = () => { playSound('soundClick'); show('screenCategories'); };
  qs('backFromCategories').onclick = () => { playSound('soundClick'); show('screenCreate'); };
  qs('btnSaveCategories').onclick = () => { playSound('soundClick'); updateCategoriesSummary(); show('screenCreate'); };
  
  qs('btnHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'flex';
  qs('btnCloseHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'none';

  const btnPrem = qs('btnPremium'); if(btnPrem) btnPrem.onclick = () => { playSound('soundClick'); show('screenPremium'); };
  const btnBackPrem = qs('btnBackFromPremium'); if(btnBackPrem) btnBackPrem.onclick = () => { playSound('soundClick'); show('screenHome'); };
  
  qs('btnCreateRoom').onclick = () => { playSound('soundClick'); handleCreateRoomFlow(); };
  qs('btnJoinRoom').onclick = () => { playSound('soundClick'); joinRoom(); };
  
  qs('btnStartRound').onclick = () => { 
      if(isHost) {
          if(currentRoom && currentRoom.players.length < 3) return showModal("Faltan Jugadores", "Se necesitan mínimo 3 para jugar.");
          showModal("¿Iniciar Partida?", "Todos recibirán sus roles.", () => socket.emit('startRound'));
      }
  };
  
  qs('btnExit').onclick = () => { showModal("¿Salir?", "Volverás al menú principal.", () => location.reload()); };
  qs('btnBackToLobby').onclick = () => { qs('ejectionOverlay').style.display = 'none'; if(currentRoom) updateGameView(currentRoom); };
  
  const copyBtn = qs('btnCopyCode');
  copyBtn.onclick = () => { 
      const code = qs('roomCodeDisplay').innerText; 
      if(code !== '------') { 
          navigator.clipboard.writeText(code); 
          copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'; 
          setTimeout(() => { copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; }, 2000); 
      } 
  };

  qs('btnSkipVote').onclick = () => { if(!currentRoom || currentPhase !== 'vote') return; socket.emit('submitVote', { targetId: 'skip' }); qs('voteSubtitle').innerText = 'Votaste saltar.'; };
  qs('btnEndTurn').onclick = () => { if(currentRoom && currentPhase === 'turn') socket.emit('endTurnEarly'); };
  qs('btnDiscord').onclick = () => { if(currentRoom?.discordLink) window.open(currentRoom.discordLink, '_blank'); };
  qs('btnSendClue').onclick = () => { const input = qs('inputClue'); const text = input.value.trim(); if(!text) return; socket.emit('submitClue', { text: text }); input.value = ''; };

  const btnCancel = document.getElementById('btnCancelRound');
  if(btnCancel) btnCancel.onclick = () => { showModal("¿Cancelar Ronda?", "Volverán todos al Lobby.", () => socket.emit('cancelRound')); };

  const btnBuy = qs('btnBuyPremium'); 
  if(btnBuy) btnBuy.onclick = () => { 
      showInputModal("Código Promocional", "Ingresa tu código...", (code) => {
          if (code && code.toUpperCase() === "INC2025") activatePremium();
          else showModal("Error", "Código inválido o expirado.");
      });
  };
}

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid'); grid.innerHTML = '';
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

function updateCategoriesSummary() { qs('categoriesSummary').innerText = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name).join(', '); }

// AJUSTES EN TIEMPO REAL (HOST)
window.adjustValue = function(id, d) { 
    const i = qs(id); let v = parseInt(i.value); 
    if(id==='maxPlayers') v = Math.min(15, Math.max(3, v + d)); 
    if(id==='impostors') v = Math.min(4, Math.max(1, v + d)); 
    if(id==='timeVote') v = Math.min(300, Math.max(60, v + d)); 
    i.value = v; 
    
    // Actualizar visual local
    if(id==='maxPlayers') qs('displayPlayers').innerText=v; 
    if(id==='impostors') qs('displayImpostors').innerText=v; 
    if(id==='timeVote') qs('displayVoteTime').innerText=v;

    if(isHost && currentRoom && currentPhase === 'lobby') {
        socket.emit('updateSettings', { [id]: v });
    }
};

// --- CARTA CON TOGGLE (MANUAL + 15 SEG AUTO-CIERRE) ---
window.toggleSecretCard = function() { 
    if(currentPhase!=='word')return; 
    const c=qs('secretCardInner'); 
    
    if(c.classList.contains('flipped')) {
        // SI ESTÁ ABIERTA -> CIÉRRALA
        c.classList.remove('flipped'); 
        if(flipTimeout) { clearTimeout(flipTimeout); flipTimeout = null; }
    } else { 
        // SI ESTÁ CERRADA -> ÁBRELA Y PON TIMER
        playSound('soundFlip'); 
        c.classList.add('flipped'); 
        
        // Reiniciar timer: se cierra sola a los 15s si el usuario no la cierra antes
        if(flipTimeout) clearTimeout(flipTimeout);
        flipTimeout = setTimeout(() => {
            c.classList.remove('flipped');
            flipTimeout = null;
        }, 15000);
    } 
};

function createRoom() {
  if(selectedCategories.size === 0) return alert('Elige categorías');
  let mode = 'group'; 
  if(qs('modeText').classList.contains('selected-mode')) mode = 'text';
  else if(qs('modeDiscord').classList.contains('selected-mode')) mode = 'discord';
  
  socket.emit('createRoom', { name: qs('hostName').value || 'Agente', maxPlayers: qs('maxPlayers').value, impostors: qs('impostors').value, categories: Array.from(selectedCategories), voteTime: qs('timeVote').value, mode: mode, userId: MY_DEVICE_ID }, handleJoin);
}
function joinRoom() { socket.emit('joinRoom', { name: qs('joinName').value || 'Agente', roomCode: qs('joinCode').value, userId: MY_DEVICE_ID }, handleJoin); }
function handleJoin(res) {
  if(!res.ok) return showModal("Error", res.error);
  myId = res.me.id; isHost = res.isHost;
  qs('lobbyOverlay').style.display = 'none'; qs('mainContent').style.display = 'block'; qs('roomCodeDisplay').innerText = res.roomCode;
  if(res.discordLink && !isHost) setTimeout(() => window.open(res.discordLink, '_blank'), 500); 
  if(res.room) { currentRoom = res.room; updateGameView(res.room); }
}

socket.on('roomState', (room) => { currentRoom = room; updateGameView(room); });
socket.on('privateRole', (data) => { myRole = data.role; myWord = data.word; myHint = data.hint; if(currentPhase === 'word') updateWordCard(); if(myRole === 'IMPOSTOR') qs('secretCardInner').classList.add('impostor-card'); else qs('secretCardInner').classList.remove('impostor-card'); });

socket.on('roundResult', (data) => {
  const t = qs('resultTitle'), s = qs('resultSubtitle'), i = qs('resultIcon');
  if(!isPremium && AdMob) { AdMob.showInterstitial().catch(()=>{}); AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial }); }
  
  if (data.result === 'tie') { 
      playSound('soundLose'); t.innerText = "Nadie Expulsado"; t.style.color = "#facc15"; i.innerHTML = '⚖️'; 
      qs('finalSecretWord').parentElement.style.display = 'none'; qs('finalImpostors').parentElement.style.display = 'none';
  } else {
      qs('finalSecretWord').innerText = data.secretWord; 
      qs('finalImpostors').innerText = data.impostors.join(', '); 
      qs('finalSecretWord').parentElement.style.display = 'flex'; 
      qs('finalImpostors').parentElement.style.display = 'flex'; 
      
      const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR');
      
      if(iWon) { 
          playSound('soundWin'); 
          t.innerText = "¡VICTORIA!"; t.style.color = "#4ade80"; i.innerHTML = '🏆'; 
      } else { 
          playSound('soundLose'); 
          t.innerText = "DERROTA"; t.style.color = "#ef4444"; i.innerHTML = '💀'; 
      } 
  }
  s.innerText = data.reason;
  qs('ejectionOverlay').style.display = 'flex';
});

function updateGameView(room) {
  if (!room) return;
  currentPhase = room.phase; 
  
  // Aseguramos que isHost se recalcule correctamente comparando IDs
  isHost = (room.hostId === myId) || (room.hostId === socket.id);

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  const setDisplay = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; };

  // 1. Actualizar Contadores Superiores
  setTxt('timerNumber', room.timerText || '--');
  setTxt('currentPlayersCount', room.players.length); 
  setTxt('currentImpostorsCount', room.impostors);

  // 2. Actualizar Configuración del Lobby
  if(currentPhase === 'lobby') {
      const pDisplay = qs('displayPlayers'); if(pDisplay) pDisplay.innerText = room.maxPlayers;
      const iDisplay = qs('displayImpostors'); if(iDisplay) iDisplay.innerText = room.impostors;
      
      // Protección contra crash de config vacía
      const vDisplay = qs('displayVoteTime'); 
      if(vDisplay && room.config) {
          vDisplay.innerText = room.config.voteTime / 1000;
      }
      
      const btns = document.querySelectorAll('.mini-controls button');
      btns.forEach(b => b.disabled = !isHost);
  }

  // 3. Lista de Agentes (BLINDADA CONTRA ERRORES)
  const list = document.getElementById('playersList');
  if (list) {
      list.innerHTML = ''; // Limpiar lista
      (room.players || []).forEach(p => {
        try {
            // Protección: Si faltan datos, usamos valores por defecto
            const pName = p.name ? p.name : 'Agente'; 
            const pColor = p.color ? p.color : '#64748b';
            const initial = pName.charAt(0).toUpperCase();
            
            const row = document.createElement('div'); 
            row.className = 'player-row';
            
            // Estilos dinámicos
            if(p.isDead) row.style.opacity = '0.5';
            if(p.disconnected) row.style.border = '1px dashed #ef4444'; 
            else if(room.currentTurnId === p.id) row.style.border = '1px solid #3b82f6';

            const badge = p.id === room.hostId ? '<span style="font-size:0.6rem;background:#ffffff20;padding:2px 6px;border-radius:4px;margin-left:auto;">HOST</span>' : '';
            const discIcon = p.disconnected ? '🔌' : '';

            // Insertamos el HTML del jugador
            row.innerHTML = `
                <div style="width:28px;height:28px;background:${pColor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#000;font-size:0.8rem;">${initial}</div>
                <div style="font-weight:600;font-size:0.9rem;margin-left:10px; color:#fff;">${pName} ${discIcon}</div>
                ${badge}
            `;
            list.appendChild(row);
        } catch (err) {
            console.error("Error dibujando jugador:", err);
        }
      });
  }

  // 4. Botones y Vistas (Ahora se ejecutará sí o sí)
  const btnStart = document.getElementById('btnStartRound'); 
  if (btnStart) {
      // Mostrar SOLO si soy Host Y estamos en Lobby
      if (isHost && currentPhase === 'lobby') {
          btnStart.style.display = 'block';
      } else {
          btnStart.style.display = 'none';
      }
  }
  
  const btnDiscord = document.getElementById('btnDiscord'); if (btnDiscord) btnDiscord.style.display = room.discordLink ? 'flex' : 'none';
  const btnCancel = document.getElementById('btnCancelRound'); if(btnCancel) btnCancel.style.display = (isHost && currentPhase !== 'lobby') ? 'block' : 'none';

  // 5. Gestión de Pantallas
  ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => setDisplay(v, false));

  if (currentPhase === 'lobby') { 
      setDisplay('viewLobby', true); 
      const st = document.getElementById('statusText'); 
      if(st) st.innerHTML = isHost ? "Inicia cuando estén listos." : `Esperando al Host...`; 
  } 
  else if (currentPhase === 'word') { 
      setDisplay('viewWord', true); 
      const c = document.getElementById('secretCardInner'); if(c) c.classList.remove('flipped'); 
      updateWordCard(); 
      setTxt('statusText', "Memorizando roles..."); 
  } 
  else if (currentPhase === 'turn') { 
      setDisplay('viewTurn', true); 
      const t = room.players.find(p => p.id === room.currentTurnId); 
      setTxt('currentTurnPlayer', t ? t.name : '...'); 
      
      const isTextMode = (room.mode === 'text');
      const cluesContainer = qs('cluesHistoryContainer');
      if(cluesContainer) cluesContainer.style.display = isTextMode ? 'block' : 'none'; 
      
      const isMyTurn = (room.currentTurnId === myId);
      const inputArea = qs('turnInputArea'); if(inputArea) inputArea.style.display = (isMyTurn && isTextMode) ? 'flex' : 'none';
      const actionsNormal = qs('turnActionsNormal'); if(actionsNormal) actionsNormal.style.display = (isMyTurn && !isTextMode) ? 'block' : 'none';
      const waitMsg = qs('turnWaitMessage');
      if(waitMsg) {
          waitMsg.style.display = isMyTurn ? 'none' : 'block';
          waitMsg.innerText = t ? `Esperando a ${t.name}...` : '...';
      }

      if(isTextMode) {
          const cluesList = qs('cluesHistory'); 
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
      }
      setTxt('statusText', "Ronda de pistas.");
  } 
  else if (currentPhase === 'vote') { 
      setDisplay('viewVote', true); 
      renderVoteGrid(room); 
      setTxt('statusText', "Votación en curso."); 
  }
}

function updateWordCard() { const rt = qs('roleTitle'); if(rt) rt.innerText = myRole; const sw = qs('secretWordDisplay'); if(sw) sw.innerText = myWord; const wh = qs('wordHint'); if(wh) wh.innerText = myHint; }
function renderVoteGrid(room) { 
    const grid = qs('votePlayersGrid'); if(!grid) return; grid.innerHTML = ''; 
    room.players.filter(p => !p.isDead && p.id !== myId).forEach(p => { 
        const btn = document.createElement('div'); btn.className = 'mini-card'; btn.style.cursor = 'pointer'; 
        if(room.votes && room.votes[myId] === p.id) btn.style.border = '2px solid #ef4444'; 
        btn.innerHTML = `<div style="font-weight:bold;">${p.name}</div>`; 
        btn.onclick = () => { socket.emit('submitVote', { targetId: p.id }); qs('voteSubtitle').innerText = `Votaste a ${p.name}`; }; 
        grid.appendChild(btn); 
    }); 
}
function activatePremium() { isPremium = true; localStorage.setItem('isPremium', 'true'); unlockedCategories = new Set(CATEGORIES_DATA.map(c => c.id)); renderCategoriesGrid(); showModal("¡Éxito!", "Premium Activado. Gracias por apoyar."); qs('screenPremium').style.display = 'none'; qs('screenHome').style.display = 'flex'; }