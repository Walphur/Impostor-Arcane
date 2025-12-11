const socket = io();

// ESTADO
let myId = null;
let isHost = false;
let currentRoom = null;
let currentPhase = 'lobby';
let selectedCategories = new Set(['lugares', 'comidas', 'objetos']);
let myRole = null; 
let myWord = null;
let myHint = null;
let voteLocked = false;

const qs = (id) => document.getElementById(id);

// SONIDOS
function playSound(id) {
  const audio = qs(id);
  if(audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
}

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

document.addEventListener('DOMContentLoaded', () => {
  renderCategoriesGrid();
  updateCategoriesSummary();
  setupEventListeners();
});

function setupEventListeners() {
  const screens = ['screenHome', 'screenCreate', 'screenJoin', 'screenCategories'];
  const show = (id) => screens.forEach(s => qs(s).style.display = (s === id ? (id === 'screenHome' ? 'flex' : 'flex') : 'none'));

  qs('btnGoCreate').onclick = () => { playSound('soundClick'); show('screenCreate'); };
  qs('btnGoJoin').onclick = () => { playSound('soundClick'); show('screenJoin'); };
  qs('backFromCreate').onclick = () => { playSound('soundClick'); show('screenHome'); };
  qs('backFromJoin').onclick = () => { playSound('soundClick'); show('screenHome'); };
  qs('btnOpenCategories').onclick = () => { playSound('soundClick'); show('screenCategories'); };
  qs('backFromCategories').onclick = () => { playSound('soundClick'); show('screenCreate'); };
  qs('btnSaveCategories').onclick = () => { playSound('soundClick'); updateCategoriesSummary(); show('screenCreate'); };
  qs('btnHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'flex';
  qs('btnCloseHowToPlay').onclick = () => qs('howToPlayOverlay').style.display = 'none';

  qs('btnCreateRoom').onclick = () => { playSound('soundClick'); createRoom(); };
  qs('btnJoinRoom').onclick = () => { playSound('soundClick'); joinRoom(); };
  qs('btnStartRound').onclick = () => { if(isHost) socket.emit('startRound'); };
  qs('btnExit').onclick = () => location.reload();
  qs('btnBackToLobby').onclick = () => { qs('ejectionOverlay').style.display = 'none'; if(currentRoom) updateGameView(currentRoom); };
  qs('btnCopyCode').onclick = () => { const code = qs('roomCodeDisplay').innerText; if(code !== '------') navigator.clipboard.writeText(code); };
  qs('btnSkipVote').onclick = () => { if(!currentRoom || currentPhase !== 'vote' || voteLocked) return; socket.emit('submitVote', { targetId: 'skip' }); voteLocked = true; qs('voteSubtitle').innerText = 'Has votado saltar.'; };
  qs('btnEndTurn').onclick = () => { if(currentRoom && currentPhase === 'turn') socket.emit('endTurnEarly'); };
}

function renderCategoriesGrid() {
  const grid = qs('categoriesGrid');
  grid.innerHTML = '';
  CATEGORIES_DATA.forEach(cat => {
    const btn = document.createElement('div');
    btn.className = 'category-pill' + (selectedCategories.has(cat.id) ? ' active' : '');
    btn.innerHTML = `<span>${cat.icon}</span><span>${cat.name}</span>`;
    btn.onclick = () => {
      playSound('soundClick');
      if(selectedCategories.has(cat.id)) selectedCategories.delete(cat.id);
      else selectedCategories.add(cat.id);
      if(selectedCategories.size === 0) selectedCategories.add(cat.id);
      renderCategoriesGrid();
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

window.toggleSecretCard = function() { if(currentPhase !== 'word') return; playSound('soundFlip'); qs('secretCardInner').classList.toggle('flipped'); };

function createRoom() {
  if(selectedCategories.size === 0) return alert('Elige categorías');
  socket.emit('createRoom', {
    name: qs('hostName').value || 'Agente', maxPlayers: qs('maxPlayers').value, impostors: qs('impostors').value,
    categories: Array.from(selectedCategories), voteTime: qs('timeVote').value, groupMode: qs('groupModeToggle').checked
  }, handleJoin);
}
function joinRoom() { socket.emit('joinRoom', { name: qs('joinName').value || 'Agente', roomCode: qs('joinCode').value }, handleJoin); }
function handleJoin(res) {
  if(!res.ok) return alert(res.error || 'Error');
  myId = res.me.id; isHost = res.isHost;
  qs('lobbyOverlay').style.display = 'none'; qs('mainContent').style.display = 'block'; qs('roomCodeDisplay').innerText = res.roomCode;
  if(res.discordLink && !isHost) window.open(res.discordLink, '_blank');
  updateGameView({ phase: 'lobby', players: [], hostId: isHost ? myId : null });
}

socket.on('roomState', (room) => { currentRoom = room; updateGameView(room); });
socket.on('privateRole', (data) => { myRole = data.role; myWord = data.word; myHint = data.hint; if(currentPhase === 'word') updateWordCard(); });
socket.on('roundResult', (data) => {
  qs('finalSecretWord').innerText = data.secretWord; qs('finalImpostors').innerText = data.impostors.join(', ');
  const iWon = (data.result === 'crew' && myRole === 'TRIPULANTE') || (data.result === 'impostor' && myRole === 'IMPOSTOR');
  if(iWon) { playSound('soundWin'); qs('resultTitle').innerText = "VICTORIA"; qs('resultTitle').style.color="#4ade80"; }
  else { playSound('soundLose'); qs('resultTitle').innerText = "DERROTA"; qs('resultTitle').style.color="#ef4444"; }
  qs('resultSubtitle').innerText = data.reason; qs('ejectionOverlay').style.display = 'flex';
});

function updateGameView(room) {
  currentPhase = room.phase; isHost = (room.hostId === myId);
  qs('phaseLabel').innerText = currentPhase.toUpperCase(); qs('timerNumber').innerText = room.timerText || '--';
  const list = qs('playersList'); list.innerHTML = '';
  (room.players || []).forEach(p => {
    const row = document.createElement('div'); row.className = 'player-row';
    if(p.isDead) row.style.opacity = '0.5';
    if(room.currentTurnId === p.id) row.style.border = '1px solid #3b82f6';
    row.innerHTML = `<div style="width:24px;height:24px;background:${p.color};border-radius:50%;text-align:center;font-weight:bold;color:#000;">${p.name[0]}</div><div style="flex:1;">${p.name}</div>${p.id === room.hostId ? '<span style="font-size:0.7rem;opacity:0.7;">HOST</span>' : ''}`;
    list.appendChild(row);
  });
  qs('currentPlayersCount').innerText = room.players.length; qs('currentImpostorsCount').innerText = room.impostors;
  qs('btnStartRound').style.display = (isHost && currentPhase === 'lobby') ? 'block' : 'none';
  ['viewLobby', 'viewWord', 'viewTurn', 'viewVote'].forEach(v => qs(v).style.display = 'none');
  if(currentPhase === 'lobby') { qs('viewLobby').style.display = 'block'; qs('statusText').innerText = isHost ? "Inicia cuando estén listos." : "Esperando al host..."; }
  else if(currentPhase === 'word') { qs('viewWord').style.display = 'block'; qs('secretCardInner').classList.remove('flipped'); updateWordCard(); qs('statusText').innerText = "Viendo roles..."; }
  else if(currentPhase === 'turn') { qs('viewTurn').style.display = 'block'; const turnP = room.players.find(p => p.id === room.currentTurnId); qs('currentTurnPlayer').innerText = turnP ? turnP.name : '...'; qs('turnActions').style.display = (room.currentTurnId === myId) ? 'block' : 'none'; qs('statusText').innerText = "Ronda de pistas."; }
  else if(currentPhase === 'vote') { qs('viewVote').style.display = 'block'; renderVoteGrid(room); qs('statusText').innerText = "Votación en curso."; }
}

function updateWordCard() { qs('roleTitle').innerText = myRole; qs('secretWordDisplay').innerText = myWord; qs('wordHint').innerText = myHint; }
function renderVoteGrid(room) {
  const grid = qs('votePlayersGrid'); grid.innerHTML = ''; voteLocked = !!(room.votes && room.votes[myId]);
  room.players.filter(p => !p.isDead && p.id !== myId).forEach(p => {
    const btn = document.createElement('div'); btn.className = 'mini-card'; btn.style.cursor = 'pointer';
    if(room.votes && room.votes[myId] === p.id) btn.style.border = '2px solid #ef4444';
    btn.innerHTML = `<div style="font-weight:bold;">${p.name}</div>`;
    btn.onclick = () => { if(voteLocked) return; socket.emit('submitVote', { targetId: p.id }); voteLocked = true; qs('voteSubtitle').innerText = `Votaste a ${p.name}`; };
    grid.appendChild(btn);
  });
}