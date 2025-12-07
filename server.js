// Carga variables de entorno si estás en local (.env), en Render no hace falta pero no molesta.
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
// Importamos la librería de Discord
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

// --- 1. CONFIGURACIÓN DE DISCORD ---
// Leemos las claves secretas desde Render (Environment Variables)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORIA_ID = process.env.CATEGORIA_ID; // Opcional

// Iniciamos el cliente de Discord con permisos para ver canales y gestionar voz
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

// Función para conectar el Bot
if (DISCORD_TOKEN) {
    discordClient.login(DISCORD_TOKEN)
        .then(() => console.log('✅ Bot de Discord CONECTADO y listo.'))
        .catch(err => console.error('❌ Error conectando Bot (Revisa el Token en Render):', err.message));
} else {
    console.log('⚠️ No hay DISCORD_TOKEN configurado. El juego funcionará sin voz automática.');
}

// Función auxiliar para crear el canal de voz
async function crearCanalDiscord(roomCode) {
    try {
        // Si el bot no está listo o no hay ID de servidor, salimos
        if (!discordClient.isReady() || !GUILD_ID) return null;

        const guild = await discordClient.guilds.fetch(GUILD_ID);
        if (!guild) return null;

        // Crear canal de voz
        const channel = await guild.channels.create({
            name: `Sala ${roomCode}`,
            type: ChannelType.GuildVoice,
            parent: CATEGORIA_ID || null,
            userLimit: 10,
            permissionOverwrites: [
                { id: guild.id, allow: ['Connect', 'Speak', 'ViewChannel'] },
            ],
        });

        // Crear invitación
        const invite = await channel.createInvite({
            maxAge: 3600, // 1 hora
            maxUses: 20,
            unique: true
        });

        // Programar auto-destrucción del canal en 1 hora para limpiar
        setTimeout(async () => {
            try { await channel.delete(); } catch(e) {}
        }, 3600 * 1000);

        return invite.url;

    } catch (error) {
        console.error('Error creando canal Discord:', error.message);
        return null; // Si falla, el juego sigue sin link
    }
}

// --- 2. SERVIDOR WEB Y JUEGO ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Servimos la carpeta 'public' (IMPORTANTE: Asegúrate que tu carpeta se llame así)
const CLIENT_DIR = path.join(__dirname, 'public');
app.use(express.static(CLIENT_DIR));

// CONSTANTES DE TIEMPO
const TIEMPO_TURNO = 15 * 1000;   // 15 Segundos
const TIEMPO_VOTACION = 120 * 1000; // 2 Minutos

// BASE DE DATOS EN MEMORIA
const rooms = {};
const socketRoom = {};

const WORDS = [
  'GALAXIA','MISTERIO','AVENTURA','DESIERTO','OCÉANO','LABERINTO','TRAVESÍA',
  'MONTAÑA','ISLA','INVESTIGACIÓN','SECRETO','FESTIVAL','HOSPITAL','CIUDAD',
  'MUSEO','TORMENTA','PLANETA','CASTILLO','RECUERDO','NOCHE','VERANO'
];

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

// Enviar estado de la sala a todos los jugadores
function emitRoomState(room) {
    if (!room) return;
    
    // Calculamos tiempo restante para mostrar en pantalla
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
        players: room.players.map(p => ({ id: p.id, name: p.name }))
    });
}

// Lógica de turnos (15s)
function nextTurn(room) {
    if (room.timer) clearTimeout(room.timer);

    // Si todos hablaron, pasar a votación
    const allSpoken = room.players.every(p => room.spoken[p.id]);
    if (allSpoken) {
        startVoting(room);
        return;
    }

    // Avanzar al siguiente jugador
    let nextIndex = room.turnIndex;
    let loops = 0;
    do {
        nextIndex = (nextIndex + 1) % room.players.length;
        loops++;
    } while (room.spoken[room.players[nextIndex].id] && loops < room.players.length);

    room.turnIndex = nextIndex;
    room.turnDeadline = Date.now() + TIEMPO_TURNO;

    // Timer automático: si no termina turno, se le corta
    room.timer = setTimeout(() => {
        // Marcamos como que "habló" a la fuerza
        if(room.players[room.turnIndex]) {
            room.spoken[room.players[room.turnIndex].id] = true;
        }
        nextTurn(room);
    }, TIEMPO_TURNO);

    emitRoomState(room);
}

