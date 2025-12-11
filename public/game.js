const socket = io();

// =========================
// ESTADO GLOBAL
// =========================
let myId = null;
let isHost = false;
let currentRoom = null;
let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let myRole = null; // "IMPOSTOR" / "TRIPULANTE"
let myWord = null;
let myHint = null;
let voteLocked = false;

// =========================
// SONIDOS
// =========================
function playSound(id) {
  const audio = document.getElementById(id);
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {}); // Ignorar errores de autoplay
  }
}

// =========================
// UTILIDADES BÁSICAS
// =========================
const CATEGORIES_DATA = [
  { id: 'lugares', icon: '📍', name: 'Lugares' },
  { id: 'comidas', icon: '🍔', name: 'Comidas' },
  { id: 'objetos', icon: '🛠️', name: 'Objetos' },
  { id: 'animales', icon: '🐾', name: 'Animales' },
  { id: 'profesiones', icon: '💼', name: 'Profesiones' },
  { id: 'deportes', icon: '🏆', name: 'Deportes' },
  { id: 'tecnologia', icon: '💻', name: 'Tecnología' },
  { id: 'fantasia', icon: '🧙‍♂️', name: 'Fantasía' }
];

function qs(id) { return document.getElementById(id); }
function bindClick(id, handler) {
  const el = qs(id);
  if (el) el.addEventListener('click', (e) => {
    playSound('soundClick'); // Sonido en todos los clicks
    handler(e);
  });
}

// Ajustar contadores (+/-)
function adjustValue(inputId, delta) {
  const hidden = qs(inputId);
  if (!hidden) return;
  let val = parseInt(hidden.value) || 0;
  if (inputId === 'maxPlayers') {
    val = Math.min(15, Math.max(3, val + delta));
    hidden.value = val; qs('displayPlayers').innerText = val;
  } else if (inputId === 'impostors') {
    val = Math.min(4, Math.max(1, val + delta));
    hidden.value = val; qs('displayImpostors').innerText = val;
  } else if (inputId === 'timeVote') {
    val = Math.min(300, Math.max(60, val + delta));
    hidden.value = val; qs('displayVoteTime').innerText = val;
  }
}

// Actualizar resumen y grid de categorías
function updateCategoriesSummary() {
  const summaryEl = qs('categoriesSummary');
  const names = CATEGORIES_DATA.filter(c => selectedCategories.has(c.id)).map(c => c.name);
  summaryEl.innerText = names.length === 0 ? 'Selecciona alguna' : names.join(', ');
}
function renderCategoriesGrid() {
  const grid = qs('categoriesGrid');
  grid.innerHTML = '';
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-pill' + (selectedCategories.has(cat.id) ? ' active' : '');
    btn.innerHTML = `<span>${cat.icon}</span><span>${cat.name}</span>`;
    btn.onclick = () => {
      playSound('soundClick');
      if (selectedCategories.has(cat.id)) selectedCategories.delete(cat.id);
      else selectedCategories.add(cat.id);
      if (selectedCategories.size === 0) selectedCategories.add(cat.id);
      renderCategoriesGrid();
    };
    grid.appendChild(btn);
  });
}

// Navegación en el Lobby
function showScreen(screenId) {
  ['screenHome', 'screenCreate', 'screenJoin', 'screenCategories'].forEach(id => {
    qs(id).style.display = (id === screenId ? 'flex' : 'none');
  });
}

// =========================
// FUNCIÓN GLOBAL PARA REVELAR CARTA (FIX BUG)
// =========================
window.toggleSecretCard = function() {
  if (!currentRoom || currentPhase !== 'word') return;
  playSound('soundFlip');
  const inner = qs('secretCardInner');
  if (inner) inner.classList.toggle('flipped');
};

