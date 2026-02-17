/**
 * Adaptador de Reproductor para LG webOS
 * 
 * Este módulo centraliza la lógica de reproducción específica para webOS,
 * proporcionando una capa de abstracción sobre las diferentes APIs disponibles
 * (HTML5 video, HLS.js, AVPlay) y asegurando compatibilidad de codecs.
 * 
 * @module webOSPlayerAdapter
 * @description
 * - Detecta automáticamente el entorno webOS
 * - Selecciona el método de reproducción óptimo según el stream
 * - Maneja codecs y MIME types correctamente
 * - Proporciona fallback robusto entre métodos
 * 
 * @example
 * const adapter = webOSPlayerAdapter.init(videoElement);
 * adapter.loadStream(url, { format: 'hls', codec: 'h264' });
 */

const webOSPlayerAdapter = {
    /**
     * Estado del adaptador
     */
    state: {
        isWebOS: false,
        webOSVersion: null,
        videoElement: null,
        currentStream: null,
        playbackMethod: null, // 'native', 'hlsjs', 'avplay'
        supportedCodecs: {},
        streamInfo: null
    },

    /**
     * Inicializa el adaptador y detecta capacidades del sistema
     * @param {HTMLVideoElement} videoElement - Elemento video del DOM
     * @returns {Object} Estado inicializado del adaptador
     */
    init(videoElement) {
        if (!videoElement) {
            throw new Error('webOSPlayerAdapter: videoElement es requerido');
        }

        this.state.videoElement = videoElement;
        this.state.isWebOS = this.detectWebOS();
        
        if (this.state.isWebOS) {
            this.state.webOSVersion = this.getWebOSVersion();
            console.log(`webOS detectado - Versión: ${this.state.webOSVersion || 'desconocida'}`);
        }

        // Detectar codecs soportados
        this.state.supportedCodecs = this.detectSupportedCodecs(videoElement);
        
        console.log('webOSPlayerAdapter inicializado:', {
            isWebOS: this.state.isWebOS,
            webOSVersion: this.state.webOSVersion,
            supportedCodecs: this.state.supportedCodecs
        });

        return this.state;
    },

    /**
     * Detecta si la aplicación está ejecutándose en webOS
     * @returns {boolean}
     */
    detectWebOS() {
        return typeof webOS !== 'undefined' ||
               /web0s|webos|lg browser/i.test(navigator.userAgent);
    },

    /**
     * Obtiene la versión de webOS si está disponible
     * @returns {string|null}
     */
    getWebOSVersion() {
        if (typeof webOS !== 'undefined' && webOS.platform) {
            return webOS.platform.tv ? 'TV' : null;
        }
        // Intentar extraer de user agent
        const match = navigator.userAgent.match(/webOS\/([\d.]+)/i);
        return match ? match[1] : null;
    },

    /**
     * Detecta los codecs soportados por el navegador
     * @param {HTMLVideoElement} videoElement - Elemento video
     * @returns {Object} Objeto con codecs soportados
     */
    detectSupportedCodecs(videoElement) {
        const codecs = {
            // H.264 (AVC) - más común y compatible
            h264_baseline: videoElement.canPlayType('video/mp4; codecs="avc1.42E01E"'),
            h264_main: videoElement.canPlayType('video/mp4; codecs="avc1.4D401E"'),
            h264_high: videoElement.canPlayType('video/mp4; codecs="avc1.64001E"'),
            
            // H.265 (HEVC) - mejor compresión pero menos compatible
            h265: videoElement.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'),
            
            // VP8/VP9 - menos común en IPTV
            vp8: videoElement.canPlayType('video/webm; codecs="vp8"'),
            vp9: videoElement.canPlayType('video/webm; codecs="vp9"'),
            
            // HLS - streaming adaptativo
            hls: videoElement.canPlayType('application/vnd.apple.mpegurl') || 
                 videoElement.canPlayType('application/x-mpegURL'),
            
            // MPEGTS - contenedor común en IPTV
            mpegts: videoElement.canPlayType('video/mp2t') ||
                    videoElement.canPlayType('video/mp2t; codecs="avc1.42E01E,mp4a.40.2"'),
            
            // Audio codecs
            aac: videoElement.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
            mp3: videoElement.canPlayType('audio/mpeg')
        };

        // Determinar si H.264 está disponible (cualquier perfil)
        codecs.h264_available = !!(codecs.h264_baseline || codecs.h264_main || codecs.h264_high);

        return codecs;
    },

    /**
     * Detecta el formato y características del stream desde la URL
     * @param {string} url - URL del stream
     * @returns {Object} Información del stream detectada
     */
    detectStreamInfo(url) {
        if (!url) {
            return { format: 'unknown', mimeType: null, useHLSJS: true };
        }

        const lowerUrl = url.toLowerCase().trim();
        const info = {
            url: url,
            format: 'unknown',
            mimeType: null,
            useHLSJS: false,
            isDirectStream: false,
            codecHint: null
        };

        // Detectar formato por extensión/patrón
        if (lowerUrl.includes('.m3u8') || lowerUrl.includes('m3u8') || lowerUrl.includes('/hls/')) {
            info.format = 'hls';
            info.mimeType = 'application/vnd.apple.mpegurl';
            // Usar nativo si HLS es soportado; HLS.js solo si no hay soporte nativo
            info.useHLSJS = !this.state.supportedCodecs.hls;
        } else if (lowerUrl.includes('.ts') || lowerUrl.includes('.m2ts') || lowerUrl.match(/\.ts(\?|$)/)) {
            info.format = 'mpegts';
            info.mimeType = 'video/mp2t';
            // MPEGTS directo funciona mejor con HLS.js
            info.useHLSJS = true;
            info.isDirectStream = true;
        } else if (lowerUrl.includes('.mpd') || lowerUrl.includes('dash')) {
            info.format = 'dash';
            info.mimeType = 'application/dash+xml';
            info.useHLSJS = true;
        } else if (lowerUrl.includes('.mp4')) {
            info.format = 'mp4';
            info.mimeType = 'video/mp4';
            info.useHLSJS = false;
        } else if (lowerUrl.includes('rtmp://') || lowerUrl.includes('rtmps://')) {
            info.format = 'rtmp';
            info.mimeType = null;
            info.useHLSJS = false; // RTMP no es compatible con HTML5
        } else if (lowerUrl.includes('rtsp://')) {
            info.format = 'rtsp';
            info.mimeType = null;
            info.useHLSJS = false; // RTSP no es compatible con HTML5
        }

        // Detectar por parámetros de query
        if (lowerUrl.includes('output=hls') || lowerUrl.includes('format=m3u8')) {
            info.format = 'hls';
            info.mimeType = 'application/vnd.apple.mpegurl';
            info.useHLSJS = !this.state.supportedCodecs.hls;
        } else if (lowerUrl.includes('output=mpegts') || lowerUrl.includes('output=ts') || lowerUrl.includes('format=mpegts')) {
            info.format = 'mpegts';
            info.mimeType = 'video/mp2t';
            info.useHLSJS = true;
        }

        // Por defecto, si no se detecta, asumir HLS (más común en IPTV)
        if (info.format === 'unknown') {
            info.format = 'hls';
            info.mimeType = 'application/vnd.apple.mpegurl';
            info.useHLSJS = true;
        }

        // Codec hint: asumir H.264 + AAC para IPTV (estándar)
        if (info.format === 'hls' || info.format === 'mpegts') {
            info.codecHint = 'h264+aac';
        }

        return info;
    },

    /**
     * Configura el elemento video con los atributos correctos para webOS
     * @param {HTMLVideoElement} videoElement - Elemento video
     * @param {Object} streamInfo - Información del stream
     */
    configureVideoElement(videoElement, streamInfo) {
        // Limpiar configuración anterior
        videoElement.removeAttribute('type');
        videoElement.removeAttribute('src');
        
        // Configurar MIME type si está disponible
        if (streamInfo.mimeType) {
            videoElement.setAttribute('type', streamInfo.mimeType);
            console.log(`MIME type configurado: ${streamInfo.mimeType}`);
        }

        // Configuraciones específicas para webOS
        if (this.state.isWebOS) {
            // Atributos recomendados para webOS
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.setAttribute('preload', 'auto');
            
            // Deshabilitar controles nativos (usamos controles personalizados)
            videoElement.controls = false;
            videoElement.setAttribute('controls', 'false');
            
            // Configurar para mejor compatibilidad de codecs
            videoElement.setAttribute('crossorigin', 'anonymous');
            
            // webOS puede requerir estas configuraciones adicionales
            videoElement.setAttribute('x-webkit-airplay', 'allow');
        }

        // Configuraciones generales
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.setAttribute('x5-playsinline', '');
    },

    /**
     * Determina el método de reproducción óptimo para el stream
     * @param {Object} streamInfo - Información del stream
     * @returns {string} Método recomendado: 'native', 'hlsjs', 'avplay'
     */
    determinePlaybackMethod(streamInfo) {
        // Si el stream requiere HLS.js explícitamente
        if (streamInfo.useHLSJS) {
            return 'hlsjs';
        }

        // Para webOS, priorizar nativo si el codec es compatible
        if (this.state.isWebOS) {
            // HLS nativo funciona bien en webOS si el codec es H.264
            if (streamInfo.format === 'hls' && this.state.supportedCodecs.hls && streamInfo.codecHint === 'h264+aac') {
                return 'native';
            }
            
            // MP4 con H.264 también funciona nativo
            if (streamInfo.format === 'mp4' && this.state.supportedCodecs.h264_available) {
                return 'native';
            }
        }

        // Por defecto, usar HLS.js para máxima compatibilidad
        return 'hlsjs';
    },

    /**
     * Verifica si el stream puede reproducirse con el método nativo
     * @param {Object} streamInfo - Información del stream
     * @returns {boolean}
     */
    canPlayNative(streamInfo) {
        if (streamInfo.useHLSJS) {
            return false;
        }

        // Verificar codec
        if (streamInfo.codecHint === 'h264+aac') {
            return this.state.supportedCodecs.h264_available && this.state.supportedCodecs.aac;
        }

        // Verificar formato
        if (streamInfo.format === 'hls') {
            return this.state.supportedCodecs.hls;
        }

        if (streamInfo.format === 'mp4') {
            return this.state.supportedCodecs.h264_available;
        }

        return false;
    },

    /**
     * Prepara el stream para reproducción
     * @param {string} url - URL del stream
     * @returns {Object} Configuración de reproducción recomendada
     */
    prepareStream(url) {
        const streamInfo = this.detectStreamInfo(url);
        const playbackMethod = this.determinePlaybackMethod(streamInfo);
        const canPlayNative = this.canPlayNative(streamInfo);

        const config = {
            url: url,
            streamInfo: streamInfo,
            playbackMethod: playbackMethod,
            canPlayNative: canPlayNative,
            mimeType: streamInfo.mimeType,
            requiresHLSJS: streamInfo.useHLSJS || playbackMethod === 'hlsjs',
            fallbackMethods: []
        };

        // Determinar métodos de fallback
        if (playbackMethod === 'native') {
            config.fallbackMethods.push('hlsjs');
        } else if (playbackMethod === 'hlsjs') {
            // Si HLS.js falla, no hay mucho que hacer, pero intentar nativo como último recurso
            if (canPlayNative) {
                config.fallbackMethods.push('native');
            }
        }

        // Guardar estado
        this.state.currentStream = url;
        this.state.streamInfo = streamInfo;
        this.state.playbackMethod = playbackMethod;

        console.log('Stream preparado:', config);

        return config;
    },

    /**
     * Verifica si hay problemas de codec después de iniciar la reproducción
     * @param {HTMLVideoElement} videoElement - Elemento video
     * @returns {Object} Estado de la reproducción
     */
    checkPlaybackHealth(videoElement) {
        if (!videoElement) {
            return { healthy: false, reason: 'videoElement no disponible' };
        }

        const state = {
            healthy: true,
            hasVideo: false,
            hasAudio: false,
            videoWidth: videoElement.videoWidth || 0,
            videoHeight: videoElement.videoHeight || 0,
            readyState: videoElement.readyState,
            networkState: videoElement.networkState,
            paused: videoElement.paused,
            currentTime: videoElement.currentTime,
            duration: videoElement.duration,
            issues: []
        };

        // Verificar dimensiones de video
        state.hasVideo = state.videoWidth > 0 && state.videoHeight > 0;

        // Verificar audio (básico - si no está muted y tiene volumen)
        state.hasAudio = !videoElement.muted && videoElement.volume > 0;

        // Detectar problemas
        if (state.readyState >= 2 && !state.hasVideo && !state.paused) {
            // Video está cargando/reproduciéndose pero no tiene dimensiones
            if (state.hasAudio) {
                state.healthy = false;
                state.issues.push('Solo audio - codec de video no compatible');
            } else if (state.currentTime > 3) {
                // Si ha pasado tiempo y no hay video ni audio
                state.healthy = false;
                state.issues.push('Sin video ni audio - problema de codec o conexión');
            }
        }

        // Verificar estado de red
        if (state.networkState === 3) {
            state.healthy = false;
            state.issues.push('Error de red al decodificar');
        }

        return state;
    }
};

// Hacer disponible globalmente
window.webOSPlayerAdapter = webOSPlayerAdapter;

