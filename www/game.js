// CONEXIÓN CON TU SERVIDOR
const socket = io('https://incognitogame.online', {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

// --- ID DE DISPOSITIVO PARA RECONEXIÓN ---
function getDeviceId() {
    let id = localStorage.getItem('deviceUUID');
    if (!id) {
        id = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now();
        localStorage.setItem('deviceUUID', id);
    }
    return id;
}
const MY_DEVICE_ID = getDeviceId();

// --- 💰 CONFIGURACIÓN DE ADMOB (INGRESOS) ---
// Usamos el plugin de Capacitor si está disponible
const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;

// TUS IDs REALES (CUIDALOS)
const ADMOB_IDS = {
    intersticial: 'ca-app-pub-6788680373227341/8374567976', // Anuncio de pantalla completa
    bonificado: 'ca-app-pub-6788680373227341/4416794053'    // Anuncio de video con premio
};

// ESTADO DEL JUEGO
let myId = null;
let isHost = false;
let currentRoom = null;
let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']); // Por defecto

// MEMORIA DEL JUGADOR
let isPremium = localStorage.getItem('isPremium') === 'true';
// Recuperamos las categorías que desbloqueó viendo videos
let unlockedCategories = new Set(JSON.parse(localStorage.getItem('videoUnlocks') || '[]')); 

let myRole = null; 
let myWord = null; 
let myHint = null;
let voteLocked = false;
let adLoaded = false; // Para saber si el anuncio está listo
const MAX_VIDEO_UNLOCKS = 2; // Cantidad de categorías gratis con video

const qs = (id) => document.getElementById(id);
function playSound(id) { const audio = qs(id); if(audio) { audio.currentTime = 0; audio.play().catch(()=>{}); } }

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

// --- 💰 LÓGICA DE INGRESOS (ADMOB) ---
async function initAdMob() {
    if(!AdMob) return;
    try {
        await AdMob.initialize({ requestTrackingAuthorization: true });
        
        // Carga inicial agresiva
        await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado });
        await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial });
        adLoaded = true;
        console.log("💰 AdMob Inicializado y Cargando...");
    } catch(e) { console.error("Error AdMob", e); }
}

// Lógica de "Anuncio x Recompensa"
async function showRewardForCategory(catId) {
    if(isPremium) {
        // Si ya es premium, desbloquea directo sin video
        unlockCategory(catId);
        return;
    }
    
    // Verificamos límite para forzar Premium después de 2 videos
    if (unlockedCategories.size >= MAX_VIDEO_UNLOCKS && !unlockedCategories.has(catId)) {
        if(confirm(`❌ Límite Gratuito Alcanzado.\n\nSolo puedes desbloquear ${MAX_VIDEO_UNLOCKS} categorías con videos.\n\n¿Quieres desbloquear TODO y quitar anuncios con Premium?`)) {
            qs('screenCategories').style.display = 'none';
            qs('screenPremium').style.display = 'flex';
        }
        return;
    }

    // Si es WEB (PC), simulamos el video para probar
    if(!AdMob) {
        console.log("[MODO WEB] Simulando video de 3 segundos...");
        const btn = document.activeElement;
        if(btn) btn.innerHTML = "⏳ VIENDO...";
        setTimeout(() => {
            alert("✅ ¡Video completado!\nCategoría desbloqueada.");
            unlockCategory(catId);
            if(btn) btn.innerHTML = "DESBLOQUEADO";
        }, 2000);
        return;
    }

    // SI ES APP (Android), mostramos video real
    try {
        // Mostramos el video
        const result = await AdMob.showRewardVideoAd();
        
        // 💰 AQUÍ ES DONDE COBRAS: El usuario vio el video entero (amount > 0)
        if (result && result.amount > 0) {
            unlockCategory(catId);
            // Cargar el siguiente video INMEDIATAMENTE para que esté listo luego
            await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado });
        } else {
            // A veces el plugin devuelve undefined pero funcionó, asumimos éxito si no hay error
            unlockCategory(catId);
            await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado });
        }
    } catch(e) {
        alert("⚠️ El anuncio no está listo por conexión lenta.\nIntenta de nuevo en 5 segundos.");
        // Reintentar carga
        await AdMob.prepareRewardVideoAd({ adId: ADMOB_IDS.bonificado });
    }
}

