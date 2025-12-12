// Importamos la referencia a AdMob (esto funcionará cuando esté en el celular)
// Asegúrate de cargar este script DESPUÉS de cargar capacitor.js si lo usas, 
// o simplemente inclúyelo en tu HTML.

const AdMob = window.Capacitor ? window.Capacitor.Plugins.AdMob : null;

// TUS CÓDIGOS
const ADMOB_IDS = {
    intersticial: 'ca-app-pub-6788680373227341/8374567976', // El que sale pantalla completa
    bonificado: 'ca-app-pub-6788680373227341/4416794053'   // El de premio
};

// 1. INICIALIZAR ADMOB (Poner esto al iniciar el juego, ej: en window.onload)
async function iniciarAdMob() {
    if (!AdMob) return; // Si estamos en PC, no hace nada
    try {
        await AdMob.initialize({
            requestTrackingAuthorization: true, // Para iOS
            testingDevices: ['TU_ID_DE_DISPOSITIVO_SI_QUIERES_PROBAR'], // Opcional
            initializeForTesting: true, // Pon true mientras pruebas, false cuando subas a tienda
        });
        console.log("AdMob Iniciado");
    } catch (e) {
        console.error("Error iniciando AdMob", e);
    }
}

// 2. MOSTRAR INTERSTICIAL (Llamar a esta función cuando termina la partida)
async function mostrarIntersticial() {
    if (!AdMob) return;
    try {
        // Preparamos el anuncio
        await AdMob.prepareInterstitial({
            adId: ADMOB_IDS.intersticial, 
            isTesting: true // ¡IMPORTANTE! Pon false cuando subas la app real
        });
        // Lo mostramos
        await AdMob.showInterstitial();
    } catch (e) {
        console.error("Error mostrando intersticial", e);
    }
}

// 3. MOSTRAR BONIFICADO (Llamar cuando el usuario toca el candado de una categoría)
// Recibe el nombre de la categoría que quiere desbloquear
async function mirarAnuncioParaDesbloquear(categoriaNombre) {
    if (!AdMob) {
        alert("Los anuncios solo funcionan en la App móvil.");
        return;
    }

    try {
        // 1. Preparamos el video
        await AdMob.prepareRewardVideoAd({
            adId: ADMOB_IDS.bonificado,
            isTesting: true // ¡IMPORTANTE! Pon false cuando subas la app real
        });

        // 2. Mostramos el video y esperamos el resultado
        const rewardItem = await AdMob.showRewardVideoAd();

        // 3. Si llega aquí, es que vio el video. ¡Damos el premio!
        console.log("Video visto. Recompensa:", rewardItem);
        desbloquearCategoriaLogica(categoriaNombre); // <--- ESTA ES TU FUNCIÓN
        
    } catch (e) {
        console.error("Fallo al ver el video o lo cerró antes", e);
        alert("Debes ver el video completo para desbloquear la categoría.");
    }
}

// --- TU LÓGICA DEL JUEGO (Ejemplo) ---
function desbloquearCategoriaLogica(nombre) {
    // Aquí pones tu código para quitar el candado visualmente y permitir jugar
    alert("¡Felicidades! Has desbloqueado la categoría: " + nombre + " por esta partida.");
    
    // Ejemplo: buscar el botón y quitarle la clase 'bloqueado'
    // document.getElementById('btn-' + nombre).classList.remove('bloqueado');
}