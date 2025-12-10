require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const path = require('path');

// Colores únicos para jugadores (15 máximo)
const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316',
  '#a855f7', '#ec4899', '#0ea5e9', '#22d3ee', '#4ade80',
  '#facc15', '#fb7185', '#8b5cf6', '#14b8a6', '#64748b'
];

// ----------- DISCORD ----------- //
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CATEGORY_ID = process.env.DISCORD_CATEGORY_ID;

let discordClient = null;
let discordReady = false;

if (DISCORD_TOKEN && DISCORD_GUILD_ID) {
  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  // clientReady para evitar el warning deprecado
  discordClient.once('clientReady', () => {
    console.log(`✅ Bot de Discord conectado como ${discordClient.user.tag}`);
    discordReady = true;
  });

  discordClient.login(DISCORD_TOKEN).catch(err => {
    console.error('❌ Error al iniciar sesión en Discord:', err);
  });
} else {
  console.log('⚠️ Discord desactivado (faltan DISCORD_TOKEN o DISCORD_GUILD_ID)');
}

async function createDiscordChannelForRoom(code) {
  if (!discordClient || !discordReady || !DISCORD_GUILD_ID) return null;

  try {
    const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);

    const channel = await guild.channels.create({
      name: `sala-${code}`,
      type: ChannelType.GuildVoice,
      parent: DISCORD_CATEGORY_ID || null,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
        }
      ]
    });

    const url = `https://discord.com/channels/${guild.id}/${channel.id}`;
    return { url, channelId: channel.id };
  } catch (err) {
    console.error('❌ Error creando canal de Discord para la sala', code, err);
    return null;
  }
}

// ----------- PALABRAS / CATEGORÍAS ----------- //
const WORD_DB = {
  lugares: ['CINE', 'PLAYA', 'HOSPITAL', 'ESCUELA', 'AEROPUERTO', 'RESTAURANTE', 'GIMNASIO', 'PARQUE', 'MUSEO', 'SUPERMERCADO', 'PLAZA', 'ESTADIO', 'TEATRO', 'OFICINA', 'BIBLIOTECA', 'BANCO', 'HOTEL', 'DISCOTECA', 'ESTACIÓN DE TREN', 'GRANJA', 'PISCINA', 'FÁBRICA', 'ZOO', 'IGLESIA', 'MONTE', 'RIO', 'LAGO', 'DESIERTO', 'SUBMARINO', 'NAVE ESPACIAL', 'CUEVA', 'VOLCÁN', 'ISLA DESIERTA'],
  comidas: ['PIZZA', 'HAMBURGUESA', 'SUSHI', 'PASTA', 'ENSALADA', 'SOPA', 'EMPANADAS', 'ASADO', 'TACO', 'HELADO', 'CHOCOLATE', 'SÁNDWICH', 'MILANESA', 'ARROZ', 'PAELLA', 'TARTA', 'PANQUEQUES', 'HUEVO FRITO', 'POLLO ASADO', 'BIFE', 'EMPANADA ARABE'],
  objetos: ['CELULAR', 'LÁPIZ', 'LIBRO', 'SILLA', 'MESA', 'RELOJ', 'AURICULARES', 'LÁMPARA', 'TECLADO', 'MOUSE', 'CONTROL REMOTO', 'BICICLETA', 'AUTO', 'LAVARROPAS', 'HELADERA', 'TELEVISOR', 'MICRÓFONO', 'CÁMARA', 'CUADERNO', 'MOCHILA'],
  animales: ['PERRO', 'GATO', 'LEÓN', 'ELEFANTE', 'TIGRE', 'CABALLO', 'VACA', 'OVEJA', 'POLLO', 'CERDO', 'MONO', 'DELFIN', 'TIBURÓN', 'PINGÜINO', 'ÁGUILA', 'BUHO', 'ZORRO', 'LOBO'],
  profesiones: ['MÉDICO', 'ABOGADO', 'INGENIERO', 'DOCENTE', 'POLICÍA', 'CHEF', 'MECÁNICO', 'ELECTRICISTA', 'PROGRAMADOR', 'DISEÑADOR GRÁFICO', 'ARQUITECTO', 'ENFERMERO', 'PILOTO', 'CAMARERO'],
  deportes: ['FÚTBOL', 'BÁSQUET', 'TENIS', 'NATACIÓN', 'CICLISMO', 'RUGBY', 'HANDBALL', 'VOLEY', 'PATÍN', 'BOXEO', 'JUDO', 'SKATE'],
  tecnologia: ['COMPUTADORA', 'TABLET', 'DRON', 'CONSOLA', 'IMPRESORA', 'ROBOT', 'SERVIDOR', 'SATÉLITE', 'AURICULARES INALÁMBRICOS', 'SMARTWATCH', 'TECLADO MECÁNICO'],
  fantasia: ['DRAGÓN', 'HADA', 'BRUJO', 'ELFO', 'VAMPIRO', 'HOMBRE LOBO', 'UNICORNIO', 'FÉNIX', 'OGRO', 'GIGANTE', 'DUENDE']
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function pickWord(categories) {
  const pool = [];
  (categories || []).forEach(cat => {
    if (WORD_DB[cat]) pool.push(...WORD_DB[cat]);
  });
  if (pool.length === 0) pool.push(...WORD_DB.lugares);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ----------- EXPRESS / SOCKET.IO ----------- //
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const socketRoom = {};

// timers por sala (para poder cortar turno/voto)
function clearRoomTimer(room) {
  if (room._timer) {
    clearInterval(room._timer);
    room._timer = null;
  }
}

function startTimer(room, seconds, onEnd) {
  clearRoomTimer(room);
  room.remaining = seconds;
  room.timerText = `${seconds}s`;
  emitRoomState(room);

  room._timer = setInterval(() => {
    room.remaining -= 1;
    if (room.remaining <= 0) {
      clearRoomTimer(room);
      room.timerText = '--';
      emitRoomState(room);
      if (onEnd) onEnd(room);
    } else {
      room.timerText = `${room.remaining}s`;
      emitRoomState(room);
    }
  }, 1000);
}

function getRoomOfSocket(id) {
  const code = socketRoom[id];
  if (code) return rooms[code];
  return null;
}

function assignColor(room) {
  const used = new Set((room.players || []).map(p => p.color));
  for (const c of PLAYER_COLORS) {
    if (!used.has(c)) return c;
  }
  // por si acaso, repetir alguno
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    impostors: room.impostors,
    categories: room.categories,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isDead: p.isDead
    })),
    currentTurnId: room.currentTurnId || null,
    timerText: room.timerText || '--',
    votes: room.votes || {},
    discordLink: room.discordLink || null,
    groupMode: room.groupMode || false
  };
}