// =========================
// EVENTOS INICIALES (ON LOAD)
// =========================
window.addEventListener('load', () => {
  renderCategoriesGrid();
  updateCategoriesSummary();

  // Navegación
  bindClick('btnGoCreate', () => showScreen('screenCreate'));
  bindClick('btnGoJoin', () => showScreen('screenJoin'));
  bindClick('backFromCreate', () => showScreen('screenHome'));
  bindClick('backFromJoin', () => showScreen('screenHome'));
  bindClick('btnOpenCategories', () => showScreen('screenCategories'));
  bindClick('backFromCategories', () => showScreen('screenCreate'));
  bindClick('btnSaveCategories', () => { updateCategoriesSummary(); showScreen('screenCreate'); });

  // Ayuda
  bindClick('btnHowToPlay', () => qs('howToPlayOverlay').style.display = 'flex');
  bindClick('btnCloseHowToPlay', () => qs('howToPlayOverlay').style.display = 'none');

  // Acciones Principales
  bindClick('btnCreateRoom', createRoom);
  bindClick('btnJoinRoom', joinRoom);
  bindClick('btnStartRound', () => { if (isHost) socket.emit('startRound'); });
  bindClick('btnBackToLobby', () => {
    qs('ejectionOverlay').style.display = 'none';
    if (currentRoom) updateGameView(currentRoom);
  });
  bindClick('btnExit', () => location.reload());

  // Copiar Código
  bindClick('btnCopyCode', () => {
    const code = qs('roomCodeDisplay').innerText.trim();
    if (code && code !== '------') navigator.clipboard.writeText(code);
  });

  // Acciones de Juego
  bindClick('btnSkipVote', () => {
    if (!currentRoom || currentPhase !== 'vote' || voteLocked) return;
    voteLocked = true;
    socket.emit('submitVote', { targetId: 'skip' });
    qs('voteSubtitle').innerText = 'Has votado saltar. Esperando a los demás...';
  });
  bindClick('btnEndTurn', () => {
    if (!currentRoom || currentPhase !== 'turn') return;
    socket.emit('endTurnEarly');
  });
});

// =========================
// SOCKET: CREAR / UNIRSE
// =========================
function createRoom() {
  if (selectedCategories.size === 0) return alert('Elige al menos una categoría.');
  socket.emit('createRoom', {
    name: qs('hostName').value || 'Agente',
    maxPlayers: qs('maxPlayers').value,
    impostors: qs('impostors').value,
    categories: Array.from(selectedCategories),
    turnTime: 20, // Fijo en 20s por ahora
    voteTime: qs('timeVote').value,
    groupMode: qs('groupModeToggle').checked // El toggle ahora sí funciona
  }, handleConnection);
}

function joinRoom() {
  socket.emit('joinRoom', {
    name: qs('joinName').value || 'Agente',
    roomCode: qs('joinCode').value
  }, handleConnection);
}

function handleConnection(res) {
  if (!res.ok) return alert(res.error || 'Error al conectar.');
  myId = res.me.id;
  isHost = res.isHost;

  qs('lobbyOverlay').style.display = 'none';
  qs('mainContent').style.display = 'block';
  qs('roomCodeDisplay').innerText = res.roomCode;

  // AUTO-ABRIR DISCORD si hay link y no soy el host (el host ya lo tiene)
  if (res.discordLink && !isHost) {
    window.open(res.discordLink, '_blank');
  }

  updateGameView({ phase: 'lobby', players: [], hostId: isHost ? myId : null });
}

// =========================
// SOCKET: ESTADO DEL JUEGO
// =========================
socket.on('roomState', (room) => {
  currentRoom = room;
  updateGameView(room);
});

socket.on('privateRole', (data) => {
  myRole = data.role; // "IMPOSTOR" o "TRIPULANTE"
  myWord = data.word;
  myHint = data.hint;
  if (currentPhase === 'word') updateWordCard();
});

// RESULTADO FINAL (CORREGIDO VICTORIA/DERROTA)
socket.on('roundResult', (data) => {
  const overlay = qs('ejectionOverlay');
  const titleEl = qs('resultTitle');
  const subtitleEl = qs('resultSubtitle');
  qs('finalSecretWord').innerText = data.secretWord || '---';
  qs('finalImpostors').innerText = (data.impostors || []).join(', ') || '---';
  overlay.style.display = 'flex';

  // Determinar si YO gané
  const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') ||
               (data.result === 'impostor' && myRole === 'IMPOSTOR');

  if (data.result === 'none') {
    qs('resultIcon').textContent = '⚖️';
    titleEl.textContent = 'RONDA NULA'; titleEl.style.color = '#94a3b8';
  } else if (iWon) {
    playSound('soundWin');
    qs('resultIcon').textContent = '🏆';
    titleEl.textContent = '¡VICTORIA!'; titleEl.style.color = '#4ade80';
  } else {
    playSound('soundLose');
    qs('resultIcon').textContent = '💀';
    titleEl.textContent = 'DERROTA'; titleEl.style.color = '#ef4444';
  }
  subtitleEl.textContent = data.reason;
});

