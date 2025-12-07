require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

// --- 1. CONFIGURACIÓN DE DISCORD ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
// Nota: Usamos los nombres que configuraste en Render
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

// --- FUNCIÓN PARA CREAR CANALES ---
async function crearCanalDiscord(nombreSala) {
    try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error("❌ No se encontró el servidor (Guild). Revisa la ID en Render.");
            return null;
        }

        // Crear Canal de VOZ
        const canalVoz = await guild.channels.create({
            name: `Sala ${nombreSala}`,
            type: ChannelType.GuildVoice,
            parent: CATEGORIA_ID,
            userLimit: 10
        });

        // Crear una INVITACIÓN
        const invite = await canalVoz.createInvite({
            maxAge: 0, 
            maxUses: 0 
        });

        console.log(`✅ Canal creado: ${canalVoz.name} | Link: ${invite.url}`);

        return {
            voiceId: canalVoz.id,
            inviteLink: invite.url 
        };

    } catch (err) {
        console.error("Error creando canales Discord:", err);
        return null;
    }
}

// --- FUNCIÓN PARA BORRAR CANALES ---
async function borrarCanalDiscord(canalId) {
    if (!canalId) return;
    try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (!guild) return;

        const canal = guild.channels.cache.get(canalId);
        if (canal) {
            await canal.delete();
            console.log(`🗑️ Canal Discord ${canalId} eliminado.`);
        }
    } catch (err) {
        console.error("Error borrando canal:", err);
    }
}

// --- 2. SERVIDOR WEB Y JUEGO ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const CLIENT_DIR = path.join(__dirname, 'public');
app.use(express.static(CLIENT_DIR));

// CONSTANTES
const TIEMPO_TURNO = 15 * 1000;
const TIEMPO_VOTACION = 120 * 1000;

// --- LISTA DE PALABRAS COMPLETA ---
const WORDS = [
    // 📍 Lugares
    'SAUNA', 'CEMENTERIO', 'SUBMARINO', 'ASCENSOR', 'IGLÚ', 
    'CASINO', 'PELUQUERÍA', 'CIRCO', 'ESTACIÓN ESPACIAL', 'HORMIGUERO', 
    'CINE', 'BODA', 'VESTUARIO DE GIMNASIO', 'BARCO PIRATA', 'ZOOLÓGICO',
    
    // 🍕 Comidas
    'SUSHI', 'PAELLA', 'TACOS', 'HELADO', 'HUEVO FRITO', 
    'CEVICHE', 'PARRILLADA', 'FONDUE', 'MEDIALUNA', 'SOPA', 
    'COCO', 'CHICLE',

    // 🛠️ Objetos
    'PARAGUAS', 'CEPILLO DE DIENTES', 'MICROONDAS', 'GUITARRA', 'INODORO', 
    'LAVADORA', 'ESPEJO', 'DRON', 'TARJETA DE CRÉDITO', 'VELA', 'ZAPATO',

    // 🦁 Animales
    'PINGÜINO', 'CANGURO', 'MOSQUITO', 'PULPO', 'PEREZOSO', 
    'CAMALEÓN', 'MURCIÉLAGO', 'JIRAFA', 'ABEJA',

    // 👮 Profesiones
    'ASTRONAUTA', 'MIMO', 'CIRUJANO', 'JARDINERO', 'DETECTIVE', 
    'BUZO', 'ÁRBITRO', 'CAJERO', 'PRESIDENTE', 'FANTASMA'
];

// DATOS EN MEMORIA
const rooms = {};
const socketRoom = {};

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
        discordLink: room.discordLink, // IMPORTANTE: Enviamos el link
        players: room.players.map(p => ({ id: p.id, name: p.name }))
    });
}

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

    room.phase = 'lobby';
    room.spoken = {};
    room.votes = {};
    emitRoomState(room);
}

// --- SOCKET.IO EVENTOS ---
io.on('connection', (socket) => {
    
    // --- CREAR SALA ---
    socket.on('createRoom', async (data, cb) => {
        const code = generateCode();
        
        // 1. Crear canal Discord y obtener INVITACIÓN
        let discordData = { voiceId: null, inviteLink: null };
        if (DISCORD_TOKEN) {
            const result = await crearCanalDiscord(code); 
            if (result) discordData = result;
        }

        const room = {
            code, 
            hostId: socket.id, 
            maxPlayers: 10, 
            impostors: 2,
            players: [{ id: socket.id, name: data.name || 'Host' }],
            phase: 'lobby', 
            turnIndex: -1, 
            roles: {}, 
            spoken: {}, 
            votes: {},
            discordVoiceChannel: discordData.voiceId,
            discordLink: discordData.inviteLink // Guardamos el link
        };

        rooms[code] = room;
        socketRoom[socket.id] = code;
        socket.join(code);

        // Devolvemos el link al cliente para que él lo abra
        cb({ 
            ok: true, 
            roomCode: code, 
            me: { id: socket.id }, 
            isHost: true,
            discordLink: discordData.inviteLink 
        });
        emitRoomState(room);
    });

    // ... (El resto de joinRoom, startRound, etc. sigue igual) ...
    socket.on('joinRoom', (data, cb) => {
        const code = (data.roomCode || '').toUpperCase();
        const room = rooms[code];
        if (room) {
            socket.join(code);
            socketRoom[socket.id] = code;
            room.players.push({ id: socket.id, name: data.name });
            room.spoken[socket.id] = false;
            
            cb({ 
                ok: true, 
                roomCode: code, 
                me: { id: socket.id }, 
                isHost: false,
                discordLink: room.discordLink // Enviamos link al que se une también
            });
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
                // Enviamos rol y palabra
                io.to(p.id).emit('yourRole', { role, word: role === 'ciudadano' ? word : null });
                room.spoken[p.id] = false;
            });

            room.phase = 'palabras';
            room.turnIndex = -1; 
            nextTurn(room); 
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
                
                // Borrar canal al vaciarse la sala
                if (room.discordVoiceChannel) {
                    borrarCanalDiscord(room.discordVoiceChannel);
                }
                
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