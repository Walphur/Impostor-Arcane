const socket = io();

// =========================
// ESTADO GLOBAL
// =========================
let myId = null;
let isHost = false;
let currentRoom = null;
let currentPhase = 'lobby';

let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let myRole = null;   // "IMPOSTOR" / "TRIPULANTE"
let myWord = null;
let myHint = null;

let voteLocked = false;

// =========================
// UTILIDADES
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
  if (el) el.addEventListener('click', handler);
}

function adjustValue(inputId, delta) {
  const hidden = qs(inputId);
  if (!hidden) return;
  let val = parseInt(hidden.value) || 0;

  if (inputId === 'maxPlayers') {
    val = Math.min(15, Math.max(3, val + delta));
    hidden.value = val;
    qs('displayPlayers').innerText = val;
  } else if (inputId === 'impostors') {
    val = Math.min(4, Math.max(1, val + delta));
    hidden.value = val;
    qs('displayImpostors').innerText = val;
  } else if (inputId === 'timeVote') {
    val = Math.min(300, Math.max(60, val + delta));
    hidden.value = val;
    qs('displayVoteTime').innerText = val;
  }
}

function updateCategoriesSummary() {
  const summaryEl = qs('categoriesSummary');
  if (!summaryEl) return;
  const names = CATEGORIES_DATA
    .filter(c => selectedCategories.has(c.id))
    .map(c => c.name);
  if (names.length === 0) {
    summaryEl.innerText = 'Selecciona al menos una categoría';
  } else {
    summaryEl.innerText = names.join(', ');
  }
}

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-pill' + (selectedCategories.has(cat.id) ? ' active' : '');
    btn.innerHTML = `<span class="icon">${cat.icon}</span><span>${cat.name}</span>`;
    btn.onclick = () => {
      if (selectedCategories.has(cat.id)) {
        selectedCategories.delete(cat.id);
      } else {
        selectedCategories.add(cat.id);
      }
      if (selectedCategories.size === 0) {
        selectedCategories.add(cat.id); // no permitir vacío
      }
      renderCategoriesGrid();
    };
    grid.appendChild(btn);
  });
}

// =========================
// NAV PANTALLAS LOBBY
// =========================
function showScreen(screenId) {
  const screens = ['screenHome', 'screenCreate', 'screenJoin', 'screenCategories'];
  screens.forEach(id => {
    const el = qs(id);
    if (el) el.style.display = (id === screenId ? 'flex' : 'none');
  });
}

// =========================
// EVENTOS INICIALES
// =========================
window.addEventListener('load', () => {
  renderCategoriesGrid();
  updateCategoriesSummary();

  // navegación
  bindClick('btnGoCreate', () => showScreen('screenCreate'));
  bindClick('btnGoJoin', () => showScreen('screenJoin'));
  bindClick('backFromCreate', () => showScreen('screenHome'));
  bindClick('backFromJoin', () => showScreen('screenHome'));
  bindClick('btnOpenCategories', () => showScreen('screenCategories'));
  bindClick('backFromCategories', () => showScreen('screenCreate'));
  bindClick('btnSaveCategories', () => { updateCategoriesSummary(); showScreen('screenCreate'); });

  // ayuda
  bindClick('btnHowToPlay', () => qs('howToPlayOverlay').style.display = 'flex');
  bindClick('btnCloseHowToPlay', () => qs('howToPlayOverlay').style.display = 'none');

  // creación / unión
  bindClick('btnCreateRoom', createRoom);
  bindClick('btnJoinRoom', joinRoom);

  // juego
  bindClick('btnStartRound', () => {
    if (!isHost) return;
    socket.emit('startRound');
  });

  bindClick('btnBackToLobby', () => {
    qs('ejectionOverlay').style.display = 'none';
    if (currentRoom) updateGameView(currentRoom);
  });

  bindClick('btnExit', () => {
    // volver al home y recargar para limpiar socket
    location.reload();
  });

  bindClick('btnCopyCode', () => {
    const code = qs('roomCodeDisplay').innerText.trim();
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => {});
  });

  bindClick('btnSkipVote', () => {
    if (!currentRoom || currentPhase !== 'vote' || voteLocked) return;
    voteLocked = true;
    socket.emit('submitVote', { targetId: 'skip' });
  });

  bindClick('btnEndTurn', () => {
    if (!currentRoom || currentPhase !== 'turn') return;
    socket.emit('endTurnNow');
  });

  const secretCard = qs('secretCard');
  if (secretCard) {
    secretCard.addEventListener('click', () => {
      if (!currentRoom || currentPhase !== 'word') return;
      secretCard.classList.add('revealed');
    });
  }
});

