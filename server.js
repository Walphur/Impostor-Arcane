require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { pingTimeout: 60000, pingInterval: 25000 });

const rooms = {};
const socketRoom = {}; 

app.use(express.static(path.join(__dirname, 'www')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'www', 'index.html')));

// --- DISCORD (Opcional) ---
const { DISCORD_TOKEN, DISCORD_GUILD_ID, DISCORD_CATEGORY_ID } = process.env;
let discordClient = null;
if (DISCORD_TOKEN && DISCORD_GUILD_ID) {
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  discordClient.once('clientReady', () => console.log(`✅ Discord Online`));
  discordClient.login(DISCORD_TOKEN).catch(e => console.error('❌ Discord Error', e));
}

async function createDiscordChannel(code) {
  if (!discordClient?.isReady() || !DISCORD_GUILD_ID) return null;
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    const channel = await guild.channels.create({
      name: `sala-${code}`, type: ChannelType.GuildVoice, parent: DISCORD_CATEGORY_ID || null,
      permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }]
    });
    return { url: `https://discord.com/channels/${guild.id}/${channel.id}`, channelId: channel.id };
  } catch (err) { return null; }
}

// --- UTILIDADES ---
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#0ea5e9', '#22d3ee', '#4ade80', '#facc15', '#fb7185', '#8b5cf6', '#14b8a6', '#64748b'];
const WORD_DB = {
  lugares: ['CINE', 'PLAYA', 'HOSPITAL', 'ESCUELA', 'AEROPUERTO', 'RESTAURANTE', 'GIMNASIO', 'PARQUE', 'MUSEO', 'SUPERMERCADO', 'PLAZA', 'ESTADIO', 'TEATRO', 'OFICINA', 'BIBLIOTECA', 'BANCO', 'HOTEL', 'DISCOTECA', 'ESTACIÓN DE TREN', 'GRANJA', 'PISCINA', 'FÁBRICA', 'ZOO', 'IGLESIA', 'MONTE', 'RIO', 'LAGO', 'DESIERTO', 'SUBMARINO', 'NAVE ESPACIAL', 'CUEVA', 'VOLCÁN', 'ISLA DESIERTA', 'CEMENTERIO', 'LABORATORIO', 'CÁRCEL', 'CASTILLO', 'BOSQUE', 'GARAJE', 'ÁTICO', 'SÓTANO', 'CASINO', 'CRUCERO', 'SPA', 'PELUQUERÍA', 'FARMACIA'],
  comidas: ['PIZZA', 'HAMBURGUESA', 'SUSHI', 'PASTA', 'ENSALADA', 'SOPA', 'EMPANADAS', 'ASADO', 'TACO', 'HELADO', 'CHOCOLATE', 'SÁNDWICH', 'MILANESA', 'ARROZ', 'PAELLA', 'TARTA', 'PANQUEQUES', 'HUEVO FRITO', 'POLLO ASADO', 'BIFE', 'POCHOCLOS', 'LASAÑA', 'CEREAL', 'GALLETITAS', 'TORTILLA', 'GUISO', 'MANDARINA', 'BANANA', 'MANZANA', 'FRUTILLAS', 'QUESO', 'SALAME', 'MATE', 'CAFÉ', 'TE', 'DONA', 'HOT DOG'],
  objetos: ['CELULAR', 'LÁPIZ', 'LIBRO', 'SILLA', 'MESA', 'RELOJ', 'AURICULARES', 'LÁMPARA', 'TECLADO', 'MOUSE', 'CONTROL REMOTO', 'BICICLETA', 'AUTO', 'LAVARROPAS', 'HELADERA', 'TELEVISOR', 'MICRÓFONO', 'CÁMARA', 'CUADERNO', 'MOCHILA', 'LLAVES', 'BILLETERA', 'ANTEOJOS', 'ZAPATILLA', 'ALMOHADA', 'CEPILLO DE DIENTES', 'GUITARRA', 'PELOTA', 'MARTILLO', 'DESTORNILLADOR', 'ESPEJO', 'PEINE'],
  animales: ['PERRO', 'GATO', 'LEÓN', 'ELEFANTE', 'TIGRE', 'CABALLO', 'VACA', 'OVEJA', 'POLLO', 'CERDO', 'MONO', 'DELFIN', 'TIBURÓN', 'PINGÜINO', 'ÁGUILA', 'BUHO', 'ZORRO', 'LOBO', 'OSO', 'JIRAFA', 'SERPIENTE', 'COCODRILO', 'TORTUGA', 'CONEJO', 'PATO', 'PALOMA', 'MURCIÉLAGO', 'BALLENA', 'PULPO'],
  profesiones: ['MÉDICO', 'ABOGADO', 'INGENIERO', 'DOCENTE', 'POLICÍA', 'CHEF', 'MECÁNICO', 'ELECTRICISTA', 'PROGRAMADOR', 'DISEÑADOR', 'ARQUITECTO', 'ENFERMERO', 'PILOTO', 'CAMARERO', 'BOMBERO', 'ACTOR', 'MÚSICO', 'PINTOR', 'ESCRITOR', 'CIENTÍFICO', 'ASTRONAUTA', 'DETECTIVE', 'GRANJERO', 'PESCADOR'],
  deportes: ['FÚTBOL', 'BÁSQUET', 'TENIS', 'NATACIÓN', 'CICLISMO', 'RUGBY', 'HANDBALL', 'VOLEY', 'PATÍN', 'BOXEO', 'JUDO', 'SKATE', 'SURF', 'GOLF', 'ATLETISMO', 'HOCKEY', 'BEISBOL', 'ESQUÍ'],
  tecnologia: ['COMPUTADORA', 'TABLET', 'DRON', 'CONSOLA', 'IMPRESORA', 'ROBOT', 'SERVIDOR', 'SATÉLITE', 'AURICULARES BLUETOOTH', 'SMARTWATCH', 'TECLADO GAMER', 'CÁMARA DIGITAL', 'PROYECTOR', 'MEMORIA USB', 'ROUTER WIFI', 'INTELIGENCIA ARTIFICIAL', 'REALIDAD VIRTUAL'],
  fantasia: ['DRAGÓN', 'HADA', 'BRUJO', 'ELFO', 'VAMPIRO', 'HOMBRE LOBO', 'UNICORNIO', 'FÉNIX', 'OGRO', 'GIGANTE', 'DUENDE', 'SIRENA', 'ZOMBIE', 'FANTASMA', 'ALIENÍGENA', 'SUPERHÉROE', 'VILLANO', 'MAGO', 'HECHICERO']
};

