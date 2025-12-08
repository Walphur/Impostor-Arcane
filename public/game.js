document.addEventListener('DOMContentLoaded', () => {
    
    // --- REFERENCIAS A PANTALLAS ---
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const screenHome = document.getElementById('screenHome');
    const screenCreate = document.getElementById('screenCreate');
    const screenJoin = document.getElementById('screenJoin');
    const mainContent = document.getElementById('mainContent');
    
    // --- REFERENCIAS A BOTONES MENÚ ---
    const btnGoCreate = document.getElementById('btnGoCreate');
    const btnGoJoin = document.getElementById('btnGoJoin');
    const backFromCreate = document.getElementById('backFromCreate');
    const backFromJoin = document.getElementById('backFromJoin');
    
    // --- REFERENCIAS A BOTONES DE ACCIÓN (LOS QUE FALLABAN) ---
    const btnCreateRoom = document.getElementById('btnCreateRoom'); // Botón rojo iniciar
    const btnJoinRoom = document.getElementById('btnJoinRoom');     // Botón verde entrar
    
    // --- REFERENCIAS DENTRO DEL JUEGO (LOBBY) ---
    const btnExit = document.getElementById('btnExit');           // Volver del lobby al menú
    const btnDiscordManual = document.getElementById('btnDiscordManual');

    // ======================================================
    // 1. SISTEMA DE NAVEGACIÓN (CAMBIO DE PANTALLAS)
    // ======================================================

    function switchScreen(fromScreen, toScreen) {
        // Ocultar pantalla actual con animación
        fromScreen.classList.remove('fade-in');
        fromScreen.style.opacity = '0';
        fromScreen.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            fromScreen.style.display = 'none';
            toScreen.style.display = 'flex'; 
            
            // Mostrar nueva pantalla
            setTimeout(() => {
                toScreen.style.opacity = '1';
                toScreen.style.transform = 'scale(1)';
                toScreen.classList.add('fade-in');
            }, 50);
        }, 300);
    }

    // Funcionalidad Botones Menú Principal
    if(btnGoCreate) btnGoCreate.addEventListener('click', () => switchScreen(screenHome, screenCreate));
    if(btnGoJoin) btnGoJoin.addEventListener('click', () => switchScreen(screenHome, screenJoin));
    if(backFromCreate) backFromCreate.addEventListener('click', () => switchScreen(screenCreate, screenHome));
    if(backFromJoin) backFromJoin.addEventListener('click', () => switchScreen(screenJoin, screenHome));

    // ======================================================
    // 2. ENTRAR AL JUEGO (SIMULACIÓN VISUAL)
    // ======================================================
    // Nota: Aquí iría tu lógica de Socket.io. Por ahora solo mostramos la pantalla.

    function enterGameUI() {
        // Ocultar todo el overlay de menús
        lobbyOverlay.style.opacity = '0';
        setTimeout(() => {
            lobbyOverlay.style.display = 'none';
            
            // Mostrar el juego (quitar borrosidad)
            mainContent.style.display = 'block';
            setTimeout(() => {
                mainContent.classList.remove('blurred');
            }, 50);
        }, 300);
    }

    function exitGameUI() {
        // Volver a poner borroso el juego
        mainContent.classList.add('blurred');
        
        setTimeout(() => {
            mainContent.style.display = 'none';
            
            // Mostrar menú de nuevo
            lobbyOverlay.style.display = 'flex';
            setTimeout(() => {
                lobbyOverlay.style.opacity = '1';
                // Resetear al Home
                screenCreate.style.display = 'none';
                screenJoin.style.display = 'none';
                screenHome.style.display = 'flex';
                screenHome.style.opacity = '1';
                screenHome.style.transform = 'scale(1)';
            }, 50);
        }, 500);
    }

    // --- ACTIVAR BOTONES "INICIAR JUEGO" Y "ENTRAR" ---
    if(btnCreateRoom) {
        btnCreateRoom.addEventListener('click', () => {
            console.log("Creando sala..."); 
            // AQUÍ IRÍA: socket.emit('createRoom', data);
            enterGameUI(); // Forzamos la entrada visual para probar
        });
    }

    if(btnJoinRoom) {
        btnJoinRoom.addEventListener('click', () => {
            console.log("Uniéndose...");
            // AQUÍ IRÍA: socket.emit('joinRoom', data);
            enterGameUI(); // Forzamos la entrada visual para probar
        });
    }

    // --- BOTÓN VOLVER (DENTRO DEL LOBBY) ---
    if(btnExit) {
        btnExit.addEventListener('click', () => {
            // Confirmación opcional
            if(confirm("¿Seguro que quieres salir al menú principal?")) {
                exitGameUI();
            }
        });
    }
    
    // --- BOTÓN DISCORD ---
    if(btnDiscordManual) {
        btnDiscordManual.addEventListener('click', () => {
            window.open('https://discord.gg/TU_INVITACION', '_blank');
        });
    }

    // ======================================================
    // 3. EXTRAS (COPIAR CÓDIGO Y CHECKBOX)
    // ======================================================
    
    // Checkbox Modo Grupal
    const localModeBtn = document.querySelector('.local-mode-btn');
    const localModeInput = document.getElementById('localMode');
    if(localModeBtn && localModeInput) {
        localModeBtn.addEventListener('click', (e) => {
            if (e.target !== localModeInput) {
                localModeInput.checked = !localModeInput.checked;
            }
        });
    }

    // Botón Copiar Código
    const btnCopyCode = document.getElementById('btnCopyCode');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const copyIconDefault = document.getElementById('copyIconDefault');
    const copyIconSuccess = document.getElementById('copyIconSuccess');

    if (btnCopyCode && roomCodeDisplay) {
        btnCopyCode.addEventListener('click', () => {
            const code = roomCodeDisplay.textContent;
            navigator.clipboard.writeText(code).then(() => {
                if(copyIconDefault && copyIconSuccess) {
                    copyIconDefault.style.display = 'none';
                    copyIconSuccess.style.display = 'block';
                    setTimeout(() => {
                        copyIconSuccess.style.display = 'none';
                        copyIconDefault.style.display = 'block';
                    }, 2000);
                }
            });
        });
    }
});