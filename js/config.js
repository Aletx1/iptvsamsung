/**
 * Configuración de la aplicación IPTV para LG WebOS
 * 
 * Este archivo centraliza toda la configuración de la aplicación, especialmente
 * la relacionada con el servidor IPTV y los formatos de stream.
 * 
 * IMPORTANTE: Para cambiar entre HLS y MPEGTS, modifica SERVER.ACTIVE_PROFILE
 * o SERVER.OUTPUT_FORMAT según se explica más abajo.
 */

const CONFIG = {
    // ============================================================================
    // CONFIGURACIÓN DEL REPRODUCTOR - CRÍTICO PARA VIDEO
    // ============================================================================
    PLAYER: {
        // Usar reproductor nativo de webOS (funciona sin HLS.js)
        // webOS tiene excelente soporte nativo para HLS, no necesita HLS.js
        FORCE_HLSJS_ALWAYS: false,
        
        // Usar reproductor embebido tipo VLC (con mejor soporte de codecs)
        // Si está en true, usa un reproductor embebido más robusto que maneja mejor los codecs
        // Esto asegura video + audio en lugar de solo audio
        USE_EMBEDDED_VLC_MODE: false,
        
        // Configuración del reproductor embebido - AGRESIVA
        EMBEDDED: {
            // Forzar uso de HLS.js siempre (mejor soporte de codecs)
            FORCE_HLSJS: false,
            
            // Configuración ULTRA agresiva de codecs
            // Prioriza codecs compatibles y fuerza transcodificación si es necesario
            AGGRESSIVE_CODEC_HANDLING: true,
            
            // Timeout para detección de codec (ms) - más rápido para detectar problemas
            CODEC_DETECTION_TIMEOUT: 3000,
            
            // Reintentos automáticos si detecta solo audio - SIEMPRE activo
            AUTO_RETRY_ON_AUDIO_ONLY: true,
            
            // Máximo de reintentos - aumentar para más oportunidades
            MAX_CODEC_RETRIES: 8,
            
            // Intentar todos los niveles disponibles si uno falla
            TRY_ALL_LEVELS_ON_FAILURE: true,
            
            // Verificación continua de video (cada 2 segundos)
            CONTINUOUS_VIDEO_CHECK: true,
            
            // Forzar nivel específico si está disponible (null = automático)
            FORCE_LEVEL: null, // null = automático, o número de nivel (0, 1, 2, etc.)
            
            // Priorizar codec H.264 siempre
            PRIORITIZE_H264: true,
            
            // Si detecta solo audio, cambiar inmediatamente de nivel
            IMMEDIATE_LEVEL_SWITCH_ON_AUDIO_ONLY: true
        }
    },
    
    // ============================================================================
    // CONFIGURACIÓN DEL SERVIDOR IPTV
    // ============================================================================
    SERVER: {
        // URL base del servidor IPTV (Xtream Codes API)
        BASE_URL: 'http://iptv.ctvc.cl:80',
        
        // ------------------------------------------------------------------------
        // FORMATO DE PLAYLIST
        // ------------------------------------------------------------------------
        // Define el formato de la lista de reproducción (playlist) que se descarga
        // del servidor. Esto afecta qué metadatos incluye la playlist.
        //
        // Opciones disponibles (Xtream Codes):
        // - 'm3u': Formato M3U estándar (básico, sin metadatos adicionales)
        // - 'm3u_plus': Formato M3U Plus (recomendado, incluye logos, categorías, etc.)
        // - 'simple': Formato simple (solo URLs y nombres)
        // - 'webtvlist': Formato webTV (optimizado para aplicaciones web)
        //
        // RECOMENDACIÓN: Usar 'm3u_plus' para máxima compatibilidad y metadatos completos
        PLAYLIST_FORMAT: 'm3u_plus',
        
        // ------------------------------------------------------------------------
        // FORMATO DE SALIDA DE STREAM
        // ------------------------------------------------------------------------
        // Define cómo el servidor entrega los streams de video/audio.
        // Esto es CRÍTICO para la compatibilidad con webOS.
        //
        // Opciones disponibles:
        // - 'hls': HTTP Live Streaming (recomendado para webOS)
        //   - Ventajas: Mejor compatibilidad con webOS, streaming adaptativo
        //   - Desventajas: Puede tener problemas con algunos codecs
        //   - Uso: Funciona bien con reproductor nativo de webOS
        //
        // - 'mpegts': MPEG Transport Stream directo
        //   - Ventajas: Mejor soporte de codecs, más robusto para video+audio
        //   - Desventajas: Requiere HLS.js en webOS (no funciona nativo)
        //   - Uso: Si HLS da problemas de "solo audio", probar MPEGTS
        //
        // IMPORTANTE: Si cambias esto, algunos canales pueden no cargar o dar solo audio.
        // Si experimentas problemas, prueba alternar entre 'hls' y 'mpegts'.
        OUTPUT_FORMAT: 'hls',
        
        // ------------------------------------------------------------------------
        // PERFILES DE COMPATIBILIDAD WEBOS
        // ------------------------------------------------------------------------
        // Perfiles predefinidos que combinan formato de playlist y output
        // para diferentes escenarios de compatibilidad en webOS.
        //
        // Cómo usar:
        // 1. Para usar un perfil predefinido, establece SERVER.ACTIVE_PROFILE
        // 2. O modifica directamente PLAYLIST_FORMAT y OUTPUT_FORMAT arriba
        //
        // Si cambias ACTIVE_PROFILE, los valores de PLAYLIST_FORMAT y OUTPUT_FORMAT
        // se sobrescriben automáticamente con los del perfil seleccionado.
        PROFILES: {
            // Perfil recomendado para webOS (HLS con metadatos completos)
            // - Funciona bien en la mayoría de modelos webOS
            // - Usa reproductor nativo cuando es posible
            // - Si algunos canales dan "solo audio", probar WEBOS_MPEGTS_DIRECT
            WEBOS_HLS_COMPAT: {
                name: 'webOS HLS Compatible',
                description: 'HLS con metadatos completos - Recomendado para webOS',
                playlistFormat: 'm3u_plus',
                outputFormat: 'hls',
                notes: [
                    'Mejor compatibilidad con reproductor nativo de webOS',
                    'Funciona bien en modelos webOS 3.0+',
                    'Si algunos canales dan solo audio, probar WEBOS_MPEGTS_DIRECT'
                ]
            },
            
            // Perfil alternativo para problemas de codec (MPEGTS directo)
            // - Usa MPEGTS que es más robusto para codecs
            // - Requiere HLS.js (se usa automáticamente)
            // - Útil cuando HLS da problemas de "solo audio"
            WEBOS_MPEGTS_DIRECT: {
                name: 'webOS MPEGTS Direct',
                description: 'MPEGTS directo - Para problemas de codec con HLS',
                playlistFormat: 'm3u_plus',
                outputFormat: 'mpegts',
                notes: [
                    'Mejor soporte de codecs (asegura video + audio)',
                    'Requiere HLS.js (se activa automáticamente)',
                    'Útil si HLS da problemas de "solo audio"',
                    'Puede tener mayor latencia que HLS'
                ]
            },
            
            // Perfil básico (sin metadatos)
            // - Más ligero pero sin logos ni categorías
            // - Útil para conexiones lentas
            BASIC_HLS: {
                name: 'Básico HLS',
                description: 'HLS básico sin metadatos - Más ligero',
                playlistFormat: 'm3u',
                outputFormat: 'hls',
                notes: [
                    'Playlist más ligera (sin logos ni categorías)',
                    'Útil para conexiones lentas',
                    'Menos información visual en la interfaz'
                ]
            }
        },
        
        // ------------------------------------------------------------------------
        // PERFIL ACTIVO
        // ------------------------------------------------------------------------
        // Perfil de compatibilidad que se está usando actualmente.
        // 
        // Opciones:
        // - 'WEBOS_HLS_COMPAT': Recomendado (por defecto)
        // - 'WEBOS_MPEGTS_DIRECT': Si HLS da problemas de "solo audio"
        // - 'BASIC_HLS': Para conexiones lentas
        // - null: Usar valores directos de PLAYLIST_FORMAT y OUTPUT_FORMAT
        //
        // CÓMO CAMBIAR:
        // 1. Cambia este valor a uno de los perfiles arriba
        // 2. O establece a null y modifica PLAYLIST_FORMAT y OUTPUT_FORMAT directamente
        //
        // TROUBLESHOOTING:
        // - Si algunos canales no cargan: Probar 'WEBOS_MPEGTS_DIRECT'
        // - Si algunos canales dan solo audio: Probar 'WEBOS_MPEGTS_DIRECT'
        // - Si todo funciona bien: Mantener 'WEBOS_HLS_COMPAT'
        ACTIVE_PROFILE: 'WEBOS_HLS_COMPAT', // HLS para compatibilidad nativa en webOS
        
        // ------------------------------------------------------------------------
        // CONSTRUCCIÓN DE URL (LEGACY - Se mantiene para compatibilidad)
        // ------------------------------------------------------------------------
        // NOTA: Este campo se genera automáticamente basado en PLAYLIST_FORMAT,
        // OUTPUT_FORMAT y ACTIVE_PROFILE. No modificar directamente.
        // Usar buildPlaylistUrl() en su lugar (ver más abajo).
        PLAYLIST_PATH: null // Se genera automáticamente
    },

    // ============================================================================
    // LOGS Y DIAGNÓSTICO
    // ============================================================================
    DEBUG: {
        // URL de endpoint para subir logs (POST). Ej: webhook.site
        // Dejar vacío si no se usa.
        LOG_UPLOAD_URL: 'http://192.168.1.148:8088/logs',
        LOG_UPLOAD_TIMEOUT: 10000,
        LOG_UPLOAD_MAX_CHARS: 20000
    },
    
    // ============================================================================
    // CONFIGURACIÓN DE TIEMPOS DE ESPERA
    // ============================================================================
    TIMEOUTS: {
        SPLASH: 3000,           // Duración del splash screen
        CONTROLS_HIDE: 10000,   // Tiempo para ocultar controles del reproductor
        CHANNEL_INPUT: 2000,    // Tiempo para confirmar entrada de número de canal
        REQUEST: 30000          // Timeout para peticiones HTTP
    },
    
    // ============================================================================
    // CONFIGURACIÓN DE LA GRILLA DE CANALES
    // ============================================================================
    GRID: {
        COLUMNS: 5,             // Número de columnas en la grilla
        PAGE_SIZE: 25           // Canales por página (para lazy loading)
    },
    
    // ============================================================================
    // CALIDADES DE VIDEO DISPONIBLES
    // ============================================================================
    QUALITY: {
        AUTO:   { label: 'Automático',       bitrate: -1 },
        LOW:    { label: 'Baja (360p)',      bitrate: 800000 },
        MEDIUM: { label: 'Media (480p)',     bitrate: 1500000 },
        HIGH:   { label: 'Alta (720p)',      bitrate: 3000000 },
        ULTRA:  { label: 'Ultra (1080p)',    bitrate: 6000000 }
    },
    
    // ============================================================================
    // TECLAS DEL CONTROL REMOTO LG WEBOS
    // ============================================================================
    // Códigos estándar HbbTV/CE-HTML para navegación y control
    KEYS: {
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        OK: 13,             // Alias para ENTER
        BACK: 461,          // Tecla Back de LG WebOS
        RETURN: 10009,      // Tecla Return alternativa
        EXIT: 1001,         // Tecla Exit de LG (no estándar)
        
        // Números (teclado numérico del control remoto)
        NUM_0: 48,
        NUM_1: 49,
        NUM_2: 50,
        NUM_3: 51,
        NUM_4: 52,
        NUM_5: 53,
        NUM_6: 54,
        NUM_7: 55,
        NUM_8: 56,
        NUM_9: 57,
        
        // Teclas de color (estándar HbbTV)
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406,
        
        // Control de canales
        CHANNEL_UP: 427,
        CHANNEL_DOWN: 428,
        
        // Reproducción (estándar media keys)
        PLAY: 415,
        PAUSE: 19,
        PLAY_PAUSE: 10252,  // Tecla combinada Play/Pause
        STOP: 413,
        REWIND: 412,
        FAST_FORWARD: 417,
        PREVIOUS: 10232,    // Track anterior
        NEXT: 10233,        // Track siguiente
        
        // Navegación adicional
        INFO: 457,
        GUIDE: 458,
        MENU: 18,
        HOME: 36
    },
    
    // ============================================================================
    // ALMACENAMIENTO LOCAL
    // ============================================================================
    STORAGE_KEYS: {
        CREDENTIALS: 'iptv_credentials',
        PLAYLIST: 'iptv_playlist',
        FAVORITES: 'iptv_favorites',
        LAST_CHANNEL: 'iptv_last_channel',
        QUALITY: 'iptv_quality',
        ACTIVE_SESSION: 'iptv_active_session'
    }
};

