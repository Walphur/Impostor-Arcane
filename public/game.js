document.addEventListener('DOMContentLoaded', () => {
    
    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    const screenHome = document.getElementById('screenHome');
    const screenCreate = document.getElementById('screenCreate');
    const screenJoin = document.getElementById('screenJoin');
    
    const btnGoCreate = document.getElementById('btnGoCreate');
    const btnGoJoin = document.getElementById('btnGoJoin');
    
    const backFromCreate = document.getElementById('backFromCreate');
    const backFromJoin = document.getElementById('backFromJoin');

    // --- FUNCIÓN PARA CAMBIAR PANTALLAS (TRANSICIÓN SUAVE) ---
    function switchScreen(fromScreen, toScreen) {
        // 1. Desvanecer la pantalla actual
        fromScreen.classList.remove('fade-in');
        fromScreen.style.opacity = '0';
        fromScreen.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            // 2. Ocultar la actual y mostrar la nueva
            fromScreen.style.display = 'none';
            toScreen.style.display = 'flex'; // Usamos flex para mantener el centrado
            
            // 3. Pequeña pausa para que el navegador procese el display:flex
            setTimeout(() => {
                toScreen.style.opacity = '1';
                toScreen.style.transform = 'scale(1)';
                toScreen.classList.add('fade-in');
            }, 50);
        }, 300); // Espera 300ms (lo que dura la transición CSS)
    }

    // --- EVENTOS DE LOS BOTONES (¡AQUÍ ESTÁ LA MAGIA!) ---

    // Botón: Ir a Crear Sala
    if(btnGoCreate) {
        btnGoCreate.addEventListener('click', () => {
            switchScreen(screenHome, screenCreate);
        });
    }

    // Botón: Ir a Unirse a Sala
    if(btnGoJoin) {
        btnGoJoin.addEventListener('click', () => {
            switchScreen(screenHome, screenJoin);
        });
    }

    // Botón: Volver desde Crear
    if(backFromCreate) {
        backFromCreate.addEventListener('click', () => {
            switchScreen(screenCreate, screenHome);
        });
    }

    // Botón: Volver desde Unirse
    if(backFromJoin) {
        backFromJoin.addEventListener('click', () => {
            switchScreen(screenJoin, screenHome);
        });
    }

    // --- LÓGICA DEL BOTÓN COPIAR CÓDIGO ---
    const btnCopyCode = document.getElementById('btnCopyCode');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const copyIconDefault = document.getElementById('copyIconDefault');
    const copyIconSuccess = document.getElementById('copyIconSuccess');

    if (btnCopyCode && roomCodeDisplay) {
        btnCopyCode.addEventListener('click', () => {
            const code = roomCodeDisplay.textContent;
            if(code === '---') return; // No copiar si no hay código

            navigator.clipboard.writeText(code).then(() => {
                copyIconDefault.style.display = 'none';
                copyIconSuccess.style.display = 'block';
                setTimeout(() => {
                    copyIconSuccess.style.display = 'none';
                    copyIconDefault.style.display = 'block';
                }, 2000);
            }).catch(err => console.error('Error al copiar:', err));
        });
    }

    // --- LÓGICA DE CHECKBOX "MODO GRUPAL" ---
    const localModeBtn = document.querySelector('.local-mode-btn');
    const localModeInput = document.getElementById('localMode');
    if(localModeBtn && localModeInput) {
        localModeBtn.addEventListener('click', (e) => {
            if (e.target !== localModeInput) {
                localModeInput.checked = !localModeInput.checked;
            }
        });
    }
    
    // Aquí iría el resto de tu lógica de Socket.io
    // ...
});