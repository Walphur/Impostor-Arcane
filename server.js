require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

// --- 1. CONFIGURACIÓN DE DISCORD ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;        
const CATEGORIA_ID = process.env.DISCORD_CATEGORY_ID; 

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

if (DISCORD_TOKEN) {
    discordClient.login(DISCORD_TOKEN)
        .then(() => console.log('✅ Bot de Discord CONECTADO y listo.'))
        .catch(err => console.error('❌ Error conectando Bot:', err.message));
} else {
    console.log('⚠️ No hay DISCORD_TOKEN configurado.');
}

// --- 2. COLORES Y PALABRAS ---
const PLAYER_COLORS = [
    '#ef4444', // Rojo
    '#3b82f6', // Azul
    '#22c55e', // Verde
    '#eab308', // Amarillo
    '#f97316', // Naranja
    '#a855f7', // Violeta
    '#ec4899', // Rosa
    '#06b6d4', // Cyan
    '#84cc16', // Lima
    '#78716c', // Marrón
    '#f43f5e', // Coral
    '#6366f1', // Indigo
    '#14b8a6', // Teal
    '#d946ef', // Fuchsia
    '#64748b'  // Gris
];

const WORDS = [
    'SAUNA', 'CEMENTERIO', 'SUBMARINO', 'ASCENSOR', 'IGLÚ', 
    'CASINO', 'PELUQUERÍA', 'CIRCO', 'ESTACIÓN ESPACIAL', 'HORMIGUERO', 
    'CINE', 'BODA', 'VESTUARIO DE GIMNASIO', 'BARCO PIRATA', 'ZOOLÓGICO',
    'SUSHI', 'PAELLA', 'TACOS', 'HELADO', 'HUEVO FRITO', 
    'CEVICHE', 'PARRILLADA', 'FONDUE', 'MEDIALUNA', 'SOPA', 
    'COCO', 'CHICLE', 'PARAGUAS', 'CEPILLO DE DIENTES', 'MICROONDAS', 
    'GUITARRA', 'INODORO', 'LAVADORA', 'ESPEJO', 'DRON', 
    'TARJETA DE CRÉDITO', 'VELA', 'ZAPATO', 'PINGÜINO', 'CANGURO', 
    'MOSQUITO', 'PULPO', 'PEREZOSO', 'CAMALEÓN', 'MURCIÉLAGO', 
    'JIRAFA', 'ABEJA', 'ASTRONAUTA', 'MIMO', 'CIRUJANO', 
    'JARDINERO', 'DETECTIVE', 'BUZO', 'ÁRBITRO', 'CAJERO', 
    'PRESIDENTE', 'FANTASMA'
];

// --- 3. FUNCIONES DE DISCORD ---
async function crearCanalDiscord(nombreSala, limiteJugadores) {
    try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error("❌ No se encontró el servidor (Guild).");
            return null;
        }

        // Crear Canal de VOZ Invisible pero accesible por link
        const canalVoz = await guild.channels.create({
            name: `Sala ${nombreSala}`,
            type: ChannelType.GuildVoice,
            parent: CATEGORIA_ID,
            userLimit: limiteJugadores || 10, // Límite dinámico según la sala
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel], // Invisible
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] // Accesible con link
                }
            ]
        });

        const invite = await canalVoz.createInvite({ maxAge: 0, maxUses: 0 });
        console.log(`✅ Canal creado: ${canalVoz.name}`);

        return { voiceId: canalVoz.id, inviteLink: invite.url };

    } catch (err) {
        console.error("Error creando canales Discord:", err);
        return null;
    }
}

async function borrarCanalDiscord(canalId) {
    if (!canalId) return;
    try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (guild) {
            const canal = guild.channels.cache.get(canalId);
            if (canal) await canal.delete();
        }
    } catch (err) {
        console.error("Error borrando canal:", err);
    }
}

// --- 4. SERVIDOR WEB ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const CLIENT_DIR = path.join(__dirname, 'public');
app.use(express.static(CLIENT_DIR));

// CONSTANTES JUEGO
const TIEMPO_TURNO = 15 * 1000;
const TIEMPO_VOTACION = 120 * 1000;

// MEMORIA
const rooms = {};
const socketRoom = {};

// --- 5. HELPERS DEL JUEGO ---
function randomWord() { return WORDS[Math.floor(Math.random() * WORDS.length)]; }

function generateCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code, attempts = 0;
    do {
        let part = '';
        for (let i = 0; i < 4; i++) part += chars[Math.floor(Math.random() * chars.length)];
        code = 'ARC-' + part;
        attempts++;
    } while (rooms[code] && attempts < 100);
    return code;
}

function getRoomOfSocket(socketId) {
    const code = socketRoom[socketId];
    return code ? rooms[code] : null;
}

// Asignar color que no esté usado
function assignColor(room) {
    const usedColors = room.players.map(p => p.color);
    const available = PLAYER_COLORS.find(c => !usedColors.includes(c));
    return available || '#ffffff'; // Fallback blanco
}

function emitRoomState(room) {
    if (!room) return;
    const now = Date.now();
    let timeLeft = 0;
    if (room.phase === 'palabras' && room.turnDeadline) {
        timeLeft = Math.max(0, Math.ceil((room.turnDeadline - now) / 1000));
    } else if (room.phase === 'votacion' && room.voteDeadline) {
        timeLeft = Math.max(0, Math.ceil((room.voteDeadline - now) / 1000));
    }

    io.to(room.code).emit('roomState', {
        roomCode: room.code,
        hostId: room.hostId,
        phase: room.phase,
        turnIndex: room.turnIndex,
        timeLeft: timeLeft,
        discordLink: room.discordLink, 
        // Enviamos lista completa con colores y estado de voto
        players: room.players.map(p => ({ 
            id: p.id, 
            name: p.name, 
            color: p.color,
            hasVoted: !!room.votes[p.id] // True si ya votó
        }))
    });
}

// --- 6. LÓGICA DE JUEGO (CORE) ---
function nextTurn(room) {
    if (room.timer) clearTimeout(room.timer);

    const allSpoken = room.players.every(p => room.spoken[p.id]);
    if (allSpoken) {
        startVoting(room);
        return;
    }

    let nextIndex = room.turnIndex;
    let loops = 0;
    do {
        nextIndex = (nextIndex + 1) % room.players.length;
        loops++;
    } while (room.spoken[room.players[nextIndex].id] && loops < room.players.length);

    room.turnIndex = nextIndex;
    room.turnDeadline = Date.now() + TIEMPO_TURNO;

    // Timer automático para pasar turno
    room.timer = setTimeout(() => {
        if(room.players[room.turnIndex]) {
            room.spoken[room.players[room.turnIndex].id] = true;
        }
        nextTurn(room);
    }, TIEMPO_TURNO);

    emitRoomState(room);
}

function startVoting(room) {
    if (room.timer) clearTimeout(room.timer);
    
    room.phase = 'votacion';
    room.voteDeadline = Date.now() + TIEMPO_VOTACION;
    room.votes = {}; 
    
    io.to(room.code).emit('votingStarted');
    emitRoomState(room);

    room.timer = setTimeout(() => {
        finishVoting(room, 'Tiempo agotado');
    }, TIEMPO_VOTACION);
}

function finishVoting(room, reason) {
    if (room.timer) clearTimeout(room.timer);
    
    const tally = {};
    Object.values(room.votes).forEach(v => { if(v) tally[v] = (tally[v]||0)+1; });

    let kicked = null, max = 0;
    for (const [id, count] of Object.entries(tally)) {
        if (count > max) { max = count; kicked = room.players.find(p => p.id === id); }
    }

    let isImpostor = false;
    let gameResult = null; 

    if (kicked) {
        isImpostor = (room.roles[kicked.id] === 'impostor');
        
        // Eliminar jugador
        room.players = room.players.filter(p => p.id !== kicked.id);
        delete room.roles[kicked.id];
        delete socketRoom[kicked.id];
        delete room.spoken[kicked.id];

        // CONDICIÓN DE VICTORIA
        const impostorsAlive = room.players.filter(p => room.roles[p.id] === 'impostor').length;
        const citizensAlive = room.players.filter(p => room.roles[p.id] === 'ciudadano').length;

        if (impostorsAlive === 0) {
            gameResult = 'citizensWin'; 
        } else if (impostorsAlive >= citizensAlive) {
            gameResult = 'impostorsWin'; 
        }
    }

    io.to(room.code).emit('votingResults', {
        reason,
        kickedPlayer: kicked ? { name: kicked.name } : null,
        isImpostor,
        gameResult
    });

    if (gameResult) {
        // Juego Terminado -> Lobby
        room.phase = 'lobby';
        room.spoken = {}; room.votes = {};
        setTimeout(() => emitRoomState(room), 5000);
    } else {
        // Sigue el Juego -> Palabras
        room.phase = 'palabras';
        room.turnIndex = -1; room.spoken = {}; room.votes = {};
        setTimeout(() => { if (rooms[room.code]) nextTurn(room); }, 5000);
    }
}

