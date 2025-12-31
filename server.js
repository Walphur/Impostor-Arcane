require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { pingTimeout: 60000, pingInterval: 25000 });

// --- CONFIGURACIÓN DE VERSIÓN ---
// Cada vez que subas una nueva APK, incrementa esto.
// Los celulares con versión menor recibirán el aviso de actualizar.
const MIN_APP_VERSION = 17; 

const rooms = {};
const socketRoom = {}; 

app.use(express.static(path.join(__dirname, 'www')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'www', 'index.html')); });

// DISCORD
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CATEGORY_ID = process.env.DISCORD_CATEGORY_ID; 
let discordClient = null; let discordReady = false;
if (DISCORD_TOKEN && DISCORD_GUILD_ID) {
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  discordClient.once('clientReady', () => { console.log(`✅ Discord Online`); discordReady = true; });
  discordClient.login(DISCORD_TOKEN).catch(e => console.error('❌ Discord Error', e));
}
async function createDiscordChannelForRoom(code) {
  if (!discordClient || !discordReady || !DISCORD_GUILD_ID) return null;
  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
    const channel = await guild.channels.create({
      name: `sala-${code}`, type: ChannelType.GuildVoice, parent: DISCORD_CATEGORY_ID || null,
      permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }]
    });
    return { url: `https://discord.com/channels/${guild.id}/${channel.id}`, channelId: channel.id };
  } catch (err) { return null; }
}

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
function generateCode() { let res = ''; const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (let i = 0; i < 6; i++) res += chars[Math.floor(Math.random() * chars.length)]; return res; }
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
    code: room.code, hostId: room.hostId, phase: room.phase, mode: room.mode,
    config: room.config, maxPlayers: room.maxPlayers, 
    players: room.players.map(p => ({ id: p.id, userId: p.userId, name: p.name, color: p.color, isDead: p.isDead, disconnected: p.disconnected })),
    currentTurnId: room.currentTurnId, timerText: room.timerText, remaining: room.remaining,
    votes: room.votes, impostors: room.impostors, discordLink: room.discordLink,
    clues: room.clues || [], introReady: room.introReady || [], impostorNames: room.impostorNames || []
  };
}
function emitRoomState(room) { if (room) io.to(room.code).emit('roomState', serializeRoom(room)); }