// =========================
// SOCKET: CREAR / UNIRSE
// =========================
function createRoom() {
  if (selectedCategories.size === 0) {
    alert('Debes elegir al menos una categoría.');
    return;
  }
  socket.emit('createRoom', {
    name: qs('hostName').value || 'Agente',
    maxPlayers: qs('maxPlayers').value,
    impostors: qs('impostors').value,
    categories: Array.from(selectedCategories),
    turnTime: 15,
    voteTime: qs('timeVote').value,
    groupMode: qs('groupModeToggle').checked
  }, handleConnection);
}

function joinRoom() {
  socket.emit('joinRoom', {
    name: qs('joinName').value || 'Agente',
    roomCode: qs('joinCode').value
  }, handleConnection);
}

function handleConnection(res) {
  if (!res.ok) {
    alert(res.error || 'No se pudo entrar a la sala.');
    return;
  }

  myId = res.me.id;
  isHost = res.isHost;

  qs('lobbyOverlay').style.display = 'none';
  qs('mainContent').style.display = 'block';
  qs('roomCodeDisplay').innerText = res.roomCode;

  if (res.discordLink) {
    const btn = qs('btnDiscordManual');
    if (btn) {
      btn.style.display = 'flex';
      btn.onclick = () => window.open(res.discordLink, '_blank');
    }
  }

  updateGameView({ phase: 'lobby', players: [] });
}

// =========================
// SOCKET: ESTADO SALA
// =========================
socket.on('roomState', (room) => {
  currentRoom = room;
  currentPhase = room.phase || 'lobby';
  updateGameView(room);
});

// Info privada de rol / palabra
socket.on('privateRole', (data) => {
  myRole = data.role;
  myWord = data.word;
  myHint = data.hint;
  if (currentPhase === 'word') {
    updateWordCard();
  }
});

// Resultado ronda
socket.on('roundResult', (data) => {
  const overlay = qs('ejectionOverlay');
  const titleEl = qs('resultTitle');
  const subtitleEl = qs('resultSubtitle');
  const secretWordEl = qs('finalSecretWord');
  const impsEl = qs('finalImpostors');
  const iconEl = qs('resultIcon');

  overlay.style.display = 'flex';

  secretWordEl.innerText = data.secretWord || '---';
  impsEl.innerText = (data.impostors || []).join(', ') || '---';

  if (data.result === 'crew') {
    iconEl.textContent = '✅';
    titleEl.textContent = 'GANÓ LA TRIPULACIÓN';
    subtitleEl.textContent = 'Descubrieron al impostor.';
  } else if (data.result === 'impostor') {
    iconEl.textContent = '🚨';
    titleEl.textContent = 'GANÓ EL IMPOSTOR';
    subtitleEl.textContent = 'El impostor logró pasar desapercibido.';
  } else {
    iconEl.textContent = '⚖️';
    titleEl.textContent = 'RONDA TERMINADA';
    subtitleEl.textContent = 'Sin resultado claro.';
  }
});

