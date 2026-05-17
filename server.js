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
const MIN_APP_VERSION = 22;

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

// DATOS
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#0ea5e9', '#22d3ee', '#4ade80', '#facc15', '#fb7185', '#8b5cf6', '#14b8a6', '#64748b'];
const WORD_DB = {
  lugares: ['CINE', 'PLAYA', 'HOSPITAL', 'ESCUELA', 'UNIVERSIDAD', 'AEROPUERTO', 'ESTACIÓN DE TREN', 'METRO', 'RESTAURANTE', 'CAFETERÍA', 'GIMNASIO', 'PARQUE', 'MUSEO', 'GALERÍA DE ARTE', 'SUPERMERCADO', 'MERCADO', 'PLAZA', 'CENTRO COMERCIAL', 'ESTADIO', 'TEATRO', 'ÓPERA', 'OFICINA', 'COWORKING', 'BIBLIOTECA', 'BANCO', 'HOTEL', 'MOTEL', 'DISCOTECA', 'CLUB NOCTURNO', 'GRANJA', 'VIÑEDO', 'PISCINA', 'FÁBRICA', 'ALMACÉN', 'ZOO', 'ACUARIO', 'PLANETARIO', 'IGLESIA', 'TEMPLO', 'MEZQUITA', 'SINAGOGA', 'MONTE', 'COLINA', 'RÍO', 'LAGO', 'CASCADA', 'DESIERTO', 'SUBMARINO', 'NAVE ESPACIAL', 'ESTACIÓN ESPACIAL', 'CUEVA', 'VOLCÁN', 'ISLA', 'ISLA DESIERTA', 'CEMENTERIO', 'LABORATORIO', 'CÁRCEL', 'COMISARÍA', 'CASTILLO', 'FORTALEZA', 'BOSQUE', 'SELVA', 'GARAJE', 'ÁTICO', 'SÓTANO', 'CASINO', 'CRUCERO', 'FERRY', 'SPA', 'BARBERÍA', 'PELUQUERÍA', 'SALÓN DE BELLEZA', 'FARMACIA', 'CLÍNICA', 'PUENTE', 'FARO', 'PUERTO', 'MUELLE', 'AERÓDROMO', 'ESTUDIO DE GRABACIÓN', 'SALA DE JUEGOS', 'SKATEPARK', 'GIMNASIO DE ESCALADA', 'OBSERVATORIO', 'TORRE', 'CAMPING'],
  comidas: ['PIZZA', 'HAMBURGUESA', 'HOT DOG', 'SUSHI', 'RAMEN', 'PASTA', 'LASAÑA', 'RAVIOLI', 'ENSALADA', 'SOPA', 'CREMA', 'TACO', 'BURRITO', 'FAJITA', 'NACHOS', 'QUESADILLA', 'AREPA', 'HELADO', 'SORBETE', 'CHOCOLATE', 'BOMBÓN', 'SÁNDWICH', 'PANINI', 'BAGUETTE', 'CROISSANT', 'ARROZ', 'PAELLA', 'RISOTTO', 'CURRY', 'TARTA', 'PASTEL', 'CHEESECAKE', 'PANQUEQUES', 'WAFFLES', 'HUEVO FRITO', 'REVUELTO', 'OMELET', 'POLLO ASADO', 'POLLO FRITO', 'PAVO', 'PESCADO', 'SALMÓN', 'ATÚN', 'CAMARONES', 'CALAMAR', 'FILETE', 'CHULETA', 'COSTILLAS', 'BARBACOA', 'KEBAB', 'GYROS', 'CROQUETA', 'EMPANADA', 'PALOMITAS', 'PAPAS FRITAS', 'CHIPS', 'TORTILLA DE PATATA', 'TORTILLA', 'CEREAL', 'GALLETAS', 'MANDARINA', 'NARANJA', 'LIMÓN', 'LIMA', 'BANANA', 'PLÁTANO', 'MANZANA', 'PERA', 'UVAS', 'FRESA', 'ARÁNDANOS', 'KIWI', 'MANGO', 'PIÑA', 'SANDÍA', 'MELÓN', 'QUESO', 'YOGUR', 'MANTEQUILLA', 'MERMELADA', 'MIEL', 'NUECES', 'ALMENDRAS', 'CAFÉ', 'TÉ', 'CHOCOLATE CALIENTE', 'ZUMO', 'BATIDO', 'SMOOTHIE', 'REFRESCO', 'CERVEZA', 'VINO', 'DONUT', 'MAGDALENA', 'MUFFIN', 'BROWNIE', 'ESTOFADO', 'LENTEJAS', 'CHILI', 'FIDEOS', 'ÑOQUIS', 'COUSCOUS', 'HUMMUS', 'SALSA', 'MOUSSE'],
  objetos: ['CELULAR', 'SMARTPHONE', 'TABLET', 'LÁPIZ', 'BOLÍGRAFO', 'LIBRO', 'REVISTA', 'SILLA', 'SOFÁ', 'MESA', 'ESCRITORIO', 'RELOJ', 'DESPERTADOR', 'AURICULARES', 'ALTAVOZ', 'LÁMPARA', 'VELA', 'TECLADO', 'MOUSE', 'RATÓN', 'CONTROL REMOTO', 'MANDO', 'BICICLETA', 'PATINETE', 'MONOPATÍN', 'AUTO', 'COCHE', 'MOTO', 'LAVADORA', 'SECADORA', 'HELADERA', 'NEVERA', 'HORNO', 'MICROONDAS', 'LICUADORA', 'CAFETERA', 'TELEVISOR', 'MICRÓFONO', 'CÁMARA', 'TRÍPODE', 'CUADERNO', 'BLOC', 'MOCHILA', 'MALETA', 'LLAVES', 'BILLETERA', 'CARTERA', 'GAFAS', 'LENTES', 'GAFAS DE SOL', 'PARAGUAS', 'ZAPATILLAS', 'BOTAS', 'ALMOHADA', 'MANTA', 'CEPILLO DE DIENTES', 'SECADOR DE PELO', 'PEINE', 'ESPEJO', 'GUITARRA', 'PIANO', 'TAMBOR', 'PELOTA', 'RAQUETA', 'MARTILLO', 'DESTORNILLADOR', 'TALADRO', 'SIERRA', 'CAJA DE HERRAMIENTAS', 'CINTA MÉTRICA', 'CORDÓN', 'CARGADOR', 'CABLE USB', 'BATERÍA PORTÁTIL'],
  animales: ['PERRO', 'GATO', 'LEÓN', 'LEONA', 'ELEFANTE', 'TIGRE', 'JAGUAR', 'PANTERA', 'CABALLO', 'VACA', 'TORO', 'OVEJA', 'CABRA', 'CERDO', 'POLLO', 'GALLO', 'PAVO', 'PATO', 'GANSO', 'MONO', 'GORILA', 'CHIMPANCÉ', 'DELFIN', 'BALLENA', 'ORCA', 'TIBURÓN', 'RAYA', 'PULPO', 'CALAMAR', 'CANGREJO', 'LANGOSTA', 'PINGÜINO', 'ÁGUILA', 'HALCÓN', 'BÚHO', 'CUERVO', 'LORO', 'CANARIO', 'COLIBRÍ', 'ZORRO', 'LOBO', 'COYOTE', 'OSO', 'OSO POLAR', 'PANDA', 'JIRAFA', 'RINOCERONTE', 'HIPOPÓTAMO', 'CANGURO', 'KOALA', 'SERPIENTE', 'LAGARTO', 'IGUANA', 'CAMALEÓN', 'COCODRILO', 'TORTUGA', 'RANA', 'SALAMANDRA', 'CONEJO', 'HURÓN', 'HÁMSTER', 'COBAYO', 'PALOMA', 'GAVIOTA', 'MURCIÉLAGO', 'CIERVO', 'ALCE', 'NUTRIA', 'CASTOR'],
  profesiones: ['MÉDICO', 'ENFERMERO', 'CIRUJANO', 'DENTISTA', 'FARMACÉUTICO', 'VETERINARIO', 'ABOGADO', 'JUEZ', 'NOTARIO', 'INGENIERO', 'ARQUITECTO', 'TOPÓGRAFO', 'DOCENTE', 'PROFESOR', 'PSICÓLOGO', 'TERAPEUTA', 'POLICÍA', 'AGENTE', 'BOMBERO', 'PARAMÉDICO', 'SOLDADO', 'PILOTO', 'COPILOTO', 'AZAFATA', 'MARINERO', 'CAPITÁN', 'CHEF', 'COCINERO', 'REPOSTERO', 'CAMARERO', 'SOMMELIER', 'BARISTA', 'MECÁNICO', 'ELECTRICISTA', 'FONTANERO', 'ALBAÑIL', 'PINTOR', 'CARPINTERO', 'SOLDADOR', 'PROGRAMADOR', 'ANALISTA', 'DISEÑADOR', 'DISEÑADOR WEB', 'CIENTÍFICO', 'INVESTIGADOR', 'QUÍMICO', 'BIOLOGISTA', 'ASTRONAUTA', 'ASTRÓNOMO', 'PERIODISTA', 'FOTÓGRAFO', 'CINEASTA', 'ACTOR', 'MÚSICO', 'DJ', 'PRODUCTOR', 'ESCRITOR', 'EDITOR', 'TRADUCTOR', 'CONTADOR', 'AUDITOR', 'ECONOMISTA', 'BANQUERO', 'CORREDOR', 'AGENTE INMOBILIARIO', 'GRANJERO', 'AGRICULTOR', 'JARDINERO', 'LEÑADOR', 'PESCADOR', 'BUZO', 'MINERO', 'MODELADOR 3D', 'DETECTIVE', 'GUARDAESPALDAS', 'BIBLIOTECARIO', 'CURADOR', 'FÍSICO', 'MATEMÁTICO', 'INFLUENCER', 'STREAMER'],
  deportes: ['FÚTBOL', 'FÚTBOL AMERICANO', 'RUGBY', 'BÁSQUET', 'BÁSQUETBOL', 'TENIS', 'PÁDEL', 'BÁDMINTON', 'VOLEIBOL', 'VOLEY PLAYA', 'TENIS DE MESA', 'SQUASH', 'BÉISBOL', 'CRÍQUET', 'GOLF', 'MINI GOLF', 'HOCKEY', 'HOCKEY SOBRE HIELO', 'LACROSSE', 'CURLING', 'NATACIÓN', 'WATERPOLO', 'NATACIÓN SINCRONIZADA', 'SALTOS', 'CLAVADOS', 'SURF', 'WINDSURF', 'KITESURF', 'ESQUÍ', 'SNOWBOARD', 'PATINAJE', 'PATINAJE ARTÍSTICO', 'PATINAJE SOBRE HIELO', 'CICLISMO', 'MOUNTAIN BIKE', 'BMX', 'ATLETISMO', 'MARATÓN', 'TRIATLÓN', 'HALTEROFILIA', 'CROSSFIT', 'GIMNASIA', 'PARKOUR', 'ESCALADA', 'BOXEO', 'KICKBOXING', 'MMA', 'JUDO', 'KARATE', 'TAEKWONDO', 'ESGRIMA', 'LUCHA LIBRE', 'YOGA', 'PILATES', 'BAILAR', 'ZUMBA', 'AJEDREZ', 'DARDOS', 'BILLAR', 'BOLICHE', 'SKATEBOARD', 'ROLLER', 'PARACAIDISMO', 'PARAPENTE', 'BALONMANO'],
  tecnologia: ['COMPUTADORA', 'PC', 'PORTÁTIL', 'TABLET', 'SMARTPHONE', 'RELOJ INTELIGENTE', 'DRON', 'CONSOLA', 'MANDO DE CONSOLA', 'IMPRESORA', 'ESCÁNER', 'ROBOT', 'BRAZO ROBÓTICO', 'SERVIDOR', 'RACK', 'SATÉLITE', 'GPS', 'AURICULARES', 'AURICULARES INALÁMBRICOS', 'MICRÓFONO USB', 'WEBCAM', 'CÁMARA DIGITAL', 'CÁMARA DE ACCIÓN', 'PROYECTOR', 'PANTALLA', 'MEMORIA USB', 'DISCO DURO', 'SSD', 'ROUTER', 'MÓDEM', 'SWITCH', 'CABLE ETHERNET', 'FIBRA ÓPTICA', 'INTELIGENCIA ARTIFICIAL', 'CHATBOT', 'REALIDAD VIRTUAL', 'REALIDAD AUMENTADA', 'BLOCKCHAIN', 'CIBERSEGURIDAD', 'FIREWALL', 'VPN', 'NUBE', 'BACKUP', 'DOMÓTICA', 'ASISTENTE DE VOZ'],
  fantasia: ['DRAGÓN', 'HADA', 'HADA MADRINA', 'BRUJO', 'BRUJA', 'ELFO', 'ELFA', 'ENANO', 'ORCO', 'VAMPIRO', 'VAMPIRESA', 'HOMBRE LOBO', 'UNICORNIO', 'PEGASO', 'FÉNIX', 'QUIMERA', 'HIPOGRIFO', 'OGRO', 'TROLL', 'GIGANTE', 'DUENDE', 'GNOMO', 'SIRENA', 'TRITÓN', 'NEREIDA', 'KRAKEN', 'ZOMBIE', 'ESQUELETO VIVIENTE', 'FANTASMA', 'ESPECTRO', 'POLTERGEIST', 'ALIENÍGENA', 'OVNI', 'CIBORG', 'ANDROIDE', 'SUPERHÉROE', 'SUPERVILLANO', 'VILLANO', 'MAGO', 'HECHICERO', 'ARCHIMAGO', 'NIGROMANTE', 'PALADÍN', 'CABALLERO', 'GUERRERO', 'PÍCARO', 'RANGER', 'CLÉRIGO', 'BÁRBARO', 'BARDO', 'GOLEM', 'ELEMENTAL', 'GENIO', 'DJINN', 'MINOTAURO', 'MEDUSA', 'GORGONA', 'ESFINGE', 'MOMIA', 'LICH', 'DEMONIO', 'ÁNGEL', 'ARCÁNGEL']
};

