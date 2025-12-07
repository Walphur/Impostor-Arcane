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

const discordClient = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates ]
});

if (DISCORD_TOKEN) discordClient.login(DISCORD_TOKEN).catch(e => console.error(e));

// --- COLORES ---
const PLAYER_COLORS = [
    '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', 
    '#a855f7', '#ec4899', '#06b6d4', '#84cc16', '#78716c', 
    '#f43f5e', '#6366f1', '#14b8a6', '#d946ef', '#64748b'
];

// --- PALABRAS POR CATEGORÍA ---
const WORD_DB = {
    lugares: ['SAUNA', 'CEMENTERIO', 'SUBMARINO', 'ASCENSOR', 'IGLÚ', 'CASINO', 'CIRCO', 'ESTACIÓN ESPACIAL', 'HORMIGUERO', 'CINE', 'BARCO PIRATA', 'ZOOLÓGICO', 'HOSPITAL', 'AEROPUERTO', 'PLAYA', 'BIBLIOTECA'],
    comidas: ['SUSHI', 'PAELLA', 'TACOS', 'HELADO', 'HUEVO FRITO', 'CEVICHE', 'ASADO', 'FONDUE', 'MEDIALUNA', 'SOPA', 'COCO', 'CHICLE', 'PIZZA', 'HAMBURGUESA', 'POCHOCLOS', 'CHOCOLATE'],
    objetos: ['PARAGUAS', 'CEPILLO DE DIENTES', 'MICROONDAS', 'GUITARRA', 'INODORO', 'LAVADORA', 'ESPEJO', 'DRON', 'TARJETA DE CRÉDITO', 'VELA', 'ZAPATO', 'LINTERNA', 'RELOJ', 'LLAVES'],
    animales: ['PINGÜINO', 'CANGURO', 'MOSQUITO', 'PULPO', 'PEREZOSO', 'CAMALEÓN', 'MURCIÉLAGO', 'JIRAFA', 'ABEJA', 'LEÓN', 'TIBURÓN', 'ELEFANTE', 'GATO', 'PERRO'],
    profesiones: ['ASTRONAUTA', 'MIMO', 'CIRUJANO', 'JARDINERO', 'DETECTIVE', 'BUZO', 'ÁRBITRO', 'CAJERO', 'PRESIDENTE', 'FANTASMA', 'BOMBERO', 'PROFESOR', 'POLICÍA', 'CHEF']
};

// --- HELPERS ---
function getRandomWord(selectedCategories) {
    let pool = [];
    if (!selectedCategories || selectedCategories.length === 0) {
        Object.values(WORD_DB).forEach(arr => pool.push(...arr));
    } else {
        selectedCategories.forEach(cat => {
            if (WORD_DB[cat]) pool.push(...WORD_DB[cat]);
        });
    }
    if (pool.length === 0) Object.values(WORD_DB).forEach(arr => pool.push(...arr));
    return pool[Math.floor(Math.random() * pool.length)];
}

async function crearCanalDiscord(nombre, limite) { 
    try { 
        const guild = discordClient.guilds.cache.get(GUILD_ID); 
        if(!guild) return null;
        const canal = await guild.channels.create({ 
            name: `Sala ${nombre}`, type: ChannelType.GuildVoice, parent: CATEGORIA_ID, 
            userLimit: limite || 15, 
            permissionOverwrites: [{id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]}] 
        });
        const invite = await canal.createInvite({maxAge:0, maxUses:0}); 
        return {voiceId: canal.id, inviteLink: invite.url}; 
    } catch(e){ return null; }
}

async function borrarCanalDiscord(id) { try{const g=discordClient.guilds.cache.get(GUILD_ID); if(g) await g.channels.cache.get(id)?.delete();}catch(e){} }
function generateCode() { const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let r='',i=0; do{r='ARC-';for(let j=0;j<4;j++)r+=c[Math.floor(Math.random()*c.length)];i++}while(rooms[r]&&i<100); return r;}
function assignColor(r) { const u=r.players.map(p=>p.color); return PLAYER_COLORS.find(c=>!u.includes(c))||'#fff'; }

// --- SERVIDOR ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const CLIENT_DIR = path.join(__dirname, 'public');
app.use(express.static(CLIENT_DIR));

const TIEMPO_TURNO = 15 * 1000;
const TIEMPO_VOTACION = 120 * 1000;
const rooms = {};
const socketRoom = {};

function emitRoomState(room) {
    if (!room) return;
    const now = Date.now();
    let timeLeft = 0;
    if (room.phase === 'palabras' && room.turnDeadline) timeLeft = Math.max(0, Math.ceil((room.turnDeadline - now) / 1000));
    else if (room.phase === 'votacion' && room.voteDeadline) timeLeft = Math.max(0, Math.ceil((room.voteDeadline - now) / 1000));

    io.to(room.code).emit('roomState', {
        roomCode: room.code, hostId: room.hostId, phase: room.phase, turnIndex: room.turnIndex,
        timeLeft: timeLeft, discordLink: room.discordLink,
        players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, hasVoted: !!room.votes[p.id] }))
    });
}

function nextTurn(room) {
    if(room.timer) clearTimeout(room.timer);
    const allSpoken = room.players.every(p => room.spoken[p.id]);
    if(allSpoken){ startVoting(room); return; }
    let next = room.turnIndex, loops=0;
    do { next = (next+1)%room.players.length; loops++; } while(room.spoken[room.players[next].id] && loops < room.players.length);
    room.turnIndex = next; room.turnDeadline = Date.now() + TIEMPO_TURNO;
    room.timer = setTimeout(()=>{ if(room.players[room.turnIndex]) room.spoken[room.players[room.turnIndex].id]=true; nextTurn(room); }, TIEMPO_TURNO);
    emitRoomState(room);
}