io.on('connection', (socket) => {
  socket.on('getPublicRooms', () => {
      const publicRooms = Object.values(rooms)
          .filter(r => {
              const activePlayers = r.players.filter(p => !p.disconnected).length;
              return r.isPublic && r.phase === 'lobby' && r.players.length < r.maxPlayers && activePlayers > 0;
          })
          .map(r => ({
              code: r.code,
              name: r.players[0] ? r.players[0].name + "'s Sala" : "Sala Pública",
              players: r.players.filter(p => !p.disconnected).length, max: r.maxPlayers, mode: r.mode
          }));
      socket.emit('publicRoomsList', publicRooms);
  });

  socket.on('createRoom', async (data, cb) => {
    // CHEQUEO DE VERSIÓN
    if (data.clientVersion && data.clientVersion < MIN_APP_VERSION) {
        return cb({ ok: false, error: 'UPDATE_REQUIRED' });
    }

    const code = generateCode();
    const maxP = 10; const imps = 2;
    const userId = data.userId || socket.id;
    const mode = data.mode || 'group'; 
    const isPublic = data.isPublic || false;

    let discordLink = null; let discordChannelId = null;
    if (mode === 'discord' && discordClient && discordReady) {
      const info = await createDiscordChannelForRoom(code);
      if (info) { discordLink = info.url; discordChannelId = info.channelId; }
    }

    rooms[code] = {
      code, hostId: socket.id, maxPlayers: maxP, impostors: imps, categories: data.categories, mode: mode, isPublic: isPublic,
      config: { turnTime: 30000, voteTime: 120000 },
      players: [{ id: socket.id, userId: userId, name: data.name || 'Host', color: assignColor({players:[]}), isDead: false, disconnected: false }],
      phase: 'lobby', roles: {}, votes: {}, spoken: {}, discordLink, discordChannelId, timerText: '--',
      clues: [], deletionTimer: null, introReady: [], impostorNames: [] 
    };
    
    socketRoom[socket.id] = code; socket.join(code);
    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true, discordLink, room: serializeRoom(rooms[code]) });
    emitRoomState(rooms[code]);
  });

  socket.on('joinRoom', (data, cb) => {
    // CHEQUEO DE VERSIÓN
    if (data.clientVersion && data.clientVersion < MIN_APP_VERSION) {
        return cb({ ok: false, error: 'UPDATE_REQUIRED' });
    }

    const code = (data.roomCode || '').trim().toUpperCase(); const room = rooms[code];
    const userId = data.userId || socket.id;
    if (!room) return cb({ ok: false, error: 'Sala no existe' });

    const existingPlayer = room.players.find(p => p.userId === userId);
    if (existingPlayer) {
        if (existingPlayer.disconnectTimeout) { clearTimeout(existingPlayer.disconnectTimeout); existingPlayer.disconnectTimeout = null; }
        if (room.deletionTimer) { clearTimeout(room.deletionTimer); room.deletionTimer = null; }
        
        const oldSocketId = existingPlayer.id;
        delete socketRoom[oldSocketId]; socketRoom[socket.id] = code;
        existingPlayer.id = socket.id; existingPlayer.disconnected = false; 
        
        if (data.name && data.name.trim() !== '') existingPlayer.name = data.name;

        if (room.hostId === oldSocketId) room.hostId = socket.id;
        if (room.currentTurnId === oldSocketId) room.currentTurnId = socket.id;

        let myRoleData = null;
        if(room.phase !== 'lobby' && room.roles[socket.id]) {
            const isImp = room.roles[socket.id] === 'impostor';
            const catName = getCategoryName(room.secretCategory);
            const partners = room.players.filter(p => room.roles[p.id] === 'impostor' && p.id !== socket.id).map(p => p.name);
            myRoleData = { role: isImp ? 'IMPOSTOR' : 'TRIPULANTE', word: isImp ? '???' : room.secretWord, hint: isImp ? 'Finge saber.', category: catName, partners: isImp ? partners : [] };
        } else if (room.phase !== 'lobby' && room.roles[oldSocketId]) {
             room.roles[socket.id] = room.roles[oldSocketId]; delete room.roles[oldSocketId];
             const isImp = room.roles[socket.id] === 'impostor';
             const catName = getCategoryName(room.secretCategory);
             const partners = room.players.filter(p => room.roles[p.id] === 'impostor' && p.id !== socket.id).map(p => p.name);
             myRoleData = { role: isImp ? 'IMPOSTOR' : 'TRIPULANTE', word: isImp ? '???' : room.secretWord, hint: isImp ? 'Finge saber.', category: catName, partners: isImp ? partners : [] };
        }

        socket.join(code);
        cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: (room.hostId === socket.id), discordLink: room.discordLink, room: serializeRoom(room) });
        if(myRoleData) socket.emit('privateRole', myRoleData);
        emitRoomState(room);
        return;
    }

    if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Sala llena' });
    if (room.phase !== 'lobby') return cb({ ok: false, error: 'Partida ya iniciada' });
    if (room.players.some(p => p.name.toUpperCase() === (data.name || '').toUpperCase())) return cb({ ok: false, error: 'Nombre en uso' });

    if (room.deletionTimer) { clearTimeout(room.deletionTimer); room.deletionTimer = null; }
    socket.join(code); socketRoom[socket.id] = code;
    room.players.push({ id: socket.id, userId: userId, name: data.name, color: assignColor(room), isDead: false, disconnected: false });
    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: false, discordLink: room.discordLink, room: serializeRoom(room) });
    emitRoomState(room);
  });

  socket.on('kickPlayer', (targetId) => {
      const room = getRoom(socket.id);
      if(!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
      const pIndex = room.players.findIndex(p => p.id === targetId);
      if(pIndex > -1) {
          const player = room.players[pIndex];
          room.players.splice(pIndex, 1);
          io.to(targetId).emit('kicked');
          const targetSocket = io.sockets.sockets.get(targetId);
          if(targetSocket) { targetSocket.leave(room.code); delete socketRoom[targetId]; }
          emitRoomState(room);
      }
  });

  socket.on('updateSettings', (data) => {
    const room = getRoom(socket.id);
    if(!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if(data.impostors) room.impostors = Math.min(4, Math.max(1, parseInt(data.impostors))); 
    if(data.maxPlayers) room.maxPlayers = Math.min(15, Math.max(3, parseInt(data.maxPlayers)));
    if(data.voteTime) room.config.voteTime = parseInt(data.voteTime) * 1000;
    emitRoomState(room);
  });

  socket.on('startRound', () => {
    const room = getRoom(socket.id); 
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.length < 3) return; 
    
    clearRoomTimer(room);
    room.players.forEach(p => p.isDead = false); room.votes = {}; room.spoken = {}; room.clues = []; room.introReady = []; room.impostorNames = []; room.roles = {};

    const shuffled = shuffle([...room.players]); room.players = shuffled;
    const activeCount = room.players.length;
    const actualImpostors = Math.min(room.impostors, Math.max(1, activeCount - 1));

    const possibleImpostorIndices = [];
    for(let i = 0; i < activeCount; i++) possibleImpostorIndices.push(i);
    const shuffledIndices = shuffle(possibleImpostorIndices);
    const impostorIndices = shuffledIndices.slice(0, actualImpostors);

    const impostorIds = [];
    room.players.forEach((p, index) => { 
        if(impostorIndices.includes(index)) {
            room.roles[p.id] = 'impostor';
            impostorIds.push(p);
            room.impostorNames.push(p.name);
        } else {
            room.roles[p.id] = 'crew';
        }
    });

    const selectedCat = (room.categories.length ? room.categories : ['lugares'])[Math.floor(Math.random() * room.categories.length)];
    const pool = WORD_DB[selectedCat] || WORD_DB['lugares'];
    room.secretWord = pool[Math.floor(Math.random() * pool.length)];
    room.secretCategory = selectedCat;
    
    room.phase = 'word'; room.timerText = '15';
    const catName = getCategoryName(selectedCat);
    
    room.players.forEach(p => {
      const isImp = room.roles[p.id] === 'impostor';
      const partners = impostorIds.filter(imp => imp.id !== p.id).map(imp => imp.name);
      io.to(p.id).emit('privateRole', { role: isImp ? 'IMPOSTOR' : 'TRIPULANTE', word: isImp ? '???' : room.secretWord, hint: isImp ? 'Finge saber.', category: catName, partners: isImp ? partners : [] });
    });
    emitRoomState(room);
    startTimer(room, 15, (r) => { r.phase = 'turn'; r.turnIndex = -1; nextTurn(r); });
  });

  socket.on('skipIntro', () => {
      const room = getRoom(socket.id);
      if(!room || room.phase !== 'word') return;
      if(!room.introReady.includes(socket.id)) room.introReady.push(socket.id);
      const living = room.players.filter(p => !p.disconnected);
      if(room.introReady.length >= living.length) {
          clearRoomTimer(room);
          room.phase = 'turn'; room.turnIndex = -1; nextTurn(room);
      } else { emitRoomState(room); }
  });

  socket.on('submitClue', (data) => {
      const room = getRoom(socket.id);
      if (!room || room.phase !== 'turn' || room.currentTurnId !== socket.id) return;
      const player = room.players.find(p => p.id === socket.id);
      if(player && data.text) {
          room.clues.push({ name: player.name, color: player.color, text: data.text.trim().substring(0, 20) });
          clearRoomTimer(room); avanzarDesdeTurno(room);
      }
  });

  socket.on('submitVote', (data) => {
    const room = getRoom(socket.id); 
    if (!room || room.phase !== 'vote') return;
    const voter = room.players.find(p => p.id === socket.id); if (!voter || voter.isDead) return;
    room.votes[socket.id] = data.targetId; emitRoomState(room);
    const living = room.players.filter(p => !p.isDead && !p.disconnected).length;
    if (Object.keys(room.votes).length >= living) finishVoting(room, 'Votación finalizada');
  });

  socket.on('endTurnEarly', () => {
    const room = getRoom(socket.id); if (!room || room.phase !== 'turn' || room.currentTurnId !== socket.id) return;
    clearRoomTimer(room); avanzarDesdeTurno(room);
  });

  socket.on('cancelRound', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id) return; 
      resetToLobby(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.id); if (!room) return;
    const player = room.players.find(p => p.id === socket.id); if (!player) return;
    player.disconnected = true; 
    
    if (room.hostId === player.id) {
        const active = room.players.find(p => !p.disconnected && p.id !== socket.id);
        if(active) { room.hostId = active.id; emitRoomState(room); }
    }

    const activePlayers = room.players.filter(p => !p.disconnected).length;
    const timeoutDuration = (activePlayers === 0 && room.phase === 'lobby') ? 1000 : 60000;

    player.disconnectTimeout = setTimeout(() => {
        if (!rooms[room.code]) return;
        const idx = room.players.indexOf(player);
        if (idx > -1) {
            room.players.splice(idx, 1); 
            if (room.players.length === 0) {
                 clearRoomTimer(room);
                 delete rooms[room.code];
                 if (room.discordChannelId && discordClient) { try { discordClient.channels.fetch(room.discordChannelId).then(c => c?.delete()); } catch(e){} }
            } else { emitRoomState(room); }
        }
    }, timeoutDuration); 
    
    delete socketRoom[socket.id]; emitRoomState(room);
  });
});

