document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. INICIALIZACIÓN
    // ==========================================
    const socket = io();
    
    // SISTEMA DE SONIDOS (Protegido contra errores si faltan archivos)
    const audioFiles = {
        click: new Audio('sounds/click-345983.mp3'),
        join: new Audio('sounds/new-notification-019-363747.mp3'), 
        start: new Audio('sounds/game-start-317318.mp3'),
        eject: new Audio('sounds/fatal-body-fall-thud-352716.mp3'),
        win: new Audio('sounds/level-up-04-243762.mp3')
    };

    function playSound(name) {
        try {
            if(audioFiles[name]) {
                audioFiles[name].currentTime = 0; 
                audioFiles[name].volume = 0.5;    
                const playPromise = audioFiles[name].play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // Silenciar error si falta el archivo o el navegador bloquea
                        // console.log("Audio no reproducido (falta archivo o interacción usuario)");
                    });
                }
            }
        } catch(e) { console.error("Error audio:", e); }
    }

    // ELEMENTOS DOM
    const screenHome = document.getElementById('screenHome');
    const screenCreate = document.getElementById('screenCreate');
    const screenJoin = document.getElementById('screenJoin');
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const mainContent = document.getElementById('mainContent');
    
    // MODALES
    const modalCats = document.getElementById('modalCategories');
    const btnOpenCats = document.getElementById('btnOpenCategories');
    const btnCloseCats = document.getElementById('btnCloseCategories');
    const catCountLabel = document.getElementById('catCount');
    const ejectionOverlay = document.getElementById('ejectionOverlay');

    // JUEGO INTERNO
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const playersListEl = document.getElementById('playersList');
    const votingGrid = document.getElementById('votingGrid');
    const viewCard = document.getElementById('viewCard');
    const viewTurn = document.getElementById('viewTurn');
    const viewVoting = document.getElementById('viewVoting');
    
    const turnPlayerName = document.getElementById('turnPlayerName');
    const turnTimerDisplay = document.getElementById('turnTimerDisplay');
    const turnAvatar = document.querySelector('.turn-avatar-circle');
    const roleDisplay = document.getElementById('roleDisplay');
    const wordDisplay = document.getElementById('wordDisplay');
    const teammateDisplay = document.getElementById('teammateDisplay');
    const voteCounter = document.getElementById('voteCounter');
    const votingTimer = document.getElementById('votingTimer');

    // BOTONES DE ACCIÓN
    const btnStart = document.getElementById('btnStartRound');
    const btnSkip = document.getElementById('btnSkipVote');
    const btnFinishTurn = document.getElementById('btnFinishTurn');
    const btnDiscordManual = document.getElementById('btnDiscordManual');
    const btnExit = document.getElementById('btnExit');

    let myId = null;
    let isHost = false;
    let localTimer = null;
    let selectedVoteId = null;
    let isMyPlayerDead = false;
    let currentDiscordLink = null;

    // ==========================================
    // 2. NAVEGACIÓN Y MENÚS
    // ==========================================
    
    function showScreen(screenName) {
        playSound('click');
        screenHome.style.display = 'none';
        screenCreate.style.display = 'none';
        screenJoin.style.display = 'none';

        if(screenName === 'home') screenHome.style.display = 'flex';
        if(screenName === 'create') screenCreate.style.display = 'flex';
        if(screenName === 'join') screenJoin.style.display = 'flex';
    }

    // Vinculación de botones del menú
    const btnGoCreate = document.getElementById('btnGoCreate');
    if(btnGoCreate) btnGoCreate.onclick = () => showScreen('create');

    const btnGoJoin = document.getElementById('btnGoJoin');
    if(btnGoJoin) btnGoJoin.onclick = () => showScreen('join');

    const backFromCreate = document.getElementById('backFromCreate');
    if(backFromCreate) backFromCreate.onclick = () => showScreen('home');

    const backFromJoin = document.getElementById('backFromJoin');
    if(backFromJoin) backFromJoin.onclick = () => showScreen('home');


    // Lógica Modal Categorías
    if(btnOpenCats) btnOpenCats.onclick = () => { playSound('click'); modalCats.style.display = 'flex'; };
    if(btnCloseCats) btnCloseCats.onclick = () => { 
        playSound('click'); 
        modalCats.style.display = 'none'; 
        const count = document.querySelectorAll('.cat-chip input:checked').length;
        if(catCountLabel) catCountLabel.innerText = count;
    };

    // Botón Copiar Código
    const btnCopyCode = document.getElementById('btnCopyCode');
    if(btnCopyCode) btnCopyCode.onclick = () => {
        playSound('click');
        const code = roomCodeDisplay.innerText;
        navigator.clipboard.writeText(code).then(() => {
            const originalHTML = btnCopyCode.innerHTML;
            btnCopyCode.innerHTML = '✅'; 
            btnCopyCode.style.color = '#22c55e';
            setTimeout(() => {
                btnCopyCode.innerHTML = originalHTML;
                btnCopyCode.style.color = '';
            }, 1500);
        }).catch(err => { console.error('Error al copiar:', err); });
    };
    
    // Checkbox Modo Grupal (Clickeable en todo el botón)
    const localModeBtn = document.querySelector('.local-mode-btn');
    const localModeInput = document.getElementById('localMode');
    if(localModeBtn && localModeInput) {
        localModeBtn.addEventListener('click', (e) => {
            if (e.target !== localModeInput) {
                localModeInput.checked = !localModeInput.checked;
            }
        });
    }

    // ==========================================
    // 3. SOCKETS: CREAR Y UNIRSE
    // ==========================================

    const btnCreateRoom = document.getElementById('btnCreateRoom');
    if(btnCreateRoom) btnCreateRoom.onclick = () => {
        playSound('click');
        const checkboxes = document.querySelectorAll('.cat-chip input[type="checkbox"]:checked');
        const categories = Array.from(checkboxes).map(cb => cb.value);
        
        if(categories.length === 0) return alert("¡Elige al menos una categoría!");

        const hostNameEl = document.getElementById('hostName');
        const maxPlayersEl = document.getElementById('maxPlayers');
        const impostorsEl = document.getElementById('impostors');
        const turnTimeEl = document.getElementById('timeTurn');
        const voteTimeEl = document.getElementById('timeVote');
        const localModeEl = document.getElementById('localMode');

        if(!hostNameEl) return alert("Error: Faltan elementos en el DOM.");
        
        console.log("Enviando createRoom...");

        socket.emit('createRoom', { 
            name: hostNameEl.value || 'Host', 
            maxPlayers: maxPlayersEl.value, 
            impostors: impostorsEl.value, 
            categories: categories,
            isLocal: localModeEl ? localModeEl.checked : false,
            turnTime: turnTimeEl ? turnTimeEl.value : 15, 
            voteTime: voteTimeEl ? voteTimeEl.value : 120
        }, handleConnection);
    };

    const btnJoinRoom = document.getElementById('btnJoinRoom');
    if(btnJoinRoom) btnJoinRoom.onclick = () => { 
        playSound('click');
        const nameEl = document.getElementById('joinName');
        const codeEl = document.getElementById('joinCode');
        
        console.log("Enviando joinRoom...");
        
        socket.emit('joinRoom', { 
            name: nameEl.value || 'Player', 
            roomCode: codeEl.value 
        }, handleConnection); 
    };

    // Callback de conexión exitosa
    function handleConnection(res){ 
        console.log("Respuesta servidor:", res);
        if(res.ok){ 
            playSound('join'); 
            lobbyOverlay.style.display='none'; 
            mainContent.style.display='block'; 
            setTimeout(() => {
                mainContent.classList.remove('blurred');
            }, 50); 
            
            myId = res.me.id; 
            isHost = res.isHost; 
            roomCodeDisplay.innerText = res.roomCode; 
            
            // MANEJO DE DISCORD
            if(res.discordLink) { 
                currentDiscordLink = res.discordLink; 
                btnDiscordManual.style.display = 'flex'; 
                // Intentar abrir, pero si el navegador bloquea, el botón manual está ahí.
                const newWin = window.open(res.discordLink, '_blank'); 
                if(!newWin || newWin.closed || typeof newWin.closed=='undefined') {
                    console.log("Popup bloqueado, usar botón manual");
                }
            } else { 
                btnDiscordManual.style.display = 'none'; 
            }
        } else { 
            alert(res.error || "Error al conectar"); 
        } 
    }

    if(btnDiscordManual) btnDiscordManual.onclick = () => { 
        playSound('click'); 
        if(currentDiscordLink) window.open(currentDiscordLink, '_blank'); 
    };

    if(btnExit) btnExit.onclick = () => { 
        playSound('click'); 
        if(confirm("¿Salir de la sala?")) location.reload(); 
    };

    // ==========================================
    // 4. LÓGICA DE JUEGO (SOCKET EVENTS)
    // ==========================================

    if(btnStart) btnStart.onclick = () => { playSound('click'); socket.emit('startRound'); };
    if(btnFinishTurn) btnFinishTurn.onclick = () => { playSound('click'); socket.emit('finishTurn'); };
    
    if(btnSkip) btnSkip.onclick = () => { 
        if(isMyPlayerDead) return; 
        playSound('click');
        socket.emit('submitVote', {targetId:null}); 
        btnSkip.innerText="ESPERANDO..."; 
        btnSkip.disabled=true; 
    };

    socket.on('roomState', (room) => { 
        const me = room.players.find(p => p.id === myId);
        if(me) isMyPlayerDead = me.isDead || false;
        
        if(room.votesInfo && voteCounter) {
            voteCounter.innerText = `VOTOS: ${room.votesInfo.current} / ${room.votesInfo.total}`;
        }
        
        updateHeader(room); 
        renderSidebar(room); 
        updateGameView(room); 
    });

    socket.on('yourRole', (data) => {
        playSound('start'); 
        const card = document.querySelector('.secret-card'); 
        teammateDisplay.style.display='none';
        
        if(data.role === 'impostor'){ 
            roleDisplay.innerText = 'ERES EL IMPOSTOR'; 
            wordDisplay.innerText = 'ERES EL IMPOSTOR'; 
            wordDisplay.classList.add('impostor-word');
            if(data.teammates && data.teammates.length > 0){
                teammateDisplay.style.display = 'block';
                teammateDisplay.innerText = `ALIADO: ${data.teammates.join(', ')}`;
            } 
        } else { 
            roleDisplay.innerText = 'CIUDADANO'; 
            wordDisplay.innerText = data.word; 
            wordDisplay.classList.remove('impostor-word');
        }
    });

    socket.on('votingResults', (data) => {
        if(data.gameResult) playSound('win'); 
        else playSound('eject');

        ejectionOverlay.style.display = 'flex';
        const t = document.getElementById('ejectedName');
        const s = document.getElementById('ejectedRole');
        
        if(data.kickedPlayer){ 
            t.innerText = `${data.kickedPlayer.name} fue expulsado.`; 
            s.innerText = data.isImpostor ? "ERA EL IMPOSTOR" : "ERA INOCENTE"; 
            s.className = data.isImpostor ? "eject-subtitle impostor-text" : "eject-subtitle innocent-text"; 
        } else { 
            t.innerText = "Nadie fue expulsado."; 
            s.innerText = "SKIP / EMPATE"; 
            s.className = "eject-subtitle"; 
        }
        
        if(data.gameResult){ 
            setTimeout(() => { 
                t.innerText = "JUEGO TERMINADO"; 
                s.innerText = data.gameResult === 'citizensWin' ? "¡VICTORIA CIUDADANA!" : "¡VICTORIA IMPOSTORA!"; 
                s.className = data.gameResult === 'citizensWin' ? "eject-subtitle innocent-text" : "eject-subtitle impostor-text"; 
            }, 2000); 
        }
        
        setTimeout(() => { 
            ejectionOverlay.style.display = 'none'; 
            btnSkip.innerText = "SALTAR VOTO"; 
            btnSkip.disabled = false; 
        }, 5000);
    });

    // ==========================================
    // 5. FUNCIONES DE RENDERIZADO
    // ==========================================

    function renderSidebar(room){
        playersListEl.innerHTML = '';
        room.players.forEach(p => {
            const c = document.createElement('div'); 
            c.className = 'player-card'; 
            c.style.borderLeftColor = p.color;
            
            if(p.isDead) c.classList.add('dead');
            else if(room.phase === 'palabras' && room.players[room.turnIndex]?.id === p.id) c.classList.add('talking');
            
            let status = ''; 
            if(room.phase === 'votacion' && p.hasVoted) status = '✅'; 
            if(p.isDead) status = '💀';
            
            c.innerHTML = `<div class="p-avatar" style="background:${p.color}"></div>
                           <div class="p-name">${p.name} ${p.id === myId ? '(Tú)' : ''}</div>
                           <div class="p-status">${status}</div>`;
            playersListEl.appendChild(c);
        });
    }

    function updateGameView(room){
        if(room.phase === 'votacion') gameBoard.classList.add('voting-mode'); 
        else gameBoard.classList.remove('voting-mode');
        
        if(room.phase === 'lectura'){ 
            showView(viewCard); 
            document.querySelector('.secret-card').style.transform="scale(1.1)"; 
            roleDisplay.innerText="¡MIRA TU ROL!"; 
            stopLocalTimer(); 
            return; 
        }
        
        if(room.phase === 'votacion'){ 
            document.querySelector('.secret-card').style.transform="scale(1)"; 
            showView(viewVoting); 
            renderVotingGrid(room.players); 
            startLocalTimer(room.timeLeft, 'vote'); 
            return; 
        }
        
        if(room.phase === 'palabras'){ 
            document.querySelector('.secret-card').style.transform="scale(1)"; 
            const ap = room.players[room.turnIndex]; 
            if(ap){ 
                showView(viewTurn); 
                turnPlayerName.innerText = ap.name; 
                turnPlayerName.style.color = ap.color; 
                turnAvatar.style.borderColor = ap.color; 
                startLocalTimer(room.timeLeft, 'turn'); 
                
                if(ap.id === myId) {
                    btnFinishTurn.style.display = 'block';
                    // Pequeña alerta de sonido si es tu turno
                    if(room.timeLeft > (document.getElementById('timeTurn')?.value - 1) || 14) playSound('join'); 
                } else {
                    btnFinishTurn.style.display = 'none'; 
                }
            } 
            return; 
        }
        
        document.querySelector('.secret-card').style.transform="scale(1)"; 
        showView(viewCard); 
        stopLocalTimer();
    }

    function renderVotingGrid(players){
        votingGrid.innerHTML = '';
        players.forEach(p => {
            if(p.isDead || p.id === myId) return;
            const c = document.createElement('div'); 
            c.className = 'vote-card';
            if(selectedVoteId === p.id) c.classList.add('selected');
            
            c.innerHTML = `<div class="vote-avatar" style="background:${p.color}">👤</div>
                           <div class="vote-name">${p.name}</div>`;
            
            c.onclick = () => { 
                if(isMyPlayerDead) return; 
                playSound('click'); 
                document.querySelectorAll('.vote-card').forEach(x => x.classList.remove('selected')); 
                c.classList.add('selected'); 
                selectedVoteId = p.id; 
                socket.emit('submitVote', { targetId: p.id }); 
            };
            votingGrid.appendChild(c);
        });
    }

    function updateHeader(room){ 
        const phaseLabel = document.getElementById('phasePill');
        if(phaseLabel) phaseLabel.innerText = room.phase.toUpperCase();

        if(room.phase === 'lobby'){ 
            btnStart.style.display = 'block'; 
            btnSkip.style.display = 'none'; 
            
            if(isHost && room.players.length >= 3){
                btnStart.disabled = false; 
                btnStart.style.opacity = '1';
            } else {
                btnStart.disabled = true; 
                btnStart.style.opacity = '0.5';
            } 
        }
        else if(room.phase === 'votacion'){ 
            btnStart.style.display = 'none'; 
            btnSkip.style.display = 'block'; 
            if(isMyPlayerDead){
                btnSkip.innerText = "ESTÁS MUERTO"; 
                btnSkip.disabled = true;
            } 
        }
        else { 
            btnStart.style.display = 'block'; 
            btnStart.disabled = true; 
            btnSkip.style.display = 'none'; 
        } 
    }

    function showView(el){ 
        [viewCard, viewTurn, viewVoting].forEach(v => v.style.display='none'); 
        el.style.display='block'; 
    }

    function startLocalTimer(s, type){ 
        stopLocalTimer(); 
        updateTimerDisplay(s, type); 
        localTimer = setInterval(() => { 
            s--; 
            if(s < 0) s = 0; 
            updateTimerDisplay(s, type); 
            if(s === 0) stopLocalTimer(); 
        }, 1000); 
    }

    function updateTimerDisplay(s, type) { 
        if(type === 'vote' && votingTimer) { 
            votingTimer.innerText = s + "s"; 
            if(s <= 10) votingTimer.classList.add('danger'); 
            else votingTimer.classList.remove('danger'); 
        } else if(turnTimerDisplay) { 
            turnTimerDisplay.innerText = s; 
        } 
    }

    function stopLocalTimer(){ 
        if(localTimer) clearInterval(localTimer); 
    }

});