// ============================================================================
// INICIALIZACIÓN Y HELPERS
// ============================================================================

/**
 * Aplica el perfil activo a la configuración del servidor
 * Si ACTIVE_PROFILE está definido, sobrescribe PLAYLIST_FORMAT y OUTPUT_FORMAT
 */
function applyActiveProfile() {
    if (CONFIG.SERVER.ACTIVE_PROFILE && CONFIG.SERVER.PROFILES[CONFIG.SERVER.ACTIVE_PROFILE]) {
        const profile = CONFIG.SERVER.PROFILES[CONFIG.SERVER.ACTIVE_PROFILE];
        CONFIG.SERVER.PLAYLIST_FORMAT = profile.playlistFormat;
        CONFIG.SERVER.OUTPUT_FORMAT = profile.outputFormat;
        console.log(`Perfil activo: ${profile.name} - ${profile.description}`);
        if (profile.notes && profile.notes.length > 0) {
            console.log('Notas del perfil:', profile.notes);
        }
    }
}

/**
 * Construye la URL completa de la playlist
 * 
 * @param {string} username - Usuario del servidor IPTV
 * @param {string} password - Contraseña del servidor IPTV
 * @returns {string} URL completa de la playlist
 * 
 * @example
 * const url = buildPlaylistUrl('usuario123', 'pass456');
 * // Retorna: 'http://iptv.ctvc.cl:80/playlist/usuario123/pass456/m3u_plus?output=hls'
 */
