require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

// --- CONFIG DISCORD ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;        
const CATEGORIA_ID = process.env.DISCORD_CATEGORY_ID; 

const discordClient = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates ] });
if (DISCORD_TOKEN) discordClient.login(DISCORD_TOKEN).catch(e => console.error("Discord Error:", e));

// --- BASE DE DATOS PALABRAS ---
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#06b6d4', '#84cc16', '#78716c', '#f43f5e', '#6366f1', '#14b8a6', '#d946ef', '#64748b'];
const WORD_DB = {
    lugares: ['SAUNA', 'CEMENTERIO', 'SUBMARINO', 'ASCENSOR', 'IGLÚ', 'CASINO', 'CIRCO', 'ESTACIÓN ESPACIAL', 'HORMIGUERO', 'CINE', 'BARCO PIRATA', 'ZOOLÓGICO', 'HOSPITAL', 'AEROPUERTO', 'PLAYA', 'BIBLIOTECA'],
    comidas: ['SUSHI', 'PAELLA', 'TACOS', 'HELADO', 'HUEVO FRITO', 'CEVICHE', 'ASADO', 'FONDUE', 'MEDIALUNA', 'SOPA', 'COCO', 'CHICLE', 'PIZZA', 'HAMBURGUESA', 'POCHOCLOS', 'CHOCOLATE'],
    objetos: ['PARAGUAS', 'CEPILLO DE DIENTES', 'MICROONDAS', 'GUITARRA', 'INODORO', 'LAVADORA', 'ESPEJO', 'DRON', 'TARJETA DE CRÉDITO', 'VELA', 'ZAPATO', 'LINTERNA', 'RELOJ', 'LLAVES'],
    animales: ['PINGÜINO', 'CANGURO', 'MOSQUITO', 'PULPO', 'PEREZOSO', 'CAMALEÓN', 'MURCIÉLAGO', 'JIRAFA', 'ABEJA', 'LEÓN', 'TIBURÓN', 'ELEFANTE', 'GATO', 'PERRO'],
    profesiones: ['ASTRONAUTA', 'MIMO', 'CIRUJANO', 'JARDINERO', 'DETECTIVE', 'BUZO', 'ÁRBITRO', 'CAJERO', 'PRESIDENTE', 'FANTASMA', 'BOMBERO', 'PROFESOR', 'POLICÍA', 'CHEF'],
    cine: ['TITANIC', 'SHREK', 'HARRY POTTER', 'STAR WARS', 'AVENGERS', 'MATRIX', 'EL REY LEÓN', 'JURASSIC PARK', 'FROZEN', 'BATMAN', 'SPIDERMAN', 'TOY STORY']
};

function getRandomWord(cat) {
    let pool = [];
    if (!cat || cat.length === 0) Object.values(WORD_DB).forEach(arr => pool.push(...arr));
    else cat.forEach(c => { if (WORD_DB[c]) pool.push(...WORD_DB[c]); });
    if (pool.length === 0) Object.values(WORD_DB).forEach(arr => pool.push(...arr));
    return pool[Math.floor(Math.random() * pool.length)];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- DISCORD HELPERS ---
async function crearCanalDiscord(nombre, limite) { 
    try { 
        const guild = discordClient.guilds.cache.get(GUILD_ID); if(!guild) return null;
        const canal = await guild.channels.create({ 
            name: `Sala ${nombre}`, 
            type: ChannelType.GuildVoice, 
            parent: CATEGORIA_ID, 
            userLimit: limite || 15, 
            permissionOverwrites: [
                { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
            ] 
        });
        const invite = await canal.createInvite({maxAge:0, maxUses:0, unique: true}); 
        return {voiceId: canal.id, inviteLink: invite.url}; 
    } catch(e){ console.error("Error creando canal:", e); return null; }
}

async function borrarCanalDiscord(id) { try{const g=discordClient.guilds.cache.get(GUILD_ID); if(g) await g.channels.cache.get(id)?.delete();}catch(e){} }

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 });

const CLIENT_DIR = path.join(__dirname, 'public');
app.use(express.static(CLIENT_DIR));

const rooms = {};
const socketRoom = {};

function generateCode() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let r='',i=0; do{r='';for(let j=0;j<4;j++)r+=c[Math.floor(Math.random()*c.length)];i++}while(rooms[r]&&i<100); return r;}
function assignColor(r) { const u=r.players.map(p=>p.color); return PLAYER_COLORS.find(c=>!u.includes(c))||'#fff'; }
function getRoomOfSocket(id) { const c = socketRoom[id]; return c ? rooms[c] : null; }