function getCategoryName(id) {
    const map = { lugares:'Lugares', comidas:'Comidas', objetos:'Objetos', animales:'Animales', profesiones:'Profesiones', deportes:'Deportes', tecnologia:'Tecnología', fantasia:'Fantasía' };
    return map[id] || 'General';
}

function nextTurn(room) {
  clearRoomTimer(room);
  const living = room.players.map((p, i) => ({p, i})).filter(o => !o.p.isDead && !o.p.disconnected);
  if (living.length < 3) return finishVoting(room, 'No quedan suficientes jugadores');
  let nextIdx = 0;
  if (room.turnIndex !== -1) {
    const currentPos = living.findIndex(o => o.i === room.turnIndex);
    nextIdx = (currentPos + 1) % living.length;
  }
  if(!living[nextIdx]) { finishVoting(room, 'Error de turno'); return; }
  room.turnIndex = living[nextIdx].i; room.currentTurnId = room.players[room.turnIndex].id;
  room.phase = 'turn'; emitRoomState(room);
  startTimer(room, room.config.turnTime / 1000, (r) => avanzarDesdeTurno(r));
}

function avanzarDesdeTurno(room) {
  if (room.currentTurnId) room.spoken[room.currentTurnId] = true;
  const pending = room.players.filter(p => !p.isDead && !p.disconnected && !room.spoken[p.id]);
  if (pending.length > 0) nextTurn(room);
  else {
    room.phase = 'vote'; room.votes = {}; emitRoomState(room);
    startTimer(room, room.config.voteTime / 1000, (r) => finishVoting(r, 'Tiempo agotado'));
  }
}