function buildPlaylistUrl(username, password) {
    if (!username || !password) {
        throw new Error('buildPlaylistUrl: username y password son requeridos');
    }
    
    // Aplicar perfil activo si existe
    applyActiveProfile();
    
    const baseUrl = CONFIG.SERVER.BASE_URL;
    const playlistFormat = CONFIG.SERVER.PLAYLIST_FORMAT;
    const outputFormat = CONFIG.SERVER.OUTPUT_FORMAT;
    
    // Construir path según formato Xtream Codes
    // Formato: /playlist/{username}/{password}/{playlist_format}?output={output_format}
    const path = `/playlist/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${playlistFormat}?output=${outputFormat}`;
    
    const fullUrl = baseUrl + path;
    
    // Guardar en PLAYLIST_PATH para compatibilidad hacia atrás
    CONFIG.SERVER.PLAYLIST_PATH = path.replace(
        encodeURIComponent(username), 
        '{username}'
    ).replace(
        encodeURIComponent(password), 
        '{password}'
    );
    
    return fullUrl;
}

/**
 * Obtiene información del perfil activo
 * 
 * @returns {Object|null} Información del perfil activo o null si no hay perfil
 */
function getActiveProfileInfo() {
    if (CONFIG.SERVER.ACTIVE_PROFILE && CONFIG.SERVER.PROFILES[CONFIG.SERVER.ACTIVE_PROFILE]) {
        return CONFIG.SERVER.PROFILES[CONFIG.SERVER.ACTIVE_PROFILE];
    }
    return null;
}