// Lógica de votación (2 min)
function startVoting(room) {
    if (room.timer) clearTimeout(room.timer);
    
    room.phase = 'votacion';
    room.voteDeadline = Date.now() + TIEMPO_VOTACION;
    room.votes = {}; // Reset votos
    
    io.to(room.code).emit('votingStarted');
    emitRoomState(room);

    room.timer = setTimeout(() => {
        finishVoting(room, 'Tiempo agotado');
    }, TIEMPO_VOTACION);
}

function finishVoting(room, reason) {
    if (room.timer) clearTimeout(room.timer);
    
    // Contar votos
    const tally = {};
    Object.values(room.votes).forEach(v => { if(v) tally[v] = (tally[v]||0)+1; });

    let kicked = null, max = 0;
    for (const [id, count] of Object.entries(tally)) {
        if (count > max) { max = count; kicked = room.players.find(p => p.id === id); }
    }

    // Eliminar jugador si hubo mayoría (simple)
    let isImpostor = false;
    if (kicked) {
        isImpostor = (room.roles[kicked.id] === 'impostor');
        room.players = room.players.filter(p => p.id !== kicked.id);
        delete room.roles[kicked.id];
        delete socketRoom[kicked.id];
        delete room.spoken[kicked.id];
    }

    io.to(room.code).emit('votingResults', {
        reason,
        kickedPlayer: kicked ? { name: kicked.name } : null,
        isImpostor
    });

    // Resetear sala para nueva ronda
    room.phase = 'lobby';
    room.spoken = {};
    room.votes = {};
    emitRoomState(room);
}

// --- SOCKET.IO EVENTOS ---
io.on('connection', (socket) => {
    socket.on('createRoom', async (data, cb) => {
        const code = generateCode();
        // Crear canal de discord
        const link = await crearCanalDiscord(code);

        const room = {
            code, hostId: socket.id, maxPlayers: 10, impostors: 2,
            players: [{ id: socket.id, name: data.name || 'Host' }],
            phase: 'lobby', turnIndex: -1, 
            roles: {}, spoken: {}, votes: {},
            discordLink: link
        };
        rooms[code] = room;
        socketRoom[socket.id] = code;
        socket.join(code);

        cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true });
        emitRoomState(room);
    });

    socket.on('joinRoom', (data, cb) => {
        const code = (data.roomCode || '').toUpperCase();
        const room = rooms[code];
        if (room) {
            socket.join(code);
            socketRoom[socket.id] = code;
            room.players.push({ id: socket.id, name: data.name });
            room.spoken[socket.id] = false;
            
            cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: false });
            emitRoomState(room);
        } else {
            cb({ ok: false, error: 'Sala no existe' });
        }
    });

    socket.on('startRound', () => {
        const room = getRoomOfSocket(socket.id);
        if (room && room.hostId === socket.id) {
            // Asignar roles
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

            room.phase = 'palabras';
            room.turnIndex = -1; 
            nextTurn(room); // Inicia el primer turno
        }
    });

    socket.on('endTurn', () => {
        const room = getRoomOfSocket(socket.id);
        if(room && room.phase === 'palabras') {
            const currentPlayer = room.players[room.turnIndex];
            if(currentPlayer && currentPlayer.id === socket.id) {
                room.spoken[socket.id] = true;
                nextTurn(room);
            }
        }
    });

    socket.on('submitVote', (data) => {
        const room = getRoomOfSocket(socket.id);
        if(room && room.phase === 'votacion') {
            room.votes[socket.id] = data.targetId;
            // Chequear si todos votaron
            const activePlayers = room.players.length;
            const votesCast = Object.keys(room.votes).length;
            if(votesCast >= activePlayers) {
                finishVoting(room, 'Todos votaron');
            }
        }
    });

    socket.on('disconnect', () => {
        const room = getRoomOfSocket(socket.id);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            delete socketRoom[socket.id];
            
            if (room.players.length === 0) {
                if(room.timer) clearTimeout(room.timer);
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