// =========================
// UPDATE UI GENERAL
// =========================
function updateGameView(room) {
  if (!room) return;
  currentRoom = room;
  currentPhase = room.phase || 'lobby';

  const phaseLabel = qs('phaseLabel');
  const playersList = qs('playersList');
  const statusText = qs('statusText');
  const timerCircle = qs('timerCircle');
  const timerNumber = qs('timerNumber');

  // fase
  if (phaseLabel) {
    let txt = 'LOBBY';
    if (currentPhase === 'word') txt = 'PALABRA';
    else if (currentPhase === 'turn') txt = 'TURNOS';
    else if (currentPhase === 'vote') txt = 'VOTACIÓN';
    else if (currentPhase === 'result') txt = 'RESULT';
    phaseLabel.innerText = txt;
  }

  // timer circular
  if (timerCircle && timerNumber) {
    const seconds = room.remaining || 0;
    if (!seconds) {
      timerNumber.innerText = '--';
      timerCircle.classList.remove('cyan', 'urgent');
    } else {
      timerNumber.innerText = seconds;
      timerCircle.classList.remove('cyan', 'urgent');
      if (seconds <= 3) {
        timerCircle.classList.add('urgent');
      } else {
        timerCircle.classList.add('cyan');
      }
    }
  }

  // lista de jugadores
  if (playersList) {
    playersList.innerHTML = '';
    (room.players || []).forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      if (p.isDead) row.style.opacity = 0.5;

      // resaltar jugador de turno activo
      if (room.currentTurnId && room.currentTurnId === p.id && currentPhase === 'turn') {
        row.classList.add('player-row-active');
      }

      const avatar = document.createElement('div');
      avatar.className = 'p-avatar';
      avatar.style.backgroundColor = p.color || '#020617';
      avatar.textContent = (p.name || '?').charAt(0).toUpperCase();

      const nameEl = document.createElement('div');
      nameEl.className = 'p-name';
      nameEl.textContent = p.name;

      const tag = document.createElement('div');
      tag.className = 'p-tag';
      if (room.hostId === p.id) tag.textContent = 'HOST';
      else if (p.id === myId) tag.textContent = 'TÚ';
      else tag.textContent = '';

      row.appendChild(avatar);
      row.appendChild(nameEl);
      row.appendChild(tag);
      playersList.appendChild(row);
    });

    qs('currentPlayersCount').innerText = (room.players || []).length;
    qs('currentImpostorsCount').innerText = room.impostors || 1;
  }

  // texto estado
  if (statusText) {
    if (currentPhase === 'lobby') statusText.innerText = 'Esperando que el host inicie la ronda.';
    else if (currentPhase === 'word') statusText.innerText = 'Todos viendo su palabra y rol.';
    else if (currentPhase === 'turn') statusText.innerText = 'Turnos de pistas en curso.';
    else if (currentPhase === 'vote') statusText.innerText = 'Momento de votar al posible impostor.';
    else if (currentPhase === 'result') statusText.innerText = 'Mostrando resultado de la ronda.';
  }

  // cambiar vistas
  const viewLobby = qs('viewLobby');
  const viewWord = qs('viewWord');
  const viewTurn = qs('viewTurn');
  const viewVote = qs('viewVote');

  if (viewLobby) viewLobby.style.display = (currentPhase === 'lobby' ? 'block' : 'none');
  if (viewWord) viewWord.style.display = (currentPhase === 'word' ? 'block' : 'none');
  if (viewTurn) viewTurn.style.display = (currentPhase === 'turn' ? 'block' : 'none');
  if (viewVote) viewVote.style.display = (currentPhase === 'vote' ? 'block' : 'none');

  // palabra / rol
  if (currentPhase === 'word') {
    const secretCard = qs('secretCard');
    if (secretCard) secretCard.classList.remove('revealed');
    updateWordCard();
  }

  // turnos
  const turnInstruction = qs('turnInstruction');
  const currentTurnPlayer = qs('currentTurnPlayer');
  const turnActions = qs('turnActions');

  if (currentPhase === 'turn') {
    const turnPlayer = (room.players || []).find(p => p.id === room.currentTurnId);
    if (currentTurnPlayer) currentTurnPlayer.innerText = turnPlayer ? turnPlayer.name : 'Esperando...';

    if (turnInstruction) {
      if (room.currentTurnId === myId) {
        turnInstruction.innerText = 'Es tu turno: di una pista sin revelar la palabra.';
      } else {
        turnInstruction.innerText = 'Escucha las pistas de los demás jugadores.';
      }
    }

    if (turnActions) {
      turnActions.style.display = (room.currentTurnId === myId ? 'block' : 'none');
    }
  } else if (turnActions) {
    turnActions.style.display = 'none';
  }

  // votación
  if (currentPhase === 'vote') {
    renderVoteGrid(room);
  }
}

// =========================
// Tarjeta palabra / rol
// =========================
function updateWordCard() {
  const roleEl = qs('roleTitle');
  const wordEl = qs('secretWordDisplay');
  const hintEl = qs('wordHint');

  if (!roleEl || !wordEl || !hintEl) return;

  roleEl.innerText = myRole || 'ROL';
  if (myRole === 'IMPOSTOR') {
    wordEl.innerText = '???';
    hintEl.innerText = 'Eres el impostor. Finge que conoces la palabra y copia el estilo de las pistas.';
  } else {
    wordEl.innerText = myWord || '-----';
    hintEl.innerText = myHint || 'No reveles la palabra exacta, solo da pistas.';
  }
}

// =========================
// VOTACIÓN
// =========================
function renderVoteGrid(room) {
  const grid = qs('votePlayersGrid');
  if (!grid) return;
  grid.innerHTML = '';
  voteLocked = !!(room.myVote);

  (room.players || []).filter(p => !p.isDead).forEach(p => {
    const card = document.createElement('div');
    card.className = 'vote-card';

    card.innerHTML = `
      <div class="vote-avatar">🛰️</div>
      <div>${p.name}</div>
    `;

    card.onclick = () => {
      if (voteLocked) return;
      voteLocked = true;
      socket.emit('submitVote', { targetId: p.id });
    };

    grid.appendChild(card);
  });
}

// =========================
// ERRORES
// =========================
socket.on('connect_error', () => {
  alert('Error de conexión con el servidor.');
});
