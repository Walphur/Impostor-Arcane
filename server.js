require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const path = require('path');

// Colores para jugadores
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#0ea5e9', '#22d3ee', '#4ade80', '#facc15', '#fb7185', '#8b5cf6', '#14b8a6', '#64748b'];

// ----------- DISCORD ----------- //
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CATEGORY_ID = process.env.DISCORD_CATEGORY_ID;
let discordClient = null; let discordReady = false;
if (DISCORD_TOKEN && DISCORD_GUILD_ID) {
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  discordClient.once('clientReady', () => { console.log(`✅ Discord: ${discordClient.user.tag}`); discordReady = true; });
  discordClient.login(DISCORD_TOKEN).catch(err => console.error('❌ Discord Error:', err));
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
  } catch (err) { console.error('❌ Discord Channel Error:', err); return null; }
}

// ----------- PALABRAS (LISTA EXTENDIDA) ----------- //
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

// ----------- SERVER ----------- //
const app = express(); const httpServer = http.createServer(app); const io = new Server(httpServer);
app.use(express.static(path.join(__dirname, 'public')));
const rooms = {}; const socketRoom = {};

function clearRoomTimer(room) { if (room._timer) { clearInterval(room._timer); room._timer = null; } }
function startTimer(room, seconds, onEnd) {
  clearRoomTimer(room); room.remaining = seconds; room.timerText = `${seconds}`; emitRoomState(room);
  room._timer = setInterval(() => {
    room.remaining--;
    if (room.remaining <= 0) { clearRoomTimer(room); room.timerText = '--'; emitRoomState(room); if (onEnd) onEnd(room); }
    else { room.timerText = `${room.remaining}`; emitRoomState(room); }
  }, 1000);
}
function getRoom(id) { const code = socketRoom[id]; return code ? rooms[code] : null; }
function assignColor(room) { const used = new Set(room.players.map(p => p.color)); return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0]; }
function serializeRoom(room) {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase,
    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, isDead: p.isDead })),
    currentTurnId: room.currentTurnId, timerText: room.timerText, remaining: room.remaining,
    votes: room.votes, impostors: room.impostors
  };
}
function emitRoomState(room) { if (room) io.to(room.code).emit('roomState', serializeRoom(room)); }

// ----------- SOCKET LÓGICA ----------- //
io.on('connection', (socket) => {
  socket.on('createRoom', async (data, cb) => {
    const code = generateCode();
    const maxP = Math.min(15, Math.max(3, parseInt(data.maxPlayers) || 10));
    const imps = Math.min(maxP - 1, Math.max(1, parseInt(data.impostors) || 2));
    let discordLink = null, discordChannelId = null;
    if (!data.groupMode && discordClient && discordReady) {
      const info = await createDiscordChannelForRoom(code);
      if (info) { discordLink = info.url; discordChannelId = info.channelId; }
    }
    rooms[code] = {
      code, hostId: socket.id, maxPlayers: maxP, impostors: imps, categories: data.categories,
      config: { turnTime: 20000, voteTime: (parseInt(data.voteTime) || 120) * 1000 },
      players: [{ id: socket.id, name: data.name || 'Host', color: assignColor({players:[]}), isDead: false }],
      phase: 'lobby', roles: {}, votes: {}, spoken: {}, discordLink, discordChannelId, timerText: '--'
    };
    socketRoom[socket.id] = code; socket.join(code);
    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true, discordLink });
    emitRoomState(rooms[code]);
  });

  socket.on('joinRoom', (data, cb) => {
    const code = (data.roomCode || '').trim().toUpperCase(); const room = rooms[code];
    if (!room) return cb({ ok: false, error: 'Sala no existe' });
    if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Sala llena' });
    if (room.phase !== 'lobby') return cb({ ok: false, error: 'Partida ya iniciada' });
    const name = (data.name || '').trim();
    if (room.players.some(p => p.name.toUpperCase() === name.toUpperCase())) return cb({ ok: false, error: 'Nombre en uso' });

    socket.join(code); socketRoom[socket.id] = code;
    room.players.push({ id: socket.id, name, color: assignColor(room), isDead: false });
    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: false, discordLink: room.discordLink });
    emitRoomState(room);
  });

  socket.on('startRound', () => {
    const room = getRoom(socket.id); if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.length < 3) return; // Mínimo 3 jugadores
    clearRoomTimer(room);
    room.players.forEach(p => p.isDead = false); room.votes = {}; room.spoken = {};
    const shuffled = shuffle([...room.players]);
    const impIds = shuffled.slice(0, room.impostors).map(p => p.id);
    room.roles = {}; room.players.forEach(p => room.roles[p.id] = impIds.includes(p.id) ? 'impostor' : 'crew');
    room.secretWord = pickWord(room.categories);
    room.phase = 'word'; room.timerText = '10';
    room.players.forEach(p => {
      const isImp = room.roles[p.id] === 'impostor';
      io.to(p.id).emit('privateRole', {
        role: isImp ? 'IMPOSTOR' : 'TRIPULANTE', word: isImp ? '???' : room.secretWord,
        hint: isImp ? 'Finge que sabes la palabra. Adáptate a las pistas.' : 'Di una pista sutil. No digas la palabra exacta.'
      });
    });
    emitRoomState(room);
    startTimer(room, 10, (r) => { r.phase = 'turn'; r.turnIndex = -1; nextTurn(r); });
  });

  socket.on('submitVote', (data) => {
    const room = getRoom(socket.id); if (!room || room.phase !== 'vote' || room.votes[socket.id]) return;
    room.votes[socket.id] = data.targetId; emitRoomState(room);
    const living = room.players.filter(p => !p.isDead).length;
    if (Object.keys(room.votes).length === living) finishVoting(room, 'Todos han votado');
  });

  socket.on('endTurnEarly', () => {
    const room = getRoom(socket.id); if (!room || room.phase !== 'turn' || room.currentTurnId !== socket.id) return;
    clearRoomTimer(room); avanzarDesdeTurno(room);
  });

  socket.on('disconnect', async () => {
    const room = getRoom(socket.id); if (room) {
      room.players = room.players.filter(p => p.id !== socket.id); delete socketRoom[socket.id];
      if (room.players.length === 0) {
        clearRoomTimer(room);
        if (room.discordChannelId && discordClient) try { (await discordClient.channels.fetch(room.discordChannelId))?.delete(); } catch(e){}
        delete rooms[room.code];
      } else {
        if (room.hostId === socket.id) room.hostId = room.players[0].id;
        emitRoomState(room);
      }
    }
  });
});