function emitRoomState(room) {
  if (!room) return;
  io.to(room.code).emit('roomState', serializeRoom(room));
}

// ----------- SOCKET.IO LÓGICA ----------- //
io.on('connection', (socket) => {

  // Crear sala
  socket.on('createRoom', async (data, cb) => {
    const code = generateCode();

    // Jugadores: 3 a 15
    let maxP = parseInt(data.maxPlayers) || 10;
    maxP = Math.min(15, Math.max(3, maxP));

    // Impostores: 1 a 4 y menos que jugadores
    let requestedImpostors = parseInt(data.impostors) || 2;
    let impostors = Math.min(4, Math.max(1, requestedImpostors));
    if (impostors >= maxP) impostors = Math.max(1, maxP - 1);

    const groupMode = !!data.groupMode; // true = modo grupal sin Discord

    let discordLink = null;
    let discordChannelId = null;

    if (!groupMode && discordClient && discordReady) {
      const discordInfo = await createDiscordChannelForRoom(code);
      if (discordInfo) {
        discordLink = discordInfo.url;
        discordChannelId = discordInfo.channelId;
      }
    }

    const room = {
      code,
      hostId: socket.id,
      maxPlayers: maxP,
      impostors,
      categories: data.categories || [],
      config: {
        turnTime: (parseInt(data.turnTime) || 15) * 1000,
        voteTime: (parseInt(data.voteTime) || 120) * 1000
      },
      players: [{
        id: socket.id,
        name: data.name || 'Host',
        color: PLAYER_COLORS[0],
        isDead: false
      }],
      phase: 'lobby',
      turnIndex: -1,
      currentTurnId: null,
      roles: {},
      spoken: {},
      votes: {},
      secretWord: null,
      discordLink,
      discordChannelId,
      groupMode,
      _timer: null,
      remaining: 0,
      timerText: '--'
    };

    rooms[code] = room;
    socketRoom[socket.id] = code;
    socket.join(code);

    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true, discordLink: room.discordLink });
    emitRoomState(room);
  });

  // Unirse a sala
  socket.on('joinRoom', (data, cb) => {
    const code = (data.roomCode || '').trim().toUpperCase();
    const room = rooms[code];
    if (!room) return cb({ ok: false, error: 'Sala no existe' });

    if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Sala llena' });

    const name = (data.name || '').trim();
    if (!name) return cb({ ok: false, error: 'Nombre inválido' });

    if (room.players.some(p => p.name.toUpperCase() === name.toUpperCase())) {
      return cb({ ok: false, error: 'Nombre en uso' });
    }

    socket.join(code);
    socketRoom[socket.id] = code;

    room.players.push({
      id: socket.id,
      name,
      color: assignColor(room),
      isDead: false
    });
    room.spoken[socket.id] = false;

    cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: false, discordLink: room.discordLink });
    emitRoomState(room);
  });

  // Iniciar ronda
  socket.on('startRound', () => {
    const room = getRoomOfSocket(socket.id);
    if (!room || room.hostId !== socket.id) return;

    clearRoomTimer(room);

    room.players.forEach(p => p.isDead = false);
    room.votes = {};
    room.spoken = {};
    room.turnIndex = -1;
    room.currentTurnId = null;

    const allPlayers = [...room.players];
    const shuffled = shuffleArray(allPlayers);
    const impIds = shuffled.slice(0, room.impostors).map(p => p.id);

    room.roles = {};
    room.players.forEach(p => {
      room.roles[p.id] = impIds.includes(p.id) ? 'impostor' : 'crew';
    });

    room.secretWord = pickWord(room.categories);
    room.phase = 'word';
    room.timerText = '--';

    // Enviar info privada a cada jugador
    room.players.forEach(p => {
      const role = room.roles[p.id];
      const payload = {
        myRole: role === 'impostor' ? 'IMPOSTOR' : 'TRIPULANTE',
        myWord: role === 'impostor' ? '???' : room.secretWord,
        myHint: role === 'impostor'
          ? 'Finge que conoces la palabra. Escucha a los demás y adáptate.'
          : 'Da una pista relacionada sin decir la palabra exacta.'
      };
      io.to(p.id).emit('roomState', { ...serializeRoom(room), ...payload });
    });

    emitRoomState(room);

    // Tras unos segundos, pasamos a turnos
    setTimeout(() => {
      if (!rooms[room.code]) return;
      room.phase = 'turn';
      room.turnIndex = -1;
      room.spoken = {};
      room.currentTurnId = null;
      nextTurn(room);
    }, 6000);
  });

  // Voto (incluye skip con targetId === "SKIP")
  socket.on('submitVote', (data) => {
    const room = getRoomOfSocket(socket.id);
    if (!room || room.phase !== 'vote') return;

    room.votes[socket.id] = data.targetId;
    emitRoomState(room);

    const living = room.players.filter(p => !p.isDead);
    const livingIds = living.map(p => p.id);

    const allVoted = livingIds.every(id => room.votes[id] !== undefined);
    if (allVoted) {
      finishVoting(room, 'Todos votaron');
    }
  });

  // Fin de turno anticipado por el jugador de turno
  socket.on('endTurnEarly', () => {
    const room = getRoomOfSocket(socket.id);
    if (!room || room.phase !== 'turn') return;
    if (room.currentTurnId !== socket.id) return;

    clearRoomTimer(room);
    avanzarDesdeTurno(room);
  });

  // Desconexión
  socket.on('disconnect', async () => {
    const room = getRoomOfSocket(socket.id);
    if (room) {
      room.players = room.players.filter(p => p.id !== socket.id);
      delete socketRoom[socket.id];

      if (room.players.length === 0) {
        clearRoomTimer(room);

        if (room.discordChannelId && discordClient && discordReady && DISCORD_GUILD_ID) {
          try {
            const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);
            const channel = await guild.channels.fetch(room.discordChannelId);
            if (channel) {
              await channel.delete(`Sala ${room.code} vacía`);
            }
          } catch (err) {
            console.error('❌ Error eliminando canal de Discord para la sala', room.code, err);
          }
        }

        delete rooms[room.code];
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
        }
        emitRoomState(room);
      }
    }
  });
});