function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function generateCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let res = ''; for (let i = 0; i < 6; i++) res += chars[Math.floor(Math.random() * chars.length)]; return res; }
function pickWord(cats) { const pool = []; (cats.length ? cats : ['lugares']).forEach(c => { if (WORD_DB[c]) pool.push(...WORD_DB[c]); }); return pool[Math.floor(Math.random() * pool.length)]; }
function assignColor(room) { const used = new Set(room.players.map(p => p.color)); return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0]; }
function getRoom(id) { const code = socketRoom[id]; return code ? rooms[code] : null; }
function clearRoomTimer(room) { if (room._timer) { clearInterval(room._timer); room._timer = null; } }

function startTimer(room, seconds, onEnd) {
  clearRoomTimer(room); room.remaining = seconds; room.timerText = `${seconds}`; emitRoomState(room);
  room._timer = setInterval(() => {
    room.remaining--;
    if (room.remaining <= 0) { clearRoomTimer(room); room.timerText = '--'; emitRoomState(room); if (onEnd) onEnd(room); }
    else { room.timerText = `${room.remaining}`; emitRoomState(room); }
  }, 1000);
}

function serializeRoom(room) {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, mode: room.mode, config: room.config, 
    players: room.players.map(p => ({ id: p.id, userId: p.userId, name: p.name, color: p.color, isDead: p.isDead, disconnected: p.disconnected })),
    currentTurnId: room.currentTurnId, timerText: room.timerText, remaining: room.remaining,
    votes: room.votes, impostors: room.impostors, discordLink: room.discordLink, clues: room.clues || []
  };
}
function emitRoomState(room) { if (room) io.to(room.code).emit('roomState', serializeRoom(room)); }

