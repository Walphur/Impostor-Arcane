const socket = io();

// REFERENCIAS DOM
const lobbyOverlay=document.getElementById('lobbyOverlay'), mainContent=document.getElementById('mainContent'), phasePill=document.getElementById('phasePill'), roomCodeDisplay=document.getElementById('roomCodeDisplay'), playersListEl=document.getElementById('playersList'), votingGrid=document.getElementById('votingGrid');
const viewCard=document.getElementById('viewCard'), viewTurn=document.getElementById('viewTurn'), viewVoting=document.getElementById('viewVoting');
const turnPlayerName=document.getElementById('turnPlayerName'), turnTimerDisplay=document.getElementById('turnTimerDisplay'), turnAvatar=document.querySelector('.turn-avatar-circle'), roleDisplay=document.getElementById('roleDisplay'), wordDisplay=document.getElementById('wordDisplay'), teammateDisplay=document.getElementById('teammateDisplay'), ejectionOverlay=document.getElementById('ejectionOverlay');
const btnStart=document.getElementById('btnStartRound'), btnSkip=document.getElementById('btnSkipVote'), btnFinishTurn=document.getElementById('btnFinishTurn'), btnDiscordManual=document.getElementById('btnDiscordManual');
const gameBoard = document.querySelector('.game-board');
const voteCounter = document.getElementById('voteCounter');

let myId=null, isHost=false, localTimer=null, selectedVoteId=null, isMyPlayerDead=false, currentDiscordLink=null;

// --- TABS ---
document.getElementById('tabCreate').onclick=(e)=>switchTab(e,'panelCreate'); document.getElementById('tabJoin').onclick=(e)=>switchTab(e,'panelJoin');
function switchTab(e,pid){ document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); document.getElementById('panelCreate').style.display=pid==='panelCreate'?'block':'none'; document.getElementById('panelJoin').style.display=pid==='panelJoin'?'block':'none'; }

// --- CREAR/UNIRSE ---
document.getElementById('btnCreateRoom').onclick=()=>{
    const checkboxes = document.querySelectorAll('.cat-grid input[type="checkbox"]:checked');
    const categories = Array.from(checkboxes).map(cb => cb.value);
    const hostName = document.getElementById('hostName').value || 'Host';
    const isLocal = document.getElementById('localMode').checked; // MODO LOCAL

    socket.emit('createRoom', { 
        name: hostName, 
        maxPlayers: document.getElementById('maxPlayers').value, 
        impostors: document.getElementById('impostors').value, 
        categories: categories,
        isLocal: isLocal
    }, handleConnection);
};

document.getElementById('btnJoinRoom').onclick=()=>{ 
    socket.emit('joinRoom', { 
        name: document.getElementById('joinName').value || 'Player', 
        roomCode: document.getElementById('joinCode').value 
    }, handleConnection); 
};

function handleConnection(res){ 
    if(res.ok){ 
        lobbyOverlay.style.display='none'; 
        mainContent.classList.remove('blurred'); 
        myId=res.me.id; 
        isHost=res.isHost; 
        roomCodeDisplay.innerText=res.roomCode; 
        
        // Manejo de Link Discord
        if(res.discordLink) {
            currentDiscordLink = res.discordLink;
            btnDiscordManual.style.display = 'flex'; // Mostrar botón manual
            window.open(res.discordLink, '_blank');  // Intentar abrir auto
        } else {
            btnDiscordManual.style.display = 'none'; // Modo local
        }
    } else { alert(res.error); } 
}

// Botón Manual Discord (Para iPhone/Bloqueadores)
btnDiscordManual.onclick = () => {
    if(currentDiscordLink) window.open(currentDiscordLink, '_blank');
};

// --- GAME LOGIC ---
btnStart.onclick=()=>socket.emit('startRound');
btnFinishTurn.onclick=()=>socket.emit('finishTurn'); // NUEVO BOTÓN

btnSkip.onclick=()=>{ 
    if(isMyPlayerDead) return;
    socket.emit('submitVote', {targetId:null}); 
    btnSkip.innerText="ESPERANDO..."; 
    btnSkip.disabled=true; 
};

socket.on('roomState', (room)=>{ 
    const me = room.players.find(p => p.id === myId);
    if(me && me.isDead) isMyPlayerDead = true;
    
    // Actualizar contador votos
    if(room.votesInfo) voteCounter.innerText = `VOTOS: ${room.votesInfo.current} / ${room.votesInfo.total}`;

    updateHeader(room); 
    renderSidebar(room); 
    updateGameView(room); 
});

socket.on('yourRole', (data)=>{
    const card=document.querySelector('.secret-card'); teammateDisplay.style.display='none';
    if(data.role==='impostor'){ 
        roleDisplay.innerText='ERES EL IMPOSTOR'; wordDisplay.innerText='???'; 
        card.style.background='linear-gradient(135deg, #020617, #7f1d1d)'; 
        if(data.teammates&&data.teammates.length>0){teammateDisplay.style.display='block';teammateDisplay.innerText=`ALIADO: ${data.teammates.join(', ')}`;} 
    } else { 
        roleDisplay.innerText='CIUDADANO'; wordDisplay.innerText=data.word; 
        card.style.background='linear-gradient(135deg, #f97316, #9f1239)'; 
    }
});

