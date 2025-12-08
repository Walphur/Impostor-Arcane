// ==========================================
// FUNCIONALIDAD BOTÓN COPIAR CÓDIGO
// ==========================================
const btnCopyCode = document.getElementById('btnCopyCode');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyIconDefault = document.getElementById('copyIconDefault');
const copyIconSuccess = document.getElementById('copyIconSuccess');

if (btnCopyCode && roomCodeDisplay) {
    btnCopyCode.addEventListener('click', () => {
        const code = roomCodeDisplay.textContent;
        
        // Usar la API del portapapeles
        navigator.clipboard.writeText(code).then(() => {
            // Éxito: Mostrar icono de check
            copyIconDefault.style.display = 'none';
            copyIconSuccess.style.display = 'block';

            // Volver al icono original después de 2 segundos
            setTimeout(() => {
                copyIconSuccess.style.display = 'none';
                copyIconDefault.style.display = 'block';
            }, 2000);
        }).catch(err => {
            console.error('Error al copiar el código:', err);
            // Opcional: Mostrar un pequeño error visual si falla
        });
    });
}