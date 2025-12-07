require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

// ==========================================
// 1. CONFIGURACIÓN DE DISCORD
// ==========================================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;        
const CATEGORIA_ID = process.env.DISCORD_CATEGORY_ID; 

const discordClient = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates ]
});

if (DISCORD_TOKEN) {
    discordClient.login(DISCORD_TOKEN)
        .then(() => console.log('✅ Bot de Discord CONECTADO.'))
        .catch(e => console.error('❌ Error Discord:', e));
}

// ==========================================
// 2. DATOS DEL JUEGO (CONSTANTES)
// ==========================================
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

// Base de datos de palabras por categoría
const WORD_DB = {
    lugares: ['SAUNA', 'CEMENTERIO', 'SUBMARINO', 'ASCENSOR', 'IGLÚ', 'CASINO', 'CIRCO', 'ESTACIÓN ESPACIAL', 'HORMIGUERO', 'CINE', 'BARCO PIRATA', 'ZOOLÓGICO', 'HOSPITAL', 'AEROPUERTO', 'PLAYA', 'BIBLIOTECA'],
    comidas: ['SUSHI', 'PAELLA', 'TACOS', 'HELADO', 'HUEVO FRITO', 'CEVICHE', 'ASADO', 'FONDUE', 'MEDIALUNA', 'SOPA', 'COCO', 'CHICLE', 'PIZZA', 'HAMBURGUESA', 'POCHOCLOS', 'CHOCOLATE'],
    objetos: ['PARAGUAS', 'CEPILLO DE DIENTES', 'MICROONDAS', 'GUITARRA', 'INODORO', 'LAVADORA', 'ESPEJO', 'DRON', 'TARJETA DE CRÉDITO', 'VELA', 'ZAPATO', 'LINTERNA', 'RELOJ', 'LLAVES'],
    animales: ['PINGÜINO', 'CANGURO', 'MOSQUITO', 'PULPO', 'PEREZOSO', 'CAMALEÓN', 'MURCIÉLAGO', 'JIRAFA', 'ABEJA', 'LEÓN', 'TIBURÓN', 'ELEFANTE', 'GATO', 'PERRO'],
    profesiones: ['ASTRONAUTA', 'MIMO', 'CIRUJANO', 'JARDINERO', 'DETECTIVE', 'BUZO', 'ÁRBITRO', 'CAJERO', 'PRESIDENTE', 'FANTASMA', 'BOMBERO', 'PROFESOR', 'POLICÍA', 'CHEF']
};

const TIEMPO_TURNO = 15 * 1000;    // 15 segundos por persona
const TIEMPO_VOTACION = 120 * 1000; // 2 minutos para votar

// Memoria del servidor
const rooms = {};
const socketRoom = {};

// ==========================================
// 3. FUNCIONES AUXILIARES (HELPERS)
// ==========================================

// Elige una palabra aleatoria basada en las categorías seleccionadas
function getRandomWord(selectedCategories) {
    let pool = [];
    // Si no hay categorías seleccionadas, usamos todas
    if (!selectedCategories || selectedCategories.length === 0) {
        Object.values(WORD_DB).forEach(arr => pool.push(...arr));
    } else {
        selectedCategories.forEach(cat => {
            if (WORD_DB[cat]) pool.push(...WORD_DB[cat]);
        });
    }
    // Seguridad por si la lista queda vacía
    if (pool.length === 0) Object.values(WORD_DB).forEach(arr => pool.push(...arr));
    
    return pool[Math.floor(Math.random() * pool.length)];
}

// Genera un código de sala único (ej: ARC-X92Z)
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

// Asigna un color que no esté siendo usado en la sala
function assignColor(room) {
    const usedColors = room.players.map(p => p.color);
    const available = PLAYER_COLORS.find(c => !usedColors.includes(c));
    return available || '#ffffff'; // Blanco si se acaban (raro)
}

// Busca la sala a la que pertenece un socket (Jugador)
function getRoomOfSocket(socketId) {
    const code = socketRoom[socketId];
    return code ? rooms[code] : null;
}

// Crea el canal de voz privado en Discord
async function crearCanalDiscord(nombreSala, limite) {
    try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (!guild) return null;

        const canal = await guild.channels.create({
            name: `Sala ${nombreSala}`,
            type: ChannelType.GuildVoice,
            parent: CATEGORIA_ID,
            userLimit: limite || 15,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel], // Invisible
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] // Accesible con link
                }
            ]
        });
        const invite = await canal.createInvite({ maxAge: 0, maxUses: 0 });
        return { voiceId: canal.id, inviteLink: invite.url };
    } catch (e) {
        console.error("Error creando canal Discord:", e);
        return null;
    }
}