// ----------- TURNOS ----------- //
function nextTurn(room) {
  clearRoomTimer(room);

  const livingIndices = room.players
    .map((p, i) => ({ p, i }))
    .filter(obj => !obj.p.isDead)
    .map(obj => obj.i);

  if (livingIndices.length === 0) return;

  let nextIndex;
  if (room.turnIndex === -1) {
    // Primer turno: podemos elegir al azar o el primero
    nextIndex = livingIndices[0];
  } else {
    const pos = livingIndices.indexOf(room.turnIndex);
    const nextPos = (pos + 1) % livingIndices.length;
    nextIndex = livingIndices[nextPos];
  }

  room.turnIndex = nextIndex;
  room.currentTurnId = room.players[nextIndex].id;
  room.spoken[room.currentTurnId] = false;
  room.phase = 'turn';
  room.timerText = '--';

  emitRoomState(room);

  const seconds = Math.floor(room.config.turnTime / 1000);
  startTimer(room, seconds, (r) => {
    avanzarDesdeTurno(r);
  });
}

function avanzarDesdeTurno(room) {
  // Marca al jugador de turno como ya hablado
  if (room.currentTurnId) {
    room.spoken[room.currentTurnId] = true;
  }

  const alive = room.players.filter(p => !p.isDead);
  const pendientes = alive.filter(p => !room.spoken[p.id]);

  if (pendientes.length > 0) {
    nextTurn(room);
  } else {
    // Pasar a votación
    room.phase = 'vote';
    room.votes = {};
    emitRoomState(room);

    const seconds = Math.floor(room.config.voteTime / 1000);
    startTimer(room, seconds, (r) => {
      finishVoting(r, 'Se acabó el tiempo de votar');
    });
  }
}