function finishVoting(room, reason) {
  clearRoomTimer(room); room.phase = 'result';
  const counts = {}; let maxV = 0;
  Object.values(room.votes).forEach(id => { if(id) { counts[id] = (counts[id]||0)+1; if(counts[id]>maxV) maxV=counts[id]; }});
  const candidates = Object.keys(counts).filter(id => counts[id] === maxV);
  let elimId = (candidates.length === 1 && candidates[0] !== 'skip') ? candidates[0] : null;
  let result = 'continue'; let resReason = reason;
  if (elimId) {
    const victim = room.players.find(p => p.id === elimId);
    if(victim) {
        victim.isDead = true;
        if (room.roles[elimId] === 'impostor') { resReason = `¡${victim.name} era un Impostor!`; } else { resReason = `${victim.name} era Inocente.`; }
        result = 'ejected'; 
    }
  } else { resReason = "Nadie fue expulsado (Empate o Skip)."; result = 'tie'; }

  const impsAlive = room.players.filter(p => !p.isDead && !p.disconnected && room.roles[p.id] === 'impostor').length;
  const crewAlive = room.players.filter(p => !p.isDead && !p.disconnected && room.roles[p.id] === 'crew').length;

  if (impsAlive === 0) { result = 'crew'; resReason = "¡TODOS los impostores eliminados!"; } 
  else if (impsAlive >= crewAlive) { result = 'impostor'; resReason = "¡Impostores dominan la nave (Mayoría)!"; } 
  else if (crewAlive + impsAlive < 3) { result = 'impostor'; resReason = "¡Solo quedan 2! Impostor gana."; }

  const finalImpostors = room.impostorNames || [];
  io.to(room.code).emit('roundResult', { result, secretWord: room.secretWord, reason: resReason, impostors: finalImpostors });
  
  setTimeout(() => {
    if (!rooms[room.code]) return;
    clearRoomTimer(room);
    if (result === 'crew' || result === 'impostor') { resetToLobby(room); } 
    else {
        room.votes = {}; room.spoken = {}; 
        const living = room.players.filter(p => !p.isDead && !p.disconnected);
        if (living.length > 0) {
            const nextStartPlayer = living[Math.floor(Math.random() * living.length)];
            room.turnIndex = room.players.findIndex(p => p.id === nextStartPlayer.id);
            room.currentTurnId = nextStartPlayer.id;
            room.phase = 'turn'; emitRoomState(room);
            startTimer(room, room.config.turnTime / 1000, (r) => avanzarDesdeTurno(r));
        } else resetToLobby(room);
    }
  }, 10000); 
}

function resetToLobby(room) { 
    clearRoomTimer(room); room.phase = 'lobby'; room.timerText = '--'; room.votes = {}; room.spoken = {}; room.turnIndex = -1; 
    room.currentTurnId = null; room.clues = []; room.introReady = []; room.impostorNames = []; room.roles = {}; emitRoomState(room); 
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server 2.7 en puerto ${PORT}`));