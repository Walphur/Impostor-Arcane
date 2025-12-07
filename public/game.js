const socket = io();

// Referencias DOM
const lobbyOverlay = document.getElementById('lobbyOverlay');
const mainContent = document.getElementById('mainContent');
const headerSubtitle = document.getElementById('headerSubtitle');
const myInfo = document.getElementById('myInfo');
const logEl = document.getElementById('log');
const playersListEl = document.getElementById('playersList');

// Variables de Estado
let myId = null;
let isHost = false;
let currentPhase = 'lobby';

// --- UTILIDADES ---
function log(tag, msg) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-tag">${tag}</span> ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// --- LOGICA DE TABS (Lobby) ---
const tabCreate = document.getElementById('tabCreate');
const tabJoin = document.getElementById('tabJoin');
const panelCreate = document.getElementById('panelCreate');
const panelJoin = document.getElementById('panelJoin');

tabCreate.onclick = () => {
  tabCreate.classList.add('active');
  tabJoin.classList.remove('active');
  panelCreate.style.display = 'block';
  panelJoin.style.display = 'none';
};
tabJoin.onclick = () => {
  tabJoin.classList.add('active');
  tabCreate.classList.remove('active');
  panelCreate.style.display = 'none';
  panelJoin.style.display = 'block';
};

// --- BOTONES ---

// 1. CREAR SALA (Modificado para Discord)
document.getElementById('btnCreateRoom').onclick = () => {
  const name = document.getElementById('hostName').value;
  const maxPlayers = document.getElementById('maxPlayers').value;
  const impostors = document.getElementById('impostors').value;
  
  socket.emit('createRoom', { name, maxPlayers, impostors }, (res) => {
    if(res.ok) {
        setupGame(res);
        // --- LOGICA DISCORD ---
        if (res.discordLink) {
            log('DISCORD', 'Abriendo canal de voz...');
            window.open(res.discordLink, '_blank');
        }
    } else {
        alert(res.error);
    }
  });
};

// 2. UNIRSE A SALA (Modificado para Discord)
document.getElementById('btnJoinRoom').onclick = () => {
  const name = document.getElementById('joinName').value;
  const code = document.getElementById('joinCode').value;
  
  socket.emit('joinRoom', { name, roomCode: code }, (res) => {
    if(res.ok) {
        setupGame(res);
        // --- LOGICA DISCORD ---
        if (res.discordLink) {
            log('DISCORD', 'Abriendo canal de voz...');
            window.open(res.discordLink, '_blank');
        }
    } else {
        alert(res.error);
    }
  });
};

document.getElementById('btnStartRound').onclick = () => {
  socket.emit('startRound');
};

document.getElementById('btnSkipVote').onclick = () => {
  socket.emit('submitVote', { targetId: null });
};

function setupGame(res) {
  lobbyOverlay.style.display = 'none';
  mainContent.classList.remove('blurred');
  myId = res.me.id;
  isHost = res.isHost;
  document.getElementById('roomCodeDisplay').innerText = res.roomCode;
  log('SISTEMA', `Te has unido a la sala ${res.roomCode}`);
}

// --- SOCKET EVENTOS ---
socket.on('roomState', (room) => {
  headerSubtitle.innerText = `Sala: ${room.roomCode}`;
  myInfo.innerText = isHost ? 'Eres el Anfitrión' : 'Eres Jugador';
  currentPhase = room.phase;
  
  // Actualizar lista jugadores
  playersListEl.innerHTML = '';
  room.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-item';
    if(p.id === myId) div.classList.add('me');
    
    let actionBtn = '';
    if(currentPhase === 'votacion' && p.id !== myId) {
      actionBtn = `<button onclick="votar('${p.id}')" class="vote-btn">VOTAR</button>`;
    }

    div.innerHTML = `
      <div class="player-info">
        <span class="name">${p.name}</span>
      </div>
      ${actionBtn}
    `;
    playersListEl.appendChild(div);
  });

  // UI Botones
  const btnStart = document.getElementById('btnStartRound');
  const btnSkip = document.getElementById('btnSkipVote');
  
  // Lógica de botones
  if (isHost && room.phase === 'lobby' && room.players.length >= 3) {
      btnStart.disabled = false;
      btnStart.style.opacity = "1";
  } else {
      btnStart.disabled = true;
      btnStart.style.opacity = "0.5";
  }

  if (room.phase === 'votacion') {
      btnSkip.disabled = false;
      btnSkip.style.opacity = "1";
  } else {
      btnSkip.disabled = true;
      btnSkip.style.opacity = "0.5";
  }

  document.getElementById('phasePill').innerText = room.phase.toUpperCase();
});

// Función global para votar desde el HTML generado
window.votar = (id) => {
  socket.emit('submitVote', { targetId: id });
  log('TU', 'Has enviado tu voto.');
};

socket.on('yourRole', (data) => {
  const roleEl = document.getElementById('roleDisplay');
  const wordEl = document.getElementById('wordDisplay');
  
  if (data.role === 'impostor') {
    roleEl.innerText = 'ERES EL IMPOSTOR';
    roleEl.style.color = '#ef4444'; // Rojo
    wordEl.innerText = '???';
    log('ROL', '¡Eres el IMPOSTOR! Disimula.');
  } else {
    roleEl.innerText = 'CIUDADANO';
    roleEl.style.color = '#22c55e'; // Verde
    wordEl.innerText = data.word;
    log('ROL', `Eres Ciudadano. La palabra es: ${data.word}`);
  }
});

socket.on('votingResults', (data) => {
    if (data.kickedPlayer) {
        log('VOTACIÓN', `${data.kickedPlayer.name} fue expulsado.`);
        log('VOTACIÓN', data.isImpostor ? '¡ERA EL IMPOSTOR!' : 'Era inocente...');
    } else {
        log('VOTACIÓN', 'Nadie fue expulsado (Empate o Skip).');
    }
});