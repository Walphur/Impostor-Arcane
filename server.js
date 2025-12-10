require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 

const PLAYER_COLORS = ['#00ff41', '#008F11', '#003B00', '#ADFF2F', '#32CD32', '#98FB98', '#00FA9A', '#7FFFD4', '#66CDAA', '#2E8B57', '#20B2AA', '#5F9EA0'];

// --- BASE DE DATOS MASIVA (50 Palabras por cat) ---
const WORD_DB = {
    lugares: [
        'CINE', 'PLAYA', 'HOSPITAL', 'ESCUELA', 'AEROPUERTO', 'GIMNASIO', 'BIBLIOTECA', 'ESTADIO', 'SUPERMERCADO', 'BANCO',
        'ZOOLÓGICO', 'MUSEO', 'PARQUE', 'IGLESIA', 'RESTAURANTE', 'HOTEL', 'FARMACIA', 'ESTACIÓN DE POLICÍA', 'BOMBEROS', 'CORREO',
        'DISCOTECA', 'CEMENTERIO', 'CÁRCEL', 'UNIVERSIDAD', 'GASOLINERA', 'LAVANDERÍA', 'PELUQUERÍA', 'CENTRO COMERCIAL', 'CASINO', 'CIRCO',
        'TEATRO', 'ACUARIO', 'OBSERVATORIO', 'PLANETARIO', 'BOLERA', 'PISTA DE HIELO', 'PARQUE DE DIVERSIONES', 'SPA', 'SAUNA', 'CAMPING',
        'GRANJA', 'FARO', 'PUERTO', 'ESTACIÓN DE TREN', 'METRO', 'SUBMARINO', 'NAVE ESPACIAL', 'CUEVA', 'VOLCÁN', 'ISLA DESIERTA'
    ],
    comidas: [
        'PIZZA', 'HAMBURGUESA', 'SUSHI', 'PASTA', 'ENSALADA', 'TACOS', 'HELADO', 'CHOCOLATE', 'PANQUEQUES', 'HUEVO FRITO',
        'POLLO ASADO', 'BIFE', 'EMPANADAS', 'SOPA', 'ARROZ', 'CEREAL', 'YOGUR', 'FRUTILLA', 'MANZANA', 'BANANA',
        'NARANJA', 'UVA', 'SANDÍA', 'MELÓN', 'PIÑA', 'KIWI', 'DURAZNO', 'PERA', 'CEREZA', 'LIMÓN',
        'PAPAS FRITAS', 'NACHOS', 'POCHOCLOS', 'GALLETITAS', 'TORTA', 'BROWNIE', 'ALFAJOR', 'MEDIALUNA', 'TOSTADA', 'SÁNDWICH',
        'HOT DOG', 'LASAÑA', 'RAVIOLES', 'ÑOQUIS', 'MILANESA', 'GUISO', 'LENTEJAS', 'GARBANZOS', 'ATÚN', 'SALMÓN'
    ],
    objetos: [
        'TELÉFONO', 'COMPUTADORA', 'TELEVISOR', 'RELOJ', 'CÁMARA', 'AURICULARES', 'LINTERNA', 'LLAVES', 'BILLETERA', 'ANTEOJOS',
        'MOCHILA', 'LIBRO', 'CUADERNO', 'LÁPIZ', 'BIROME', 'TIJERAS', 'CUCHILLO', 'TENEDOR', 'CUCHARA', 'PLATO',
        'VASO', 'TAZA', 'BOTELLA', 'SARTÉN', 'OLLA', 'LICUADORA', 'TOSTADORA', 'MICROONDAS', 'HELADERA', 'LAVARROPAS',
        'PLANCHA', 'SECADOR DE PELO', 'CEPILLO DE DIENTES', 'PEINE', 'JABÓN', 'TOALLA', 'SÁBANA', 'ALMOHADA', 'COLCHÓN', 'SILLA',
        'MESA', 'SILLÓN', 'CAMA', 'ARMARIO', 'ESPEJO', 'LÁMPARA', 'VENTILADOR', 'AIRE ACONDICIONADO', 'ESTUFA', 'ALFOMBRA'
    ],
    animales: [
        'PERRO', 'GATO', 'LEÓN', 'TIGRE', 'ELEFANTE', 'JIRAFA', 'MONO', 'OSO', 'LOBO', 'ZORRO',
        'CONEJO', 'RATÓN', 'HÁMSTER', 'CABALLO', 'VACA', 'CERDO', 'OVEJA', 'CABRA', 'GALLINA', 'PATO',
        'PAVO', 'PINGÜINO', 'ÁGUILA', 'LORA', 'BÚHO', 'PALOMA', 'GAVIOTA', 'DELFÍN', 'BALLENA', 'TIBURÓN',
        'PULPO', 'CANGREJO', 'TORTUGA', 'SERPIENTE', 'COCODRILO', 'RANA', 'SAPO', 'ARAÑA', 'ESCORPIÓN', 'MARIPOSA',
        'ABEJA', 'HORMIGA', 'MOSCA', 'MOSQUITO', 'GUSANO', 'CARACOL', 'CANGURO', 'KOALA', 'PANDA', 'ZEBRA'
    ],
    profesiones: [
        'MÉDICO', 'ENFERMERO', 'PROFESOR', 'POLICÍA', 'BOMBERO', 'ABOGADO', 'JUEZ', 'INGENIERO', 'ARQUITECTO', 'PROGRAMADOR',
        'DISEÑADOR', 'ARTISTA', 'MÚSICO', 'ACTOR', 'CANTANTE', 'BAILARÍN', 'ESCRITOR', 'PERIODISTA', 'FOTÓGRAFO', 'COCINERO',
        'CAMARERO', 'PANADERO', 'CARNICERO', 'VERDULERO', 'MECÁNICO', 'ELECTRICISTA', 'PLOMERO', 'CARPINTERO', 'ALBAÑIL', 'PINTOR',
        'JARDINERO', 'AGRICULTOR', 'PESCADOR', 'PILOTO', 'AZAFATA', 'CONDUCTOR', 'TAXISTA', 'CAMIONERO', 'CARTERO', 'BIBLIOTECARIO',
        'CIENTÍFICO', 'ASTRONAUTA', 'ASTRÓNOMO', 'ARQUEÓLOGO', 'PSICÓLOGO', 'DENTISTA', 'VETERINARIO', 'PELUQUERO', 'MAQUILLADOR', 'MODELO'
    ],
    cine: [
        'TITANIC', 'AVATAR', 'STAR WARS', 'JURASSIC PARK', 'MATRIX', 'EL SEÑOR DE LOS ANILLOS', 'HARRY POTTER', 'AVENGERS', 'SPIDERMAN', 'BATMAN',
        'SUPERMAN', 'WONDER WOMAN', 'FLASH', 'AQUAMAN', 'IRON MAN', 'CAPITÁN AMÉRICA', 'THOR', 'HULK', 'BLACK PANTHER', 'DOCTOR STRANGE',
        'GUARDIANES DE LA GALAXIA', 'DEADPOOL', 'X-MEN', 'LOGAN', 'JOKER', 'EL PADRINO', 'SCARFACE', 'PULP FICTION', 'KILL BILL', 'FORREST GUMP',
        'EL REY LEÓN', 'TOY STORY', 'SHREK', 'FROZEN', 'BUSCANDO A NEMO', 'LOS INCREÍBLES', 'COCO', 'UP', 'WALL-E', 'RATATOUILLE',
        'MONSTERS INC', 'CARS', 'ALADDIN', 'LA BELLA Y LA BESTIA', 'LA SIRENITA', 'CENICIENTA', 'BLANCANIEVES', 'PINOCHO', 'DUMBO', 'BAMBI'
    ]
};