/**
 * Cambia el perfil activo
 * 
 * @param {string} profileName - Nombre del perfil a activar
 * @returns {boolean} true si el perfil se cambió correctamente
 * 
 * @example
 * setActiveProfile('WEBOS_MPEGTS_DIRECT');
 */
function setActiveProfile(profileName) {
    if (!CONFIG.SERVER.PROFILES[profileName]) {
        console.error(`Perfil no encontrado: ${profileName}`);
        console.log('Perfiles disponibles:', Object.keys(CONFIG.SERVER.PROFILES));
        return false;
    }
    
    CONFIG.SERVER.ACTIVE_PROFILE = profileName;
    applyActiveProfile();
    console.log(`Perfil cambiado a: ${profileName}`);
    return true;
}

// Aplicar perfil activo al cargar el módulo
applyActiveProfile();

// Exportar helpers al objeto CONFIG para acceso global
CONFIG.buildPlaylistUrl = buildPlaylistUrl;
CONFIG.getActiveProfileInfo = getActiveProfileInfo;
CONFIG.setActiveProfile = setActiveProfile;
CONFIG.applyActiveProfile = applyActiveProfile;

// Hacer CONFIG global
window.CONFIG = CONFIG;

// Log inicial de configuración
console.log('CONFIG inicializado:', {
    baseUrl: CONFIG.SERVER.BASE_URL,
    playlistFormat: CONFIG.SERVER.PLAYLIST_FORMAT,
    outputFormat: CONFIG.SERVER.OUTPUT_FORMAT,
    activeProfile: CONFIG.SERVER.ACTIVE_PROFILE,
    playlistPath: CONFIG.SERVER.PLAYLIST_PATH
});

