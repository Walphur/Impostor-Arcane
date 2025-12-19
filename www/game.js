const socket = io('https://incognitogame.online', { transports: ['websocket'], reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
function getDeviceId() { let id = localStorage.getItem('deviceUUID'); if (!id) { id = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now(); localStorage.setItem('deviceUUID', id); } return id; }
const MY_DEVICE_ID = getDeviceId();

const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;
const ADMOB_IDS = { intersticial: 'ca-app-pub-6788680373227341/8374567976', bonificado: 'ca-app-pub-6788680373227341/4416794053' };

let myId = null; let isHost = false; let currentRoom = null; let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let isPremium = localStorage.getItem('isPremium') === 'true';
let unlockedCategories = new Set(JSON.parse(localStorage.getItem('videoUnlocks') || '[]')); 
let myRole = null; let myWord = null; let myHint = null; let voteLocked = false;
const MAX_VIDEO_UNLOCKS = 2; 

const qs = (id) => document.getElementById(id);
function playSound(id) { const audio = qs(id); if(audio) { audio.currentTime = 0; audio.play().catch(()=>{}); } }

const CATEGORIES_DATA = [
  { id: 'lugares', premium: false, icon: '🌍', name: 'Lugares' },
  { id: 'comidas', premium: false, icon: '🍔', name: 'Comidas' },
  { id: 'objetos', premium: false, icon: '📦', name: 'Objetos' },
  { id: 'animales', premium: true, icon: '🐶', name: 'Animales' },
  { id: 'profesiones', premium: true, icon: '👷', name: 'Profesiones' },
  { id: 'deportes', premium: true, icon: '⚽', name: 'Deportes' },
  { id: 'tecnologia', premium: true, icon: '💻', name: 'Tecnología' },
  { id: 'fantasia', premium: true, icon: '🧙', name: 'Fantasía' }
];

async function initAdMob() {
    if(!AdMob) return;
    try { await AdMob.initialize({ requestTrackingAuthorization: true, initializeForTesting: true }); await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado, isTesting: true }); await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial, isTesting: true }); } catch(e) {}
}