// ... (Resto de funciones auxiliares igual)
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

// --- FIX DEL BUG DE VOTACION AQUÍ ---
function nextTurn(room) {
    if(room.timer) clearTimeout(room.timer);
    
    // Verificar si todos hablaron
    const living = room.players.filter(p => !p.isDead);
    const allSpoken = living.every(p => room.spoken[p.id]);
    
    if(allSpoken){ 
        startVoting(room); 
        return; 
    }

    // Calcular siguiente turno
    let next = room.turnIndex;
    let attempts = 0;
    do { 
        next = (next+1) % room.players.length; 
        attempts++;
    } while(
        (room.spoken[room.players[next].id] || room.players[next].isDead) && 
        attempts < room.players.length * 2
    );

    // Seguridad: Si después de buscar no encontramos a nadie, forzamos votación
    if(attempts >= room.players.length * 2) {
        startVoting(room);
        return;
    }

    room.turnIndex = next; 
    room.turnDeadline = Date.now() + room.config.turnTime;
    
    // Timer del turno
    room.timer = setTimeout(()=>{ 
        // Si se acaba el tiempo, marcamos como hablado y pasamos
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
    
    // IMPORTANTE: Emitir estado INMEDIATAMENTE para forzar el cambio de pantalla en el cliente
    emitRoomState(room); 
    
    room.timer = setTimeout(()=>finishVoting(room, 'Tiempo agotado'), room.config.voteTime);
}

function finishVoting(room, reason) {
    if(room.timer) clearTimeout(room.timer);
    const tally = {};
    Object.values(room.votes).forEach(v => { if(v) tally[v] = (tally[v]||0)+1; });
    let max = 0; let candidates = [];
    for (const [id, count] of Object.entries(tally)) { if (count > max) { max = count; candidates = [id]; } else if (count === max) { candidates.push(id); } }
    let kicked = null;
    if (candidates.length === 1) kicked = room.players.find(p => p.id === candidates[0]);

    let isImpostor = false; let gameResult = null;
    if (kicked) {
        isImpostor = (room.roles[kicked.id] === 'impostor');
        const pIdx = room.players.findIndex(p => p.id === kicked.id);
        if (pIdx !== -1) room.players[pIdx].isDead = true; 
        const livImp = room.players.filter(p => !p.isDead && room.roles[p.id]==='impostor').length;
        const livCit = room.players.filter(p => !p.isDead && room.roles[p.id]==='ciudadano').length;
        if(livImp === 0) gameResult = 'citizensWin'; else if(livImp >= livCit) gameResult = 'impostorsWin';
    }

    const realImpostorsList = room.players.filter(p => room.roles[p.id] === 'impostor').map(p => p.name);
    const realImpostorNameStr = realImpostorsList.length > 0 ? realImpostorsList.join(', ') : 'N/A';

    io.to(room.code).emit('votingResults', { 
        reason, kickedPlayer: kicked?{name:kicked.name}:null, isImpostor, gameResult,
        secretWord: room.secretWord, realImpostorName: realImpostorNameStr
    });
    
    if(gameResult) { 
        room.phase = 'lobby'; 
        room.players.forEach(p => p.isDead = false);
        setTimeout(() => emitRoomState(room), 5000); 
    } else { 
        // Reiniciar ronda de palabras
        room.phase = 'palabras'; room.turnIndex = -1; room.spoken = {}; room.votes = {}; 
        setTimeout(() => { 
            if(rooms[room.code]) {
                // Empezar turno aleatorio de nuevo
                 const livingIndices = room.players.map((p, index) => index).filter(i => !room.players[i].isDead);
                 if(livingIndices.length > 0) {
                     room.turnIndex = livingIndices[Math.floor(Math.random() * livingIndices.length)];
                 } else { room.turnIndex = 0; } // Fallback
                 nextTurn(room); 
            }
        }, 4000); 
    }
}

io.on('connection', (socket) => {
    socket.on('createRoom', (data, cb) => {
        const code = generateCode();
        let maxP = Math.min(parseInt(data.maxPlayers)||10, 15);
        let discordLink = null; 
        const room = {
            code, hostId: socket.id, maxPlayers: maxP, impostors: parseInt(data.impostors)||2,
            categories: data.categories || [],
            config: { turnTime: (parseInt(data.turnTime)||15)*1000, voteTime: (parseInt(data.voteTime)||120)*1000 },
            players: [{ id: socket.id, name: data.name||'Host', color: PLAYER_COLORS[0], isDead: false }],
            phase: 'lobby', turnIndex: -1, roles: {}, spoken: {}, votes: {}, secretWord: null, discordLink
        };
        rooms[code] = room; socketRoom[socket.id] = code; socket.join(code);
        cb({ok: true, roomCode: code, me: {id:socket.id}, isHost: true, discordLink});
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

            const allPlayers = [...room.players];
            const shuffled = shuffleArray(allPlayers);
            const impIds = shuffled.slice(0, room.impostors).map(p => p.id);
            
            room.secretWord = getRandomWord(room.categories);
            const impNames = room.players.filter(p => impIds.includes(p.id)).map(p => p.name);

            room.roles = {};
            room.players.forEach(p => {
                const role = impIds.includes(p.id) ? 'impostor' : 'ciudadano';
                room.roles[p.id] = role;
                const teammates = role === 'impostor' ? impNames.filter(n => n !== p.name) : [];
                io.to(p.id).emit('yourRole', { role, word: role==='ciudadano'?room.secretWord:null, teammates });
                room.spoken[p.id] = false;
            });
            
            room.phase = 'lectura'; 
            emitRoomState(room);
            
            setTimeout(()=>{ 
                if(rooms[room.code]){ 
                    room.phase='palabras'; 
                    const citizenIndices = room.players.map((p, index) => ({ index, id: p.id })).filter(item => room.roles[item.id] === 'ciudadano').map(item => item.index);
                    if(citizenIndices.length > 0) {
                        const randomIdx = Math.floor(Math.random() * citizenIndices.length);
                        room.turnIndex = citizenIndices[randomIdx];
                    } else { room.turnIndex = 0; }
                    nextTurn(room); 
                } 
            }, 7000);
        }
    });

    socket.on('finishTurn', () => { const r = getRoomOfSocket(socket.id); if(r && r.phase==='palabras' && r.players[r.turnIndex]?.id===socket.id) { r.spoken[socket.id]=true; nextTurn(r); } });
    socket.on('submitVote', (d) => { const r=getRoomOfSocket(socket.id); if(r && r.phase==='votacion' && !r.players.find(x=>x.id===socket.id).isDead) { r.votes[socket.id]=d.targetId; emitRoomState(r); if(Object.keys(r.votes).length >= r.players.filter(x=>!x.isDead).length) finishVoting(r, 'Todos votaron'); } });
    socket.on('disconnect', () => {
        const room = getRoomOfSocket(socket.id);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            delete socketRoom[socket.id];
            if (room.players.length === 0) delete rooms[room.code];
            else { if (room.hostId === socket.id) room.hostId = room.players[0].id; emitRoomState(room); }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor listo ${PORT}`));