function unlockCategory(catId) {
    unlockedCategories.add(catId); 
    localStorage.setItem('videoUnlocks', JSON.stringify(Array.from(unlockedCategories)));
    selectedCategories.add(catId); 
    renderCategoriesGrid();
    playSound('soundWin'); // Feedback sonoro satisfactorio
}

// Anuncio Intersticial (Pantalla completa)
async function handleCreateRoomFlow() {
    // Si es Premium, nunca mostrar anuncios
    if (isPremium) {
        createRoom(); 
        return;
    }
    
    // Si no hay plugin, pasar directo
    if(!AdMob) { createRoom(); return; }

    try {
        // Mostrar anuncio
        await AdMob.showInterstitial();
        // Al cerrar el anuncio, se ejecuta esto:
        createRoom();
        // Cargar el siguiente para la próxima vez
        await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial });
    } catch(e) {
        // Si falla (ej: sin internet), permitir jugar igual para no perder al usuario
        console.log("Error ad, pasando...", e);
        createRoom();
        await AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial });
    }
}

// --- INICIO ---
document.addEventListener('DOMContentLoaded', async () => {
  // Si es premium, desbloquear todo visualmente en memoria
  if (isPremium) unlockedCategories = new Set(CATEGORIES_DATA.map(c => c.id));
  
  await initAdMob();
  renderCategoriesGrid();
  updateCategoriesSummary();
  setupEventListeners();

  // Recuperar nombre
  const savedName = localStorage.getItem('playerName');
  if(savedName) { qs('hostName').value = savedName; qs('joinName').value = savedName; }
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

  // BOTÓN CREAR CON PUBLICIDAD
  qs('btnCreateRoom').onclick = () => { playSound('soundClick'); handleCreateRoomFlow(); };
  
  qs('btnJoinRoom').onclick = () => { playSound('soundClick'); joinRoom(); };
  qs('btnStartRound').onclick = () => { if(isHost) socket.emit('startRound'); };
  
  qs('btnExit').onclick = () => {
      if(confirm("⚠️ ¿Salir de la sala?\nLa partida se cerrará para ti.")) { location.reload(); }
  };
  
  qs('btnBackToLobby').onclick = () => { qs('ejectionOverlay').style.display = 'none'; if(currentRoom) updateGameView(currentRoom); };
  
  const copyBtn = qs('btnCopyCode');
  copyBtn.onclick = () => { 
    const code = qs('roomCodeDisplay').innerText; 
    if(code !== '------') {
        navigator.clipboard.writeText(code);
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '✅';
        setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 2000);
    }
  };

  qs('btnSkipVote').onclick = () => { if(!currentRoom || currentPhase !== 'vote' || voteLocked) return; socket.emit('submitVote', { targetId: 'skip' }); voteLocked = true; qs('voteSubtitle').innerText = 'Has votado saltar.'; };
  qs('btnEndTurn').onclick = () => { if(currentRoom && currentPhase === 'turn') socket.emit('endTurnEarly'); };
  qs('btnDiscord').onclick = () => { if(currentRoom?.discordLink) window.open(currentRoom.discordLink, '_blank'); };

  // --- 💰 SISTEMA PREMIUM (CANJEAR CÓDIGO) ---
  const btnBuy = qs('btnBuyPremium');
  if(btnBuy) {
      btnBuy.onclick = () => {
          // Preguntamos por código secreto
          const code = prompt("🔑 ¿Tienes un Código Promocional?\nIngrésalo aquí para desbloquear Premium GRATIS.\n\n(O deja vacío para simular compra)");
          
          if (code && code.toUpperCase() === "INC2025") { // <--- ¡AQUÍ ESTÁ TU CÓDIGO SECRETO!
              activatePremium();
          } else if (code) {
              alert("❌ Código incorrecto.");
          } else {
              // Simulación de compra para testers sin código
              alert("🚀 Próximamente: Pagos con Google Play.\n\nUsa el código 'INC2025' para probar el Premium ahora.");
          }
      };
  }
}

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid'); grid.innerHTML = '';
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('div');
    const isSelected = selectedCategories.has(cat.id);
    const isLocked = cat.premium && !unlockedCategories.has(cat.id);
    
    // Clases visuales
    btn.className = 'category-card-square' + (isSelected && !isLocked ? ' active' : '') + (isLocked ? ' locked' : '');
    
    let content = `<div class="cat-icon">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
    
    // Candado o "Video"
    if(isLocked) {
        content += `
        <div style="position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(0,0,0,0.7); border-radius:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;">
            <span style="font-size:1.5rem;">📺</span>
            <span style="font-size:0.6rem; font-weight:800; color:#fbbf24; text-transform:uppercase;">VER VIDEO</span>
        </div>`;
    }

    btn.innerHTML = content;
    btn.style.position = 'relative';

    btn.onclick = () => {
      playSound('soundClick');
      if (isLocked) { 
          // Confirmación más atractiva
          if(confirm(`📺 ¿Ver video corto para desbloquear ${cat.name}?`)) {
              showRewardForCategory(cat.id);
          }
      } else {
          if(selectedCategories.has(cat.id)) selectedCategories.delete(cat.id); else selectedCategories.add(cat.id);
          if(selectedCategories.size === 0) selectedCategories.add(cat.id);
          renderCategoriesGrid();
      }
    };
    grid.appendChild(btn);
  });
}

function updateCategoriesSummary() { const names = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name); qs('categoriesSummary').innerText = names.join(', '); }
window.adjustValue = function(id, delta) {
  const input = qs(id); let val = parseInt(input.value);
  if(id === 'maxPlayers') val = Math.min(15, Math.max(3, val + delta));
  if(id === 'impostors') val = Math.min(4, Math.max(1, val + delta));
  if(id === 'timeVote') val = Math.min(300, Math.max(60, val + delta));
  input.value = val;
  if(id === 'maxPlayers') qs('displayPlayers').innerText = val;
  if(id === 'impostors') qs('displayImpostors').innerText = val;
  if(id === 'timeVote') qs('displayVoteTime').innerText = val;
};
window.toggleSecretCard = function() { if(currentPhase !== 'word') return; const el = qs('secretCardInner'); if(el) { playSound('soundFlip'); el.classList.toggle('flipped'); } };

function createRoom() {
  if(selectedCategories.size === 0) return alert('Elige categorías');
  const name = qs('hostName').value || 'Agente';
  localStorage.setItem('playerName', name);

  socket.emit('createRoom', {
    name: name, maxPlayers: qs('maxPlayers').value, impostors: qs('impostors').value,
    categories: Array.from(selectedCategories), voteTime: qs('timeVote').value, 
    groupMode: qs('groupModeToggle').checked,
    userId: MY_DEVICE_ID
  }, handleJoin);
}

function joinRoom() { 
    const name = qs('joinName').value || 'Agente';
    localStorage.setItem('playerName', name);
    socket.emit('joinRoom', { 
        name: name, 
        roomCode: qs('joinCode').value,
        userId: MY_DEVICE_ID 
    }, handleJoin); 
}

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
  const el = qs('secretCardInner'); if(el) { if(myRole === 'IMPOSTOR') el.classList.add('impostor-card'); else el.classList.remove('impostor-card'); }
});

socket.on('roundResult', (data) => {
  const t = qs('resultTitle'), s = qs('resultSubtitle'), i = qs('resultIcon');
  
  // 💰 Publicidad al terminar (solo si no es Premium)
  if(!isPremium && AdMob) { 
      // Usamos prepare para asegurarnos que el siguiente esté listo
      AdMob.showInterstitial().catch(e=>console.log("No ad ready"));
      AdMob.prepareInterstitial({ adId: ADMOB_IDS.intersticial });
  }

  if (data.result === 'tie') {
      playSound('soundLose'); t.innerText = "EMPATE"; t.style.color = "#facc15"; s.innerText = data.reason; i.innerHTML = '⚖️'; 
      qs('finalSecretWord').parentElement.style.display = 'none'; qs('finalImpostors').parentElement.style.display = 'none';
  } else {
      qs('finalSecretWord').innerText = data.secretWord; qs('finalImpostors').innerText = data.impostors.join(', ');
      qs('finalSecretWord').parentElement.style.display = 'flex'; qs('finalImpostors').parentElement.style.display = 'flex';
      const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR');
      if(iWon) { playSound('soundWin'); t.innerText = "VICTORIA"; t.style.color = "#4ade80"; i.innerHTML = '🏆'; } 
      else { playSound('soundLose'); t.innerText = "DERROTA"; t.style.color = "#ef4444"; i.innerHTML = '💀'; }
      s.innerText = data.reason;
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
  setTxt('currentPlayersCount', room.players.filter(p=>!p.disconnected).length);
  setTxt('currentImpostorsCount', room.impostors);

  const list = document.getElementById('playersList');
  if (list) {
      list.innerHTML = '';
      (room.players || []).forEach(p => {
        const row = document.createElement('div'); 
        row.className = 'player-row';
        if(p.isDead) row.style.opacity = '0.5';
        if(p.disconnected) row.style.border = '1px dashed #ef4444'; 
        else if(room.currentTurnId === p.id) row.style.border = '1px solid #3b82f6';
        const badge = p.id === room.hostId ? '<span style="font-size:0.6rem;background:#ffffff20;padding:2px 6px;border-radius:4px;margin-left:auto;">HOST</span>' : '';
        const discIcon = p.disconnected ? '<span style="margin-left:5px;">🔌</span>' : '';
        row.innerHTML = `<div style="width:28px;height:28px;background:${p.color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#000;font-size:0.8rem;">${p.name.charAt(0).toUpperCase()}</div><div style="font-weight:600;font-size:0.9rem;margin-left:10px;">${p.name} ${discIcon}</div>${badge}`;
        list.appendChild(row);
      });
  }

  const btnStart = document.getElementById('btnStartRound');
  if (btnStart) btnStart.style.display = (isHost && currentPhase === 'lobby' && room.players.length >= 2) ? 'block' : 'none';
  const btnDiscord = document.getElementById('btnDiscord');
  if (btnDiscord) btnDiscord.style.display = room.discordLink ? 'flex' : 'none';

  ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => setDisplay(v, false));
  if (currentPhase === 'lobby') { setDisplay('viewLobby', true); const st = document.getElementById('statusText'); if(st) st.innerHTML = isHost ? "Inicia cuando estén listos." : `Esperando<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>`; } 
  else if (currentPhase === 'word') { setDisplay('viewWord', true); const c = document.getElementById('secretCardInner'); if(c) c.classList.remove('flipped'); updateWordCard(); setTxt('statusText', "Memorizando roles..."); } 
  else if (currentPhase === 'turn') { setDisplay('viewTurn', true); const t = room.players.find(p => p.id === room.currentTurnId); setTxt('currentTurnPlayer', t ? t.name : '...'); const ta = document.getElementById('turnActions'); if(ta) ta.style.display = (room.currentTurnId === myId) ? 'block' : 'none'; setTxt('statusText', "Ronda de pistas."); } 
  else if (currentPhase === 'vote') { setDisplay('viewVote', true); renderVoteGrid(room); setTxt('statusText', "Votación en curso."); }
}

function updateWordCard() { const rt = qs('roleTitle'), sw = qs('secretWordDisplay'), wh = qs('wordHint'); if(rt) rt.innerText = myRole; if(sw) sw.innerText = myWord; if(wh) wh.innerText = myHint; }

function renderVoteGrid(room) {
  const grid = qs('votePlayersGrid'); if(!grid) return;
  grid.innerHTML = ''; voteLocked = !!(room.votes && room.votes[myId]);
  room.players.filter(p => !p.isDead && !p.disconnected && p.id !== myId).forEach(p => {
    const btn = document.createElement('div'); btn.className = 'mini-card'; btn.style.cursor = 'pointer';
    if(room.votes && room.votes[myId] === p.id) btn.style.border = '2px solid #ef4444';
    btn.innerHTML = `<div style="font-weight:bold;">${p.name}</div>`;
    btn.onclick = () => { if(voteLocked) return; socket.emit('submitVote', { targetId: p.id }); voteLocked = true; qs('voteSubtitle').innerText = `Votaste a ${p.name}`; };
    grid.appendChild(btn);
  });
}

// 💰 ACTIVACIÓN DEL PREMIUM
function activatePremium() {
    isPremium = true; 
    localStorage.setItem('isPremium', 'true');
    unlockedCategories = new Set(CATEGORIES_DATA.map(c => c.id)); // Desbloquear todo
    renderCategoriesGrid();
    alert("🌟 ¡PREMIUM ACTIVADO! 🌟\n\n- Adiós Anuncios\n- Todo Desbloqueado\n\n¡Gracias por tu apoyo!");
    playSound('soundWin'); 
    qs('screenPremium').style.display = 'none'; 
    qs('screenHome').style.display = 'flex';
}