function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function generateCode() { let res = ''; const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (let i = 0; i < 6; i++) res += chars[Math.floor(Math.random() * chars.length)]; return res; }
function assignColor(room) { const used = new Set(room.players.map(p => p.color)); return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0]; }
function livingPlayerCount(room) { return room.players.filter(p => !p.isDead && !p.disconnected).length; }
function livingVotesCast(room) {
  let n = 0;
  for (const id of Object.keys(room.votes || {})) {
    const p = room.players.find(x => x.id === id);
    if (p && !p.isDead && !p.disconnected) n++;
  }
  return n;
}
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
  const votesPending = room.phase === 'vote' ? Math.max(0, livingPlayerCount(room) - livingVotesCast(room)) : 0;
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, mode: room.mode,
    config: room.config, maxPlayers: room.maxPlayers,
    players: room.players.map(p => ({
        id: p.id, userId: p.userId, name: p.name, color: p.color, isDead: p.isDead, disconnected: p.disconnected
    })),
    currentTurnId: room.currentTurnId, timerText: room.timerText, remaining: room.remaining,
    votes: room.votes, impostors: room.impostors, discordLink: room.discordLink,
    clues: room.clues || [], introReady: room.introReady || [], impostorNames: room.impostorNames || [],
    votesPending
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
              players: r.players.filter(p => !p.disconnected).length,
              max: r.maxPlayers,
              mode: r.mode
          }));
      socket.emit('publicRoomsList', publicRooms);
  });

  socket.on('createRoom', async (data, cb) => {
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

        if (room.votes && Object.prototype.hasOwnProperty.call(room.votes, oldSocketId)) {
          room.votes[socket.id] = room.votes[oldSocketId];
          delete room.votes[oldSocketId];
        }
        if (room.spoken && room.spoken[oldSocketId]) {
          room.spoken[socket.id] = room.spoken[oldSocketId];
          delete room.spoken[oldSocketId];
        }
        const irIdx = room.introReady ? room.introReady.indexOf(oldSocketId) : -1;
        if (irIdx > -1) room.introReady[irIdx] = socket.id;

        let myRoleData = null;
        if (room.phase !== 'lobby' && room.roles[socket.id]) {
            myRoleData = buildPrivateRolePayload(room, socket.id);
        } else if (room.phase !== 'lobby' && room.roles[oldSocketId]) {
            room.roles[socket.id] = room.roles[oldSocketId];
            delete room.roles[oldSocketId];
            myRoleData = buildPrivateRolePayload(room, socket.id);
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

    room.players.forEach((p, index) => { 
        if(impostorIndices.includes(index)) {
            room.roles[p.id] = 'impostor';
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
    
    room.players.forEach(p => {
      io.to(p.id).emit('privateRole', buildPrivateRolePayload(room, p.id));
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
    if (livingVotesCast(room) >= livingPlayerCount(room)) finishVoting(room, 'Votación finalizada');
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

function buildPrivateRolePayload(room, playerId) {
    const isImp = room.roles[playerId] === 'impostor';
    const catName = getCategoryName(room.secretCategory);
    const partners = room.players.filter(p => room.roles[p.id] === 'impostor' && p.id !== playerId).map(p => p.name);
    return {
        role: isImp ? 'IMPOSTOR' : 'TRIPULANTE',
        word: isImp ? '???' : room.secretWord,
        hint: isImp ? 'Finge saber.' : 'Escribe una pista.',
        category: catName,
        partners: isImp ? partners : []
    };
}

function nextTurn(room) {
  clearRoomTimer(room);
  const living = room.players
    .map((p, i) => ({ p, i }))
    .filter(o => !o.p.isDead && !o.p.disconnected);
  if (living.length < 3) return finishVoting(room, 'No quedan suficientes jugadores');

  const firstUnspoken = () => living.find(o => !room.spoken[o.p.id]) || null;

  let chosen = null;
  if (room.turnIndex === -1 || !room.currentTurnId) {
    chosen = firstUnspoken();
  } else {
    const currentPos = living.findIndex(o => o.p.id === room.currentTurnId);
    if (currentPos === -1) {
      chosen = firstUnspoken();
    } else {
      for (let step = 1; step <= living.length; step++) {
        const j = (currentPos + step) % living.length;
        if (!room.spoken[living[j].p.id]) {
          chosen = living[j];
          break;
        }
      }
      if (!chosen) chosen = firstUnspoken();
    }
  }

  if (!chosen) {
    room.phase = 'vote';
    room.votes = {};
    emitRoomState(room);
    startTimer(room, room.config.voteTime / 1000, (r) => finishVoting(r, 'Tiempo agotado'));
    return;
  }

  if (room.spoken[chosen.p.id]) {
    const alt = living.find(o => !room.spoken[o.p.id]);
    if (!alt) {
      room.phase = 'vote';
      room.votes = {};
      emitRoomState(room);
      startTimer(room, room.config.voteTime / 1000, (r) => finishVoting(r, 'Tiempo agotado'));
      return;
    }
    chosen = alt;
  }

  room.turnIndex = chosen.i;
  room.currentTurnId = chosen.p.id;
  room.phase = 'turn';
  emitRoomState(room);
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
httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server 2.6.2 en puerto ${PORT}`));