function emitRoomState(room) {
    if (!room) return;
    const now = Date.now();
    let timeLeft = 0;
    if (room.phase === 'palabras' && room.turnDeadline) timeLeft = Math.max(0, Math.ceil((room.turnDeadline - now) / 1000));
    else if (room.phase === 'votacion' && room.voteDeadline) timeLeft = Math.max(0, Math.ceil((room.voteDeadline - now) / 1000));

    const votesCount = Object.keys(room.votes).length;
    const livingPlayers = room.players.filter(p => !p.isDead).length;

    io.to(room.code).emit('roomState', {
        roomCode: room.code, hostId: room.hostId, phase: room.phase, turnIndex: room.turnIndex,
        timeLeft: timeLeft, discordLink: room.discordLink,
        votesInfo: { current: votesCount, total: livingPlayers },
        players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, hasVoted: !!room.votes[p.id], isDead: p.isDead }))
    });
}

function nextTurn(room) {
    if(room.timer) clearTimeout(room.timer);
    const living = room.players.filter(p => !p.isDead);
    const allSpoken = living.every(p => room.spoken[p.id]);
    
    if(allSpoken){ startVoting(room); return; }

    let next = room.turnIndex, loops=0;
    do { next = (next+1) % room.players.length; loops++; } 
    while((room.spoken[room.players[next].id] || room.players[next].isDead) && loops < room.players.length * 2);

    room.turnIndex = next; 
    room.turnDeadline = Date.now() + room.config.turnTime;
    
    room.timer = setTimeout(()=>{ 
        if(room.players[room.turnIndex]) room.spoken[room.players[room.turnIndex].id]=true; 
        nextTurn(room); 
    }, room.config.turnTime);
    
    emitRoomState(room);
}

function startVoting(room) { 
    if(room.timer) clearTimeout(room.timer);
    room.phase='votacion'; 
    room.voteDeadline = Date.now() + room.config.voteTime; 
    room.votes = {}; 
    io.to(room.code).emit('votingStarted'); 
    emitRoomState(room);
    room.timer = setTimeout(()=>finishVoting(room, 'Tiempo agotado'), room.config.voteTime);
}

function finishVoting(room, reason) {
    if(room.timer) clearTimeout(room.timer);
    
    const tally = {};
    Object.values(room.votes).forEach(v => { if(v) tally[v] = (tally[v]||0)+1; });

    let max = 0;
    let candidates = [];
    for (const [id, count] of Object.entries(tally)) {
        if (count > max) { max = count; candidates = [id]; }
        else if (count === max) { candidates.push(id); } 
    }

    let kicked = null;
    if (candidates.length === 1) kicked = room.players.find(p => p.id === candidates[0]);

    let isImpostor = false;
    let gameResult = null;

    if (kicked) {
        isImpostor = (room.roles[kicked.id] === 'impostor');
        const pIdx = room.players.findIndex(p => p.id === kicked.id);
        if (pIdx !== -1) room.players[pIdx].isDead = true; 

        const livImp = room.players.filter(p => !p.isDead && room.roles[p.id]==='impostor').length;
        const livCit = room.players.filter(p => !p.isDead && room.roles[p.id]==='ciudadano').length;

        if(livImp === 0) gameResult = 'citizensWin';
        else if(livImp >= livCit) gameResult = 'impostorsWin';
    }

    // --- CORRECCIÓN: Enviar datos reales ---
    // Buscar quiénes son los verdaderos impostores para mostrarlos al final
    const realImpostorsList = room.players.filter(p => room.roles[p.id] === 'impostor').map(p => p.name);
    const realImpostorNameStr = realImpostorsList.length > 0 ? realImpostorsList.join(', ') : 'N/A';

    io.to(room.code).emit('votingResults', { 
        reason, 
        kickedPlayer: kicked?{name:kicked.name}:null, 
        isImpostor, 
        gameResult,
        // NUEVOS DATOS: Palabra real y nombre real del impostor
        secretWord: room.secretWord,
        realImpostorName: realImpostorNameStr
    });
    // ---------------------------------------
    
    if(gameResult) {
        room.phase = 'lobby'; 
        setTimeout(() => emitRoomState(room), 5000);
    } else {
        room.phase = 'palabras'; room.turnIndex = -1; room.spoken = {}; room.votes = {};
        setTimeout(() => { if(rooms[room.code]) nextTurn(room); }, 4000);
    }
}