// Borra el canal de Discord cuando la sala se vacía
async function borrarCanalDiscord(canalId) {
    if (!canalId) return;
    try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (guild) {
            const canal = guild.channels.cache.get(canalId);
            if (canal) await canal.delete();
        }
    } catch (e) {
        // Ignoramos error si ya no existe
    }
}

// ==========================================
// 4. CONFIGURACIÓN EXPRESS Y SOCKET.IO
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const CLIENT_DIR = path.join(__dirname, 'public');
app.use(express.static(CLIENT_DIR));

// ==========================================
// 5. LÓGICA DEL JUEGO (ESTADOS)
// ==========================================

// Envía el estado actual de la sala a todos los jugadores
function emitRoomState(room) {
    if (!room) return;
    
    // Calcular tiempo restante
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
        // Enviamos la lista de jugadores con sus datos públicos
        players: room.players.map(p => ({ 
            id: p.id, 
            name: p.name, 
            color: p.color, 
            hasVoted: !!room.votes[p.id] // Check si ya votó
        }))
    });
}

// Avanza al siguiente turno de palabra
function nextTurn(room) {
    if (room.timer) clearTimeout(room.timer);

    // Verificar si todos ya hablaron
    const allSpoken = room.players.every(p => room.spoken[p.id]);
    if (allSpoken) {
        startVoting(room); // Pasamos a votación
        return;
    }

    // Buscar siguiente jugador que no haya hablado
    let nextIndex = room.turnIndex;
    let loops = 0;
    do {
        nextIndex = (nextIndex + 1) % room.players.length;
        loops++;
    } while (room.spoken[room.players[nextIndex].id] && loops < room.players.length);

    room.turnIndex = nextIndex;
    room.turnDeadline = Date.now() + TIEMPO_TURNO;

    // Timer automático para cortar turno
    room.timer = setTimeout(() => {
        if(room.players[room.turnIndex]) {
            room.spoken[room.players[room.turnIndex].id] = true; // Marcar como hablado
        }
        nextTurn(room);
    }, TIEMPO_TURNO);

    emitRoomState(room);
}

// Inicia la fase de votación
function startVoting(room) {
    if (room.timer) clearTimeout(room.timer);
    
    room.phase = 'votacion';
    room.voteDeadline = Date.now() + TIEMPO_VOTACION;
    room.votes = {}; 
    
    io.to(room.code).emit('votingStarted');
    emitRoomState(room);

    // Timer para forzar fin de votación
    room.timer = setTimeout(() => finishVoting(room, 'Tiempo agotado'), TIEMPO_VOTACION);
}

// Finaliza votación y decide quién sale
function finishVoting(room, reason) {
    if (room.timer) clearTimeout(room.timer);
    
    // Contar votos
    const tally = {};
    Object.values(room.votes).forEach(v => { if(v) tally[v] = (tally[v]||0)+1; });

    // Buscar al más votado
    let kicked = null, max = 0;
    for (const [id, count] of Object.entries(tally)) {
        if (count > max) { max = count; kicked = room.players.find(p => p.id === id); }
    }

    let isImpostor = false;
    let gameResult = null; // null = sigue, 'citizensWin', 'impostorsWin'

    if (kicked) {
        isImpostor = (room.roles[kicked.id] === 'impostor');
        
        // Eliminar al jugador de la sala
        room.players = room.players.filter(p => p.id !== kicked.id);
        delete room.roles[kicked.id];
        delete socketRoom[kicked.id];
        delete room.spoken[kicked.id];

        // Verificar condiciones de victoria
        const impostorsAlive = room.players.filter(p => room.roles[p.id] === 'impostor').length;
        const citizensAlive = room.players.filter(p => room.roles[p.id] === 'ciudadano').length;

        if (impostorsAlive === 0) {
            gameResult = 'citizensWin';
        } else if (impostorsAlive >= citizensAlive) {
            gameResult = 'impostorsWin';
        }
    }

    // Notificar resultado
    io.to(room.code).emit('votingResults', {
        reason,
        kickedPlayer: kicked ? { name: kicked.name } : null,
        isImpostor,
        gameResult
    });

    // Decidir flujo: ¿Termina o sigue?
    if (gameResult) {
        // Fin del juego -> Reset a Lobby
        room.phase = 'lobby';
        room.spoken = {}; room.votes = {};
        setTimeout(() => emitRoomState(room), 5000); // 5s para ver resultado
    } else {
        // Sigue jugando -> Nueva ronda de palabras
        room.phase = 'palabras';
        room.turnIndex = -1; room.spoken = {}; room.votes = {};
        setTimeout(() => { if (rooms[room.code]) nextTurn(room); }, 5000);
    }
}