// --- 7. EVENTOS SOCKET.IO ---
io.on('connection', (socket) => {
    
    socket.on('createRoom', async (data, cb) => {
        const code = generateCode();
        let maxP = parseInt(data.maxPlayers) || 10;
        if (maxP > 15) maxP = 15; // Límite duro de 15

        let discordData = { voiceId: null, inviteLink: null };
        if (DISCORD_TOKEN) {
            const result = await crearCanalDiscord(code, maxP); 
            if (result) discordData = result;
        }

        const room = {
            code, hostId: socket.id, maxPlayers: maxP, impostors: parseInt(data.impostors)||2,
            players: [{ id: socket.id, name: data.name || 'Host', color: PLAYER_COLORS[0] }],
            phase: 'lobby', turnIndex: -1, roles: {}, spoken: {}, votes: {},
            discordVoiceChannel: discordData.voiceId, discordLink: discordData.inviteLink 
        };

        rooms[code] = room;
        socketRoom[socket.id] = code;
        socket.join(code);

        cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true, discordLink: discordData.inviteLink });
        emitRoomState(room);
    });

    socket.on('joinRoom', (data, cb) => {
        const code = (data.roomCode || '').toUpperCase();
        const room = rooms[code];
        if (room) {
            // Validaciones
            if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Sala llena.' });
            if (room.players.some(p => p.name.toUpperCase() === data.name.toUpperCase())) {
                return cb({ ok: false, error: 'Nombre en uso.' });
            }

            socket.join(code);
            socketRoom[socket.id] = code;
            
            // Asignar color y agregar
            room.players.push({ id: socket.id, name: data.name, color: assignColor(room) });
            room.spoken[socket.id] = false;
            
            cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: false, discordLink: room.discordLink });
            emitRoomState(room);
        } else {
            cb({ ok: false, error: 'Sala no existe' });
        }
    });

    socket.on('startRound', () => {
        const room = getRoomOfSocket(socket.id);
        if (room && room.hostId === socket.id) {
            const shuffled = [...room.players].sort(() => 0.5 - Math.random());
            const impostorIds = shuffled.slice(0, room.impostors || 1).map(p => p.id);
            const word = randomWord();

            room.roles = {};
            room.players.forEach(p => {
                const role = impostorIds.includes(p.id) ? 'impostor' : 'ciudadano';
                room.roles[p.id] = role;
                io.to(p.id).emit('yourRole', { role, word: role === 'ciudadano' ? word : null });
                room.spoken[p.id] = false;
            });

            // Fase Lectura
            room.phase = 'lectura';
            emitRoomState(room);

            // Iniciar tras 7s
            setTimeout(() => {
                if (rooms[room.code]) {
                    room.phase = 'palabras';
                    room.turnIndex = -1; 
                    nextTurn(room); 
                }
            }, 7000);
        }
    });

    socket.on('submitVote', (data) => {
        const room = getRoomOfSocket(socket.id);
        if(room && room.phase === 'votacion') {
            room.votes[socket.id] = data.targetId;
            // Emitimos estado para que el front vea quién ya votó
            emitRoomState(room);

            const activePlayers = room.players.length;
            const votesCast = Object.keys(room.votes).length;
            if(votesCast >= activePlayers) finishVoting(room, 'Todos votaron');
        }
    });

    socket.on('disconnect', () => {
        const room = getRoomOfSocket(socket.id);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            delete socketRoom[socket.id];
            
            if (room.players.length === 0) {
                if(room.timer) clearTimeout(room.timer);
                if (room.discordVoiceChannel) borrarCanalDiscord(room.discordVoiceChannel);
                delete rooms[room.code];
            } else {
                if (room.hostId === socket.id) room.hostId = room.players[0].id;
                emitRoomState(room);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));