function nextTurn(room) {
  clearRoomTimer(room);
  const living = room.players.map((p, i) => ({p, i})).filter(o => !o.p.isDead);
  if (living.length === 0) return finishVoting(room, 'No quedan jugadores vivos');
  let nextIdx = 0;
  if (room.turnIndex !== -1) {
    const currentPos = living.findIndex(o => o.i === room.turnIndex);
    nextIdx = (currentPos + 1) % living.length;
  }
  room.turnIndex = living[nextIdx].i;
  room.currentTurnId = room.players[room.turnIndex].id;
  room.phase = 'turn';
  emitRoomState(room);
  startTimer(room, room.config.turnTime / 1000, (r) => avanzarDesdeTurno(r));
}

function avanzarDesdeTurno(room) {
  if (room.currentTurnId) room.spoken[room.currentTurnId] = true;
  const pending = room.players.filter(p => !p.isDead && !room.spoken[p.id]);
  if (pending.length > 0) nextTurn(room);
  else {
    room.phase = 'vote'; room.votes = {}; emitRoomState(room);
    startTimer(room, room.config.voteTime / 1000, (r) => finishVoting(r, 'Tiempo de votación agotado'));
  }
}

// LOGICA DE VICTORIA CORREGIDA
function finishVoting(room, reason) {
  clearRoomTimer(room); room.phase = 'result';
  const counts = {}; let maxV = 0;
  Object.values(room.votes).forEach(id => { if(id) { counts[id] = (counts[id]||0)+1; if(counts[id] > maxV) maxV = counts[id]; }});
  const candidates = Object.keys(counts).filter(id => counts[id] === maxV);
  let elimId = (candidates.length === 1 && candidates[0] !== 'skip') ? candidates[0] : null;

  let result = 'none', resReason = reason;
  if (elimId) {
    const victim = room.players.find(p => p.id === elimId);
    victim.isDead = true;
    if (room.roles[elimId] === 'impostor') { result = 'crew'; resReason = `¡Atraparon al impostor (${victim.name})!`; }
    else resReason = `Expulsaron a un inocente (${victim.name}).`;
  } else resReason = "Nadie fue expulsado (Empate o Skip).";

  if (result === 'none') {
    const impsAlive = room.players.filter(p => !p.isDead && room.roles[p.id] === 'impostor').length;
    const crewAlive = room.players.filter(p => !p.isDead && room.roles[p.id] === 'crew').length;
    if (impsAlive === 0) { result = 'crew'; resReason = "¡Todos los impostores eliminados!"; }
    else if (impsAlive >= crewAlive) { result = 'impostor'; resReason = "¡Los impostores dominan la nave!"; }
  }

  io.to(room.code).emit('roundResult', { result, secretWord: room.secretWord, reason: resReason, impostors: room.players.filter(p=>room.roles[p.id]==='impostor').map(p=>p.name) });
  setTimeout(() => {
    if (!rooms[room.code]) return;
    clearRoomTimer(room); room.phase = 'lobby'; room.timerText = '--'; room.votes = {}; room.spoken = {}; room.turnIndex = -1; room.currentTurnId = null; emitRoomState(room);
  }, 8000);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));