// ----------- VOTACIÓN ----------- //
function finishVoting(room, reason) {
  clearRoomTimer(room);
  room.phase = 'result';
  room.timerText = '--';

  const counts = {};
  Object.values(room.votes || {}).forEach(id => {
    if (id === undefined || id === null) return;
    counts[id] = (counts[id] || 0) + 1;
  });

  let eliminatedId = null;
  let maxVotes = 0;
  let topKeys = [];

  Object.entries(counts).forEach(([id, c]) => {
    if (c > maxVotes) {
      maxVotes = c;
      topKeys = [id];
    } else if (c === maxVotes) {
      topKeys.push(id);
    }
  });

  // Reglas de eliminación:
  // - Si no hay votos -> nadie eliminado
  // - Si hay empate -> nadie eliminado
  // - Si gana "SKIP" -> nadie eliminado
  if (maxVotes > 0 && topKeys.length === 1 && topKeys[0] !== 'SKIP') {
    eliminatedId = topKeys[0];
  }

  if (eliminatedId) {
    const pl = room.players.find(p => p.id === eliminatedId);
    if (pl) pl.isDead = true;
  }

  const impostorsAlive = room.players.filter(p => !p.isDead && room.roles[p.id] === 'impostor');
  const crewAlive = room.players.filter(p => !p.isDead && room.roles[p.id] === 'crew');

  let result = 'none';
  if (impostorsAlive.length === 0) result = 'crew';
  else if (impostorsAlive.length >= crewAlive.length) result = 'impostor';

  const winners = room.players
    .filter(p => room.roles[p.id] === (result === 'crew' ? 'crew' : 'impostor'))
    .map(p => p.name);

  const imps = room.players
    .filter(p => room.roles[p.id] === 'impostor')
    .map(p => p.name);

  io.to(room.code).emit('roundResult', {
    result,
    winners,
    impostors: imps,
    secretWord: room.secretWord,
    reason
  });

  // Después de unos segundos, volver a lobby
  setTimeout(() => {
    if (!rooms[room.code]) return;
    clearRoomTimer(room);
    room.phase = 'lobby';
    room.timerText = '--';
    room.votes = {};
    room.spoken = {};
    room.turnIndex = -1;
    room.currentTurnId = null;
    emitRoomState(room);
  }, 8000);
}

// ----------- ARRANQUE SERVIDOR ----------- //
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor listo ${PORT}`);
});