// --- SOCKET LOGICA ---
io.on('connection', (socket) => {
  socket.on('createRoom', async (data, cb) => {
    const code = generateCode();
    const maxP = Math.min(15, Math.max(3, parseInt(data.maxPlayers) || 10));
    const imps = Math.min(maxP - 1, Math.max(1, parseInt(data.impostors) || 2));
    
    let discordLink = null, discordChannelId = null;
    if (data.mode === 'discord') {
      const info = await createDiscordChannel(code);
      if (info) { discordLink = info.url; discordChannelId = info.channelId; }
    }

    rooms[code] = {
      code, hostId: socket.id, maxPlayers: maxP, impostors: imps, categories: data.categories, mode: data.mode || 'group',
      config: { turnTime: 30000, voteTime: (parseInt(data.voteTime) || 120) * 1000 },
      players: [{ id: socket.id, userId: data.userId || socket.id, name: data.name || 'Host', color: assignColor({players:[]}), isDead: false, disconnected: false }],
      phase: 'lobby', roles: {}, votes: {}, spoken: {}, discordLink, discordChannelId, timerText: '--', clues: []
    };
    
    socketRoom[socket.id] = code; socket.join(code);
    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true, discordLink, room: serializeRoom(rooms[code]) });
    emitRoomState(rooms[code]);
  });

  socket.on('joinRoom', (data, cb) => {
    const code = (data.roomCode || '').trim().toUpperCase(); const room = rooms[code];
    if (!room) return cb({ ok: false, error: 'Sala no existe' });

    const existing = room.players.find(p => p.userId === data.userId);
    if (existing) {
        if(existing.disconnectTimeout) clearTimeout(existing.disconnectTimeout);
        delete socketRoom[existing.id];
        
        existing.id = socket.id; existing.disconnected = false; 
        socketRoom[socket.id] = code; socket.join(code);

        if (room.hostId === existing.id) room.hostId = socket.id;
        if (room.roles[existing.id]) {
             const role = room.roles[existing.id]; delete room.roles[existing.id]; room.roles[socket.id] = role;
             const isImp = role === 'impostor';
             socket.emit('privateRole', { role: isImp ? 'IMPOSTOR' : 'TRIPULANTE', word: isImp ? '???' : room.secretWord, hint: isImp ? 'Finge.' : 'Pista sutil.' });
        }
        cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: (room.hostId === socket.id), discordLink: room.discordLink, room: serializeRoom(room) });
        emitRoomState(room);
        return;
    }

    if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Sala llena' });
    if (room.phase !== 'lobby') return cb({ ok: false, error: 'Partida iniciada' });
    if (room.players.some(p => p.name.toUpperCase() === (data.name || '').toUpperCase())) return cb({ ok: false, error: 'Nombre en uso' });

    socketRoom[socket.id] = code; socket.join(code);
    room.players.push({ id: socket.id, userId: data.userId || socket.id, name: data.name, color: assignColor(room), isDead: false, disconnected: false });
    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: false, discordLink: room.discordLink, room: serializeRoom(room) });
    emitRoomState(room);
  });

  socket.on('updateSettings', (data) => {
    const room = getRoom(socket.id);
    if(room && room.hostId === socket.id && room.phase === 'lobby') {
        if(data.impostors) room.impostors = parseInt(data.impostors);
        if(data.maxPlayers) room.maxPlayers = parseInt(data.maxPlayers);
        if(data.voteTime) room.config.voteTime = parseInt(data.voteTime) * 1000;
        emitRoomState(room);
    }
  });

  socket.on('startRound', () => {
    const room = getRoom(socket.id); 
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.length < 3) return; 
    
    clearRoomTimer(room);
    room.players.forEach(p => p.isDead = false); room.votes = {}; room.spoken = {}; room.clues = [];
    room.players = shuffle(room.players);
    
    const impsCount = Math.min(room.impostors, Math.max(1, room.players.length - 2));
    const indices = shuffle(room.players.map((_, i) => i)).slice(0, impsCount);
    
    room.roles = {};
    room.players.forEach((p, i) => { room.roles[p.id] = indices.includes(i) ? 'impostor' : 'crew'; });
    room.secretWord = pickWord(room.categories);
    
    room.phase = 'word'; 
    room.players.forEach(p => {
      const isImp = room.roles[p.id] === 'impostor';
      io.to(p.id).emit('privateRole', { role: isImp ? 'IMPOSTOR' : 'TRIPULANTE', word: isImp ? '???' : room.secretWord, hint: isImp ? 'Finge.' : 'Pista.' });
    });
    
    emitRoomState(room);
    startTimer(room, 10, (r) => { r.phase = 'turn'; r.turnIndex = -1; nextTurn(r); });
  });

  socket.on('submitClue', (data) => {
      const room = getRoom(socket.id);
      if (room && room.phase === 'turn' && room.currentTurnId === socket.id) {
          const p = room.players.find(p => p.id === socket.id);
          room.clues.push({ name: p.name, color: p.color, text: data.text.trim().substring(0, 20) });
          clearRoomTimer(room); avanzarDesdeTurno(room);
      }
  });

  socket.on('submitVote', (data) => {
    const room = getRoom(socket.id); 
    const p = room?.players.find(p => p.id === socket.id);
    if (!room || room.phase !== 'vote' || !p || p.isDead) return;

    room.votes[socket.id] = data.targetId; 
    emitRoomState(room);
    
    const living = room.players.filter(p => !p.isDead && !p.disconnected).length;
    if (Object.keys(room.votes).length >= living) finishVoting(room);
  });

  socket.on('endTurnEarly', () => {
    const room = getRoom(socket.id); 
    if (room && room.phase === 'turn' && room.currentTurnId === socket.id) {
        clearRoomTimer(room); avanzarDesdeTurno(room);
    }
  });

  socket.on('cancelRound', () => {
      const room = getRoom(socket.id);
      if (room && room.hostId === socket.id) resetToLobby(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.id); if (!room) return;
    const player = room.players.find(p => p.id === socket.id); if (!player) return;
    
    player.disconnected = true; 
    emitRoomState(room);

    player.disconnectTimeout = setTimeout(() => {
        if (!rooms[room.code]) return;
        const idx = room.players.indexOf(player);
        if (idx > -1) {
            room.players.splice(idx, 1);
            if(room.hostId === player.id && room.players.length > 0) room.hostId = room.players[0].id;
            
            if (room.players.length === 0) {
                delete rooms[room.code];
                if(room.discordChannelId) discordClient?.channels.fetch(room.discordChannelId).then(c=>c?.delete()).catch(()=>{});
            } else {
                emitRoomState(room);
            }
        }
    }, 60000); 
    
    delete socketRoom[socket.id];
  });
});