async function showRewardForCategory(catId) {
    if(isPremium) { unlockCategory(catId); return; }
    if (unlockedCategories.size >= MAX_VIDEO_UNLOCKS && !unlockedCategories.has(catId)) { if(confirm(`❌ Límite Gratuito.\n¿Quieres Premium?`)) { qs('screenCategories').style.display = 'none'; qs('screenPremium').style.display = 'flex'; } return; }
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
});

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
  qs('btnStartRound').onclick = () => { if(isHost) socket.emit('startRound'); };
  qs('btnExit').onclick = () => { if(confirm("⚠️ ¿Salir?")) location.reload(); };
  qs('btnBackToLobby').onclick = () => { qs('ejectionOverlay').style.display = 'none'; if(currentRoom) updateGameView(currentRoom); };
  
  const copyBtn = qs('btnCopyCode');
  copyBtn.onclick = () => { 
      const code = qs('roomCodeDisplay').innerText; 
      if(code !== '------') { 
          navigator.clipboard.writeText(code); 
          copyBtn.innerHTML = '✅'; 
          setTimeout(() => { 
              copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'; 
          }, 2000); 
      } 
  };

  qs('btnSkipVote').onclick = () => { if(!currentRoom || currentPhase !== 'vote' || voteLocked) return; socket.emit('submitVote', { targetId: 'skip' }); voteLocked = true; qs('voteSubtitle').innerText = 'Has votado saltar.'; };
  qs('btnEndTurn').onclick = () => { if(currentRoom && currentPhase === 'turn') socket.emit('endTurnEarly'); };
  qs('btnDiscord').onclick = () => { if(currentRoom?.discordLink) window.open(currentRoom.discordLink, '_blank'); };
  
  // --- BOTÓN ENVIAR PISTA ---
  qs('btnSendClue').onclick = () => {
      const input = qs('inputClue'); const text = input.value.trim();
      if(!text) return alert("Escribe algo.");
      socket.emit('submitClue', { text: text }); input.value = '';
  };

  // --- BOTÓN CANCELAR RONDA (HOST) ---
  const btnCancel = document.getElementById('btnCancelRound');
  if(btnCancel) {
      btnCancel.onclick = () => {
          if(confirm("🛑 ¿DETENER la partida y volver al Lobby?")) {
              socket.emit('cancelRound');
          }
      };
  }

  const btnBuy = qs('btnBuyPremium'); if(btnBuy) btnBuy.onclick = () => { const c = prompt("🔑 Código (INC2025)"); if (c && c.toUpperCase() === "INC2025") activatePremium(); else alert("Próximamente"); };
}

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid'); grid.innerHTML = '';
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('div');
    const isSelected = selectedCategories.has(cat.id); const isLocked = cat.premium && !unlockedCategories.has(cat.id);
    btn.className = 'category-card-square' + (isSelected && !isLocked ? ' active' : '') + (isLocked ? ' locked' : '');
    let content = `<div class="cat-icon" style="font-size:2rem;">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
    if(isLocked) content += `<div style="position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,0.7);border-radius:16px;display:flex;align-items:center;justify-content:center;"><span style="font-size:1.5rem;">📺</span></div>`;
    btn.innerHTML = content;
    btn.onclick = () => { playSound('soundClick'); if (isLocked) { if(confirm(`📺 ¿Desbloquear ${cat.name}?`)) showRewardForCategory(cat.id); } else { if(selectedCategories.has(cat.id)) selectedCategories.delete(cat.id); else selectedCategories.add(cat.id); if(selectedCategories.size===0) selectedCategories.add(cat.id); renderCategoriesGrid(); } };
    grid.appendChild(btn);
  });
}

function updateCategoriesSummary() { qs('categoriesSummary').innerText = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name).join(', '); }
window.adjustValue = function(id, d) { const i = qs(id); let v = parseInt(i.value); if(id==='maxPlayers') v = Math.min(15, Math.max(3, v + d)); if(id==='impostors') v = Math.min(4, Math.max(1, v + d)); if(id==='timeVote') v = Math.min(300, Math.max(60, v + d)); i.value = v; if(id==='maxPlayers') qs('displayPlayers').innerText=v; if(id==='impostors') qs('displayImpostors').innerText=v; if(id==='timeVote') qs('displayVoteTime').innerText=v; };
window.toggleSecretCard = function() { if(currentPhase!=='word')return; const c=qs('secretCardInner'); if(c.classList.contains('flipped')) c.classList.remove('flipped'); else { playSound('soundFlip'); c.classList.add('flipped'); } };

function createRoom() {
  if(selectedCategories.size === 0) return alert('Elige categorías');
  // OBTENER MODO DE JUEGO
  let mode = 'group';
  if(qs('modeText').checked) mode = 'text';
  else if(qs('modeDiscord').checked) mode = 'discord';
  else mode = 'group';

  socket.emit('createRoom', { 
      name: qs('hostName').value || 'Agente', 
      maxPlayers: qs('maxPlayers').value, 
      impostors: qs('impostors').value, 
      categories: Array.from(selectedCategories), 
      voteTime: qs('timeVote').value, 
      mode: mode, // Enviamos el modo seleccionado
      userId: MY_DEVICE_ID 
  }, handleJoin);
}
function joinRoom() { socket.emit('joinRoom', { name: qs('joinName').value || 'Agente', roomCode: qs('joinCode').value, userId: MY_DEVICE_ID }, handleJoin); }
function handleJoin(res) {
  if(!res.ok) return alert(res.error || 'Error');
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
  if (data.result === 'tie') { playSound('soundLose'); t.innerText = "EMPATE"; t.style.color = "#facc15"; s.innerText = data.reason; i.innerHTML = '⚖️'; qs('finalSecretWord').parentElement.style.display = 'none'; qs('finalImpostors').parentElement.style.display = 'none'; } 
  else { qs('finalSecretWord').innerText = data.secretWord; qs('finalImpostors').innerText = data.impostors.join(', '); qs('finalSecretWord').parentElement.style.display = 'flex'; qs('finalImpostors').parentElement.style.display = 'flex'; const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR'); if(iWon) { playSound('soundWin'); t.innerText = "VICTORIA"; t.style.color = "#4ade80"; i.innerHTML = '🏆'; } else { playSound('soundLose'); t.innerText = "DERROTA"; t.style.color = "#ef4444"; i.innerHTML = '💀'; } s.innerText = data.reason; }
  qs('ejectionOverlay').style.display = 'flex';
});

function updateGameView(room) {
  if (!room) return;
  currentPhase = room.phase; isHost = (room.hostId === myId);

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  const setDisplay = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; };

  setTxt('phaseLabel', currentPhase.toUpperCase()); setTxt('timerNumber', room.timerText || '--');
  setTxt('currentPlayersCount', room.players.length); setTxt('currentImpostorsCount', room.impostors);

  const list = document.getElementById('playersList');
  if (list) {
      list.innerHTML = '';
      (room.players || []).forEach(p => {
        const row = document.createElement('div'); row.className = 'player-row';
        if(p.isDead) row.style.opacity = '0.5';
        if(p.disconnected) row.style.border = '1px dashed #ef4444'; else if(room.currentTurnId === p.id) row.style.border = '1px solid #3b82f6';
        const badge = p.id === room.hostId ? '<span style="font-size:0.6rem;background:#ffffff20;padding:2px 6px;border-radius:4px;margin-left:auto;">HOST</span>' : '';
        const discIcon = p.disconnected ? '🔌' : '';
        row.innerHTML = `<div style="width:28px;height:28px;background:${p.color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#000;font-size:0.8rem;">${p.name.charAt(0).toUpperCase()}</div><div style="font-weight:600;font-size:0.9rem;margin-left:10px;">${p.name} ${discIcon}</div>${badge}`;
        list.appendChild(row);
      });
  }

  const btnStart = document.getElementById('btnStartRound'); if (btnStart) btnStart.style.display = (isHost && currentPhase === 'lobby' && room.players.length >= 2) ? 'block' : 'none';
  const btnDiscord = document.getElementById('btnDiscord'); if (btnDiscord) btnDiscord.style.display = room.discordLink ? 'flex' : 'none';
  
  // BOTÓN CANCELAR RONDA (SOLO HOST Y NO LOBBY)
  const btnCancel = document.getElementById('btnCancelRound');
  if(btnCancel) {
      btnCancel.style.display = (isHost && currentPhase !== 'lobby') ? 'block' : 'none';
  }

  ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => setDisplay(v, false));

  if (currentPhase === 'lobby') { setDisplay('viewLobby', true); const st = document.getElementById('statusText'); if(st) st.innerHTML = isHost ? "Inicia cuando estén listos." : `Esperando<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>`; } 
  else if (currentPhase === 'word') { setDisplay('viewWord', true); const c = document.getElementById('secretCardInner'); if(c) c.classList.remove('flipped'); updateWordCard(); setTxt('statusText', "Memorizando roles..."); } 
  else if (currentPhase === 'turn') { 
      setDisplay('viewTurn', true); 
      const t = room.players.find(p => p.id === room.currentTurnId); 
      setTxt('currentTurnPlayer', t ? t.name : '...'); 
      
      // SOLO MOSTRAR BITÁCORA Y CHAT SI EL MODO ES 'TEXT'
      const isTextMode = (room.mode === 'text');
      qs('cluesHistoryContainer').style.display = isTextMode ? 'block' : 'none'; // Contenedor historial
      
      const isMyTurn = (room.currentTurnId === myId);
      
      // Input solo si es mi turno Y es modo texto
      qs('turnInputArea').style.display = (isMyTurn && isTextMode) ? 'flex' : 'none';
      
      // Botón "Ya hablé" normal para modos de voz
      qs('turnActionsNormal').style.display = (isMyTurn && !isTextMode) ? 'block' : 'none';

      qs('turnWaitMessage').style.display = isMyTurn ? 'none' : 'block';
      qs('turnWaitMessage').innerText = t ? `Esperando a ${t.name}...` : '...';

      if(isTextMode) {
          const cluesContainer = qs('cluesHistory');
          cluesContainer.innerHTML = '';
          if(room.clues && room.clues.length > 0) {
              room.clues.forEach(clue => {
                  const div = document.createElement('div');
                  div.style.marginBottom = '5px'; div.style.fontSize = '0.9rem';
                  div.innerHTML = `<span style="color:${clue.color}; font-weight:800;">${clue.name}:</span> <span style="color:#fff;">${clue.text}</span>`;
                  cluesContainer.appendChild(div);
              });
          } else { cluesContainer.innerHTML = '<div style="color:#64748b; font-size:0.8rem; font-style:italic;">Sin pistas escritas aún...</div>'; }
      }
      setTxt('statusText', "Ronda de pistas.");
  } 
  else if (currentPhase === 'vote') { setDisplay('viewVote', true); renderVoteGrid(room); setTxt('statusText', "Votación en curso."); }
}

function updateWordCard() { const rt = qs('roleTitle'); if(rt) rt.innerText = myRole; const sw = qs('secretWordDisplay'); if(sw) sw.innerText = myWord; const wh = qs('wordHint'); if(wh) wh.innerText = myHint; }
function renderVoteGrid(room) { const grid = qs('votePlayersGrid'); if(!grid) return; grid.innerHTML = ''; voteLocked = !!(room.votes && room.votes[myId]); room.players.filter(p => !p.isDead && p.id !== myId).forEach(p => { const btn = document.createElement('div'); btn.className = 'mini-card'; btn.style.cursor = 'pointer'; if(room.votes && room.votes[myId] === p.id) btn.style.border = '2px solid #ef4444'; btn.innerHTML = `<div style="font-weight:bold;">${p.name}</div>`; btn.onclick = () => { if(voteLocked) return; socket.emit('submitVote', { targetId: p.id }); voteLocked = true; qs('voteSubtitle').innerText = `Votaste a ${p.name}`; }; grid.appendChild(btn); }); }
function activatePremium() { isPremium = true; localStorage.setItem('isPremium', 'true'); unlockedCategories = new Set(CATEGORIES_DATA.map(c => c.id)); renderCategoriesGrid(); alert("🌟 ¡PREMIUM ACTIVADO!"); playSound('soundWin'); qs('screenPremium').style.display = 'none'; qs('screenHome').style.display = 'flex'; }