socket.on('votingResults', (data)=>{
    ejectionOverlay.style.display='flex';
    const t=document.getElementById('ejectedName'), s=document.getElementById('ejectedRole');
    if(data.kickedPlayer){ 
        t.innerText=`${data.kickedPlayer.name} fue expulsado.`; 
        s.innerText=data.isImpostor?"ERA EL IMPOSTOR":"ERA INOCENTE"; 
        s.className=data.isImpostor?"eject-subtitle impostor-text":"eject-subtitle innocent-text"; 
    } else { t.innerText="Nadie fue expulsado."; s.innerText="SKIP / EMPATE"; s.className="eject-subtitle"; }
    
    if(data.gameResult){ 
        setTimeout(()=>{ 
            t.innerText="JUEGO TERMINADO"; 
            s.innerText=data.gameResult==='citizensWin'?"¡VICTORIA CIUDADANA!":"¡VICTORIA IMPOSTORA!"; 
            s.className=data.gameResult==='citizensWin'?"eject-subtitle innocent-text":"eject-subtitle impostor-text"; 
        },2000); 
    }
    setTimeout(()=>{ ejectionOverlay.style.display='none'; btnSkip.innerText="SALTAR VOTO"; btnSkip.disabled=false; },5000);
});

function renderSidebar(room){
    playersListEl.innerHTML='';
    room.players.forEach(p=>{
        const c=document.createElement('div'); c.className='player-card'; c.style.borderLeftColor=p.color;
        if(p.isDead) c.classList.add('dead');
        else if(room.phase==='palabras'&&room.players[room.turnIndex]?.id===p.id) c.classList.add('talking');
        let status=''; if(room.phase==='votacion'&&p.hasVoted) status='✅'; if(p.isDead) status='💀';
        c.innerHTML=`<div class="p-avatar" style="background:${p.color}"></div><div class="p-name">${p.name} ${p.id===myId?'(Tú)':''}</div><div class="p-status">${status}</div>`;
        playersListEl.appendChild(c);
    });
}

function updateGameView(room){
    if(room.phase==='votacion') gameBoard.classList.add('voting-mode'); else gameBoard.classList.remove('voting-mode');

    if(room.phase==='lectura'){ showView(viewCard); document.querySelector('.secret-card').style.transform="scale(1.1)"; roleDisplay.innerText="¡MIRA TU ROL!"; stopLocalTimer(); return; }
    
    if(room.phase==='votacion'){ 
        document.querySelector('.secret-card').style.transform="scale(1)"; 
        showView(viewVoting); 
        renderVotingGrid(room.players); 
        stopLocalTimer(); 
        return; 
    }
    
    if(room.phase==='palabras'){ 
        document.querySelector('.secret-card').style.transform="scale(1)"; 
        const ap=room.players[room.turnIndex]; 
        if(ap){ 
            showView(viewTurn); 
            turnPlayerName.innerText=ap.name; turnPlayerName.style.color=ap.color; turnAvatar.style.borderColor=ap.color; 
            startLocalTimer(room.timeLeft); 
            // Botón Terminar Turno solo para mí
            btnFinishTurn.style.display = (ap.id === myId) ? 'block' : 'none';
        } 
        return; 
    }
    document.querySelector('.secret-card').style.transform="scale(1)"; showView(viewCard); stopLocalTimer();
}

function renderVotingGrid(players){
    votingGrid.innerHTML='';
    players.forEach(p=>{
        if(p.isDead || p.id===myId) return; // Ni muertos ni yo mismo
        const c=document.createElement('div'); c.className='vote-card';
        if(selectedVoteId===p.id) c.classList.add('selected');
        c.innerHTML=`<div class="vote-avatar" style="background:${p.color}">👤</div><div class="vote-name">${p.name}</div>`;
        c.onclick=()=>{ 
            if(isMyPlayerDead) return;
            document.querySelectorAll('.vote-card').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); selectedVoteId=p.id; socket.emit('submitVote', {targetId:p.id}); 
        };
        votingGrid.appendChild(c);
    });
}

function updateHeader(room){ 
    phasePill.innerText=room.phase.toUpperCase(); 
    if(room.phase==='lobby'){ btnStart.style.display='block'; btnSkip.style.display='none'; if(isHost&&room.players.length>=3){btnStart.disabled=false; btnStart.style.opacity='1';}else{btnStart.disabled=true; btnStart.style.opacity='0.5';} }
    else if(room.phase==='votacion'){ btnStart.style.display='none'; btnSkip.style.display='block'; if(isMyPlayerDead){btnSkip.innerText="ESTÁS MUERTO"; btnSkip.disabled=true;} }
    else{ btnStart.style.display='block'; btnStart.disabled=true; btnSkip.style.display='none'; } 
}

function showView(el){ [viewCard, viewTurn, viewVoting].forEach(v=>v.style.display='none'); el.style.display='block'; }
function startLocalTimer(s){ stopLocalTimer(); turnTimerDisplay.innerText=s; localTimer=setInterval(()=>{ s--; if(s<0)s=0; turnTimerDisplay.innerText=s; if(s===0)stopLocalTimer(); },1000); }
function stopLocalTimer(){ if(localTimer)clearInterval(localTimer); }