// =========================
// UPDATE UI GENERAL
// =========================
function updateGameView(room) {
  if (!room) return;
  currentPhase = room.phase || 'lobby';
  isHost = (room.hostId === myId);

  // Actualizar fase y timer
  qs('phaseLabel').innerText = currentPhase === 'word' ? 'MEMORIZAR' : currentPhase === 'turn' ? 'PISTAS' : currentPhase === 'vote' ? 'VOTACIÓN' : 'LOBBY';
  const timerEl = qs('timerNumber');
  timerEl.innerText = room.timerText || '--';
  timerEl.classList.toggle('urgent', room.remaining > 0 && room.remaining <= 5);

  // Actualizar lista de jugadores
  const pList = qs('playersList');
  pList.innerHTML = '';
  (room.players || []).forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row' + (p.isDead ? ' dead' : '') + (room.currentTurnId === p.id ? ' active-turn' : '');
    row.innerHTML = `
      <div class="p-avatar-small" style="background:${p.color}">${p.name.charAt(0)}</div>
      <div class="p-name-list">${p.name}</div>
      ${room.hostId === p.id ? '<span class="p-tag-host">HOST</span>' : ''}
    `;
    pList.appendChild(row);
  });
  qs('currentPlayersCount').innerText = room.players.length;
  qs('currentImpostorsCount').innerText = room.impostors;

  // Mostrar/Ocultar botón de inicio (solo host en lobby)
  qs('btnStartRound').style.display = (isHost && currentPhase === 'lobby') ? 'block' : 'none';

  // Texto de estado
  const status = qs('statusText');
  if (currentPhase === 'lobby') status.innerText = isHost ? 'Configura y arranca la partida.' : 'Esperando al anfitrión...';
  else if (currentPhase === 'word') status.innerText = 'Memoricen su palabra secreta.';
  else if (currentPhase === 'turn') status.innerText = 'Presten atención a las pistas.';
  else if (currentPhase === 'vote') status.innerText = 'Decidan quién es el impostor.';

  // Cambiar vistas principales
  qs('viewLobby').style.display = currentPhase === 'lobby' ? 'flex' : 'none';
  qs('viewWord').style.display = currentPhase === 'word' ? 'flex' : 'none';
  qs('viewTurn').style.display = currentPhase === 'turn' ? 'flex' : 'none';
  qs('viewVote').style.display = currentPhase === 'vote' ? 'flex' : 'none';

  // Lógica específica de fases
  if (currentPhase === 'word') {
    qs('secretCardInner').classList.remove('flipped'); // Resetear carta al entrar
    updateWordCard();
  }
  if (currentPhase === 'turn') {
    const turnPlayer = room.players.find(p => p.id === room.currentTurnId);
    qs('currentTurnPlayer').innerText = turnPlayer ? turnPlayer.name : '---';
    qs('turnActions').style.display = (room.currentTurnId === myId) ? 'block' : 'none';
    qs('turnInstruction').innerText = (room.currentTurnId === myId) ? '¡Tu turno! Di tu pista.' : `Escucha la pista de ${turnPlayer?.name}.`;
  }
  if (currentPhase === 'vote') {
    renderVoteGrid(room);
    qs('voteSubtitle').innerText = voteLocked ? 'Voto enviado.' : 'Toca a un jugador para votar.';
  }
}

// Actualizar contenido de la carta secreta
function updateWordCard() {
  qs('roleTitle').innerText = myRole || 'ROL';
  qs('secretWordDisplay').innerText = myWord || '-----';
  qs('wordHint').innerText = myHint || '...';
  if(myRole === 'IMPOSTOR') qs('roleTitle').style.borderColor = '#ef4444'; // Rojo para impostor
}

// Renderizar grilla de votación
function renderVoteGrid(room) {
  const grid = qs('votePlayersGrid');
  grid.innerHTML = '';
  voteLocked = !!(room.votes && room.votes[myId]);

  room.players.filter(p => !p.isDead && p.id !== myId).forEach(p => {
    const card = document.createElement('div');
    card.className = 'vote-card' + (room.votes && room.votes[myId] === p.id ? ' selected' : '');
    card.innerHTML = `<div class="vote-avatar-box" style="background:${p.color}">👤</div><div class="vote-name">${p.name}</div>`;
    card.onclick = () => {
      if (voteLocked || currentPhase !== 'vote') return;
      playSound('soundClick');
      voteLocked = true;
      socket.emit('submitVote', { targetId: p.id });
      qs('voteSubtitle').innerText = `Has votado a ${p.name}.`;
    };
    grid.appendChild(card);
  });
}

socket.on('connect_error', () => alert('Error de conexión con el servidor.'));