function startVoting(room) { 
    if(room.timer) clearTimeout(room.timer);
    room.phase='votacion'; room.voteDeadline=Date.now()+TIEMPO_VOTACION; room.votes={};
    io.to(room.code).emit('votingStarted'); emitRoomState(room);
    room.timer = setTimeout(()=>finishVoting(room, 'Tiempo agotado'), TIEMPO_VOTACION);
}

function finishVoting(room, reason) {
    if(room.timer) clearTimeout(room.timer);
    const tally={}; Object.values(room.votes).forEach(v=>{if(v)tally[v]=(tally[v]||0)+1});
    let kicked=null, max=0; for(const[id,c] of Object.entries(tally)){if(c>max){max=c;kicked=room.players.find(p=>p.id===id)}};
    
    let isImpostor=false, gameResult=null;
    if(kicked){
        isImpostor=(room.roles[kicked.id]==='impostor');
        room.players=room.players.filter(p=>p.id!==kicked.id);
        delete room.roles[kicked.id]; delete socketRoom[kicked.id]; delete room.spoken[kicked.id];
        const imp=room.players.filter(p=>room.roles[p.id]==='impostor').length;
        const cit=room.players.filter(p=>room.roles[p.id]==='ciudadano').length;
        if(imp===0) gameResult='citizensWin'; else if(imp>=cit) gameResult='impostorsWin';
    }
    io.to(room.code).emit('votingResults', {reason, kickedPlayer: kicked?{name:kicked.name}:null, isImpostor, gameResult});
    
    if(gameResult) { room.phase='lobby'; room.spoken={}; room.votes={}; setTimeout(()=>emitRoomState(room), 5000); }
    else { room.phase='palabras'; room.turnIndex=-1; room.spoken={}; room.votes={}; setTimeout(()=>{if(rooms[room.code])nextTurn(room)}, 5000); }
}

// --- SOCKETS ---
io.on('connection', (socket) => {
    socket.on('createRoom', async (data, cb) => {
        const code = generateCode();
        let maxP = Math.min(parseInt(data.maxPlayers)||10, 15);
        let discordData = {voiceId:null, inviteLink:null};
        if(DISCORD_TOKEN) { const r = await crearCanalDiscord(code, maxP); if(r) discordData=r; }

        const room = {
            code, hostId: socket.id, maxPlayers: maxP, impostors: parseInt(data.impostors)||2,
            categories: data.categories || [],
            players: [{ id: socket.id, name: data.name||'Host', color: PLAYER_COLORS[0] }],
            phase: 'lobby', turnIndex: -1, roles: {}, spoken: {}, votes: {},
            discordVoiceChannel: discordData.voiceId, discordLink: discordData.inviteLink
        };
        rooms[code] = room; socketRoom[socket.id] = code; socket.join(code);
        cb({ok: true, roomCode: code, me: {id:socket.id}, isHost: true, discordLink: discordData.inviteLink});
        emitRoomState(room);
    });

    socket.on('joinRoom', (data, cb) => {
        const code = (data.roomCode||'').toUpperCase(); const room = rooms[code];
        if(room) {
            if(room.players.length >= room.maxPlayers) return cb({ok:false, error:'Sala llena'});
            if(room.players.some(p=>p.name.toUpperCase()===data.name.toUpperCase())) return cb({ok:false, error:'Nombre en uso'});
            
            socket.join(code); socketRoom[socket.id] = code;
            room.players.push({id:socket.id, name:data.name, color:assignColor(room)});
            room.spoken[socket.id]=false;
            cb({ok:true, roomCode: code, me: {id:socket.id}, isHost: false, discordLink: room.discordLink});
            emitRoomState(room);
        } else cb({ok:false, error:'Sala no existe'});
    });

    socket.on('startRound', () => {
        const room = getRoomOfSocket(socket.id);
        if(room && room.hostId === socket.id) {
            const shuffled = [...room.players].sort(()=>0.5-Math.random());
            const impIds = shuffled.slice(0, room.impostors).map(p=>p.id);
            const word = getRandomWord(room.categories);

            const impNames = shuffled.filter(p => impIds.includes(p.id)).map(p => p.name);

            room.roles = {};
            room.players.forEach(p => {
                const role = impIds.includes(p.id) ? 'impostor' : 'ciudadano';
                room.roles[p.id] = role;
                const teammates = role === 'impostor' ? impNames.filter(n => n !== p.name) : [];
                io.to(p.id).emit('yourRole', { role, word: role==='ciudadano'?word:null, teammates });
                room.spoken[p.id] = false;
            });
            room.phase = 'lectura'; emitRoomState(room);
            setTimeout(()=>{ if(rooms[room.code]){ room.phase='palabras'; room.turnIndex=-1; nextTurn(room); }}, 7000);
        }
    });

    socket.on('submitVote', (data) => {
        const room = getRoomOfSocket(socket.id);
        if(room && room.phase === 'votacion') {
            room.votes[socket.id] = data.targetId;
            emitRoomState(room);
            if(Object.keys(room.votes).length >= room.players.length) finishVoting(room, 'Todos votaron');
        }
    });

    socket.on('disconnect', () => {
        const room=getRoomOfSocket(socket.id); if(room){
            room.players=room.players.filter(p=>p.id!==socket.id); delete socketRoom[socket.id];
            if(room.players.length===0){
                if(room.timer)clearTimeout(room.timer); if(room.discordVoiceChannel)borrarCanalDiscord(room.discordVoiceChannel); delete rooms[room.code];
            } else { if(room.hostId===socket.id)room.hostId=room.players[0].id; emitRoomState(room); }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));