io.on('connection', (socket) => {
    socket.on('createRoom', async (data, cb) => {
        const code = generateCode();
        let maxP = Math.min(parseInt(data.maxPlayers)||10, 15);
        let discordData = {voiceId:null, inviteLink:null};
        
        if(DISCORD_TOKEN && !data.isLocal) { 
            const r = await crearCanalDiscord(code, maxP); 
            if(r) discordData=r; 
        }

        const room = {
            code, hostId: socket.id, maxPlayers: maxP, impostors: parseInt(data.impostors)||2,
            categories: data.categories || [],
            config: { turnTime: (parseInt(data.turnTime)||15)*1000, voteTime: (parseInt(data.voteTime)||120)*1000 },
            players: [{ id: socket.id, name: data.name||'Host', color: PLAYER_COLORS[0], isDead: false }],
            phase: 'lobby', turnIndex: -1, roles: {}, spoken: {}, votes: {},
            discordVoiceChannel: discordData.voiceId, discordLink: discordData.inviteLink,
            secretWord: null // Inicializar
        };
        rooms[code] = room; socketRoom[socket.id] = code; socket.join(code);
        cb({ok: true, roomCode: code, me: {id:socket.id}, isHost: true, discordLink: discordData.inviteLink});
        emitRoomState(room);
    });

    socket.on('joinRoom', (data, cb) => {
        const code = (data.roomCode || '').trim().toUpperCase(); 
        const room = rooms[code];
        if(room) {
            if(room.players.length >= room.maxPlayers) return cb({ok:false, error:'Sala llena'});
            if(room.players.some(p => p.name.toUpperCase() === data.name.toUpperCase())) return cb({ok:false, error:'Nombre en uso'});
            
            socket.join(code); socketRoom[socket.id] = code;
            room.players.push({id:socket.id, name:data.name, color:assignColor(room), isDead: false});
            room.spoken[socket.id] = false;
            cb({ok:true, roomCode: code, me: {id:socket.id}, isHost: false, discordLink: room.discordLink});
            emitRoomState(room);
        } else cb({ok:false, error:'Sala no existe'});
    });

    socket.on('startRound', () => {
        const room = getRoomOfSocket(socket.id);
        if(room && room.hostId === socket.id) {
            room.players.forEach(p => p.isDead = false);
            room.votes = {}; room.spoken = {}; room.turnIndex = -1;

            // --- CORRECCIÓN: El Host (índice 0) no puede ser impostor ---
            const hostPlayer = room.players[0];
            const otherPlayers = room.players.slice(1);
            
            // Mezclamos solo a los demás jugadores
            const shuffledOthers = shuffleArray([...otherPlayers]);
            // Elegimos los IDs de los impostores de esa lista mezclada
            const impIds = shuffledOthers.slice(0, room.impostors).map(p => p.id);
            
            const word = getRandomWord(room.categories);
            room.secretWord = word; // Guardamos la palabra en la sala

            const impNames = room.players.filter(p => impIds.includes(p.id)).map(p => p.name);

            room.roles = {};
            room.players.forEach(p => {
                const role = impIds.includes(p.id) ? 'impostor' : 'ciudadano';
                room.roles[p.id] = role;
                const teammates = role === 'impostor' ? impNames.filter(n => n !== p.name) : [];
                io.to(p.id).emit('yourRole', { role, word: role==='ciudadano'?word:null, teammates });
                room.spoken[p.id] = false;
            });
            
            room.phase = 'lectura'; emitRoomState(room);
            setTimeout(()=>{ if(rooms[room.code]){ room.phase='palabras'; room.turnIndex = Math.floor(Math.random() * room.players.length); nextTurn(room); } }, 7000);
        }
    });

    socket.on('finishTurn', () => { const r = getRoomOfSocket(socket.id); if(r && r.phase==='palabras' && r.players[r.turnIndex]?.id===socket.id) { r.spoken[socket.id]=true; nextTurn(r); } });
    socket.on('submitVote', (d) => { const r=getRoomOfSocket(socket.id); if(r && r.phase==='votacion' && !r.players.find(x=>x.id===socket.id).isDead) { r.votes[socket.id]=d.targetId; emitRoomState(r); if(Object.keys(r.votes).length >= r.players.filter(x=>!x.isDead).length) finishVoting(r, 'Todos votaron'); } });
    
    socket.on('disconnect', () => {
        const room = getRoomOfSocket(socket.id);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            delete socketRoom[socket.id];
            if (room.players.length === 0) {
                if (room.discordVoiceChannel) borrarCanalDiscord(room.discordVoiceChannel);
                delete rooms[room.code];
            } else { if (room.hostId === socket.id) room.hostId = room.players[0].id; emitRoomState(room); }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor listo ${PORT}`));