// ==========================================
// 6. EVENTOS DE SOCKET.IO
// ==========================================
io.on('connection', (socket) => {
    
    // Crear Sala
    socket.on('createRoom', async (data, cb) => {
        const code = generateCode();
        let maxP = Math.min(parseInt(data.maxPlayers) || 10, 15); // Tope 15

        // Crear Discord si hay token
        let discordData = { voiceId: null, inviteLink: null };
        if (DISCORD_TOKEN) {
            const result = await crearCanalDiscord(code, maxP); 
            if (result) discordData = result;
        }

        const room = {
            code, 
            hostId: socket.id, 
            maxPlayers: maxP, 
            impostors: parseInt(data.impostors) || 2,
            categories: data.categories || [], // Guardamos categorías
            players: [{ id: socket.id, name: data.name || 'Host', color: PLAYER_COLORS[0] }],
            phase: 'lobby', 
            turnIndex: -1, 
            roles: {}, spoken: {}, votes: {},
            discordVoiceChannel: discordData.voiceId, 
            discordLink: discordData.inviteLink
        };

        rooms[code] = room;
        socketRoom[socket.id] = code;
        socket.join(code);

        cb({ ok: true, roomCode: code, me: { id: socket.id }, isHost: true, discordLink: discordData.inviteLink });
        emitRoomState(room);
    });

    // Unirse a Sala
    socket.on('joinRoom', (data, cb) => {
        const code = (data.roomCode || '').toUpperCase();
        const room = rooms[code];
        
        if (room) {
            // Validaciones
            if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Sala llena' });
            if (room.players.some(p => p.name.toUpperCase() === data.name.toUpperCase())) return cb({ ok: false, error: 'Nombre en uso' });

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

    // Iniciar Ronda
    socket.on('startRound', () => {
        const room = getRoomOfSocket(socket.id);
        if (room && room.hostId === socket.id) {
            const shuffled = [...room.players].sort(() => 0.5 - Math.random());
            const impostorIds = shuffled.slice(0, room.impostors).map(p => p.id);
            
            // Elegir palabra de las categorías seleccionadas
            const word = getRandomWord(room.categories);

            // Preparar chivatazo para impostores
            const impostorNames = shuffled.filter(p => impostorIds.includes(p.id)).map(p => p.name);

            room.roles = {};
            room.players.forEach(p => {
                const role = impostorIds.includes(p.id) ? 'impostor' : 'ciudadano';
                room.roles[p.id] = role;
                
                // Info extra solo para impostores
                const teammates = role === 'impostor' ? impostorNames.filter(n => n !== p.name) : [];
                
                io.to(p.id).emit('yourRole', { 
                    role, 
                    word: role === 'ciudadano' ? word : null, 
                    teammates 
                });
                room.spoken[p.id] = false;
            });

            room.phase = 'lectura'; 
            emitRoomState(room);
            
            // 7 segundos de lectura antes de empezar turnos
            setTimeout(() => { 
                if (rooms[room.code]) { 
                    room.phase = 'palabras'; 
                    room.turnIndex = -1; 
                    nextTurn(room); 
                } 
            }, 7000);
        }
    });

    // Votar
    socket.on('submitVote', (data) => {
        const room = getRoomOfSocket(socket.id);
        if (room && room.phase === 'votacion') {
            room.votes[socket.id] = data.targetId;
            emitRoomState(room); // Para actualizar el check ✅
            
            // Si todos votaron, terminar antes
            if (Object.keys(room.votes).length >= room.players.length) {
                finishVoting(room, 'Todos votaron');
            }
        }
    });

    // Desconexión
    socket.on('disconnect', () => {
        const room = getRoomOfSocket(socket.id);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            delete socketRoom[socket.id];
            
            // Si la sala se vacía, borrarla
            if (room.players.length === 0) {
                if (room.timer) clearTimeout(room.timer);
                if (room.discordVoiceChannel) borrarCanalDiscord(room.discordVoiceChannel);
                delete rooms[room.code];
            } else {
                // Si el host se fue, asignar nuevo host
                if (room.hostId === socket.id) room.hostId = room.players[0].id;
                emitRoomState(room);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));