function nextTurn(room) {
  const living = room.players.map((p, i) => ({p, i})).filter(o => !o.p.isDead && !o.p.disconnected);
  if (living.length === 0) return finishVoting(room);
  
  let next = 0;
  if (room.turnIndex !== -1) {
      const currPos = living.findIndex(o => o.i === room.turnIndex);
      next = (currPos + 1) % living.length;
  }
  
  room.turnIndex = living[next].i; 
  room.currentTurnId = room.players[room.turnIndex].id;
  room.phase = 'turn'; emitRoomState(room);
  startTimer(room, room.config.turnTime / 1000, (r) => avanzarDesdeTurno(r));
}

function avanzarDesdeTurno(room) {
  room.spoken[room.currentTurnId] = true;
  const pending = room.players.filter(p => !p.isDead && !p.disconnected && !room.spoken[p.id]);
  
  if (pending.length > 0) nextTurn(room);
  else {
    room.phase = 'vote'; room.votes = {}; emitRoomState(room);
    startTimer(room, room.config.voteTime / 1000, (r) => finishVoting(r));
  }
}

function finishVoting(room) {
  clearRoomTimer(room); 
  room.phase = 'result';
  
  const counts = {}; let maxV = 0;
  Object.values(room.votes).forEach(v => { counts[v] = (counts[v]||0)+1; if(counts[v]>maxV) maxV=counts[v]; });
  const candidates = Object.keys(counts).filter(k => counts[k] === maxV);
  
  let elimId = (candidates.length === 1 && candidates[0] !== 'skip') ? candidates[0] : null;
  let result = 'tie', reason = "Empate o Skip."; 

  if (elimId) {
      const victim = room.players.find(p => p.id === elimId);
      if(victim) {
          victim.isDead = true;
          result = 'ejected';
          const isImp = room.roles[elimId] === 'impostor';
          reason = isImp ? `¡${victim.name} era Impostor!` : `${victim.name} era Inocente.`;
      }
  }

  const imps = room.players.filter(p => !p.isDead && room.roles[p.id] === 'impostor').length;
  const crew = room.players.filter(p => !p.isDead && room.roles[p.id] === 'crew').length;

  if (imps === 0) { result = 'crew'; reason = "¡Tripulantes Ganan!"; }
  else if (imps >= crew) { result = 'impostor'; reason = "¡Impostores Ganan!"; }

  const impsNames = room.players.filter(p=>room.roles[p.id]==='impostor').map(p=>p.name);
  io.to(room.code).emit('roundResult', { result, secretWord: room.secretWord, reason, impostors: impsNames });

  // 10 SEGUNDOS
  setTimeout(() => {
      if(!rooms[room.code]) return;
      if (result === 'crew' || result === 'impostor') resetToLobby(room);
      else {
          room.votes = {}; room.spoken = {};
          const living = room.players.filter(p => !p.isDead && !p.disconnected);
          if(living.length) {
              const startP = living[Math.floor(Math.random() * living.length)];
              room.turnIndex = room.players.indexOf(startP);
              room.currentTurnId = startP.id;
              room.phase = 'turn'; emitRoomState(room);
              startTimer(room, room.config.turnTime/1000, r=>avanzarDesdeTurno(r));
          } else resetToLobby(room);
      }
  }, 10000);
}

function resetToLobby(room) { 
    room.phase = 'lobby'; room.timerText = '--'; room.votes = {}; room.spoken = {}; room.clues = []; 
    emitRoomState(room); 
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server 1.4 LIVE en ${PORT}`));