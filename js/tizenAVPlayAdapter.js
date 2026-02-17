/**
 * Adaptador de Reproductor para Samsung Tizen usando webapis.avplay (AVPlay)
 *
 * POR QUÉ SE NECESITA:
 * El <video> HTML5 en Tizen tiene soporte limitado de codecs de video.
 * Muchos streams HLS (.m3u8) con ciertos perfiles H.264/HEVC se decodifican
 * correctamente el audio (AAC) pero NO el video, resultando en pantalla negra
 * con audio. La API AVPlay de Samsung accede al decodificador de hardware
 * del TV directamente, soportando todos los codecs que el TV puede reproducir.
 *
 * ESTRATEGIA:
 * 1. Si estamos en Tizen y AVPlay está disponible → usar AVPlay (nativo Samsung)
 * 2. Si AVPlay falla o no está disponible → fallback a <video> + HLS.js
 *
 * COMPATIBILIDAD:
 * - En LG webOS: este archivo se carga pero isTizen=false, no hace nada
 * - En navegador: igual, no hace nada
 * - En Samsung Tizen 2024-2025: usa AVPlay nativamente
 */
const tizenPlayerAdapter = {
    state: {
        isTizen: false,
        hasAVPlay: false,
        videoElement: null,
        avplayContainer: null,
        supportedCodecs: {},
        currentStream: null,
        playbackMethod: null, // 'avplay' | 'native' | 'hlsjs'
        streamInfo: null,
        avplayState: 'NONE', // NONE, IDLE, READY, PLAYING, PAUSED
        displayRect: { x: 0, y: 0, w: 1920, h: 1080 },
        listeners: {},
        _errorCount: 0,
        _maxErrors: 3
    },

    /**
     * Inicializa el adaptador.
     * @param {HTMLVideoElement} videoElement - Elemento <video> HTML5 (fallback)
     * @returns {Object} Estado del adaptador
     */
    init(videoElement) {
        if (!videoElement) throw new Error('tizenPlayerAdapter: videoElement es requerido');
        this.state.videoElement = videoElement;

        // Detectar plataforma
        this.state.isTizen = (typeof window.tizen !== 'undefined') ||
                             /tizen/i.test(navigator.userAgent);
        this.state.hasAVPlay = this.state.isTizen &&
                               (typeof window.webapis !== 'undefined') &&
                               (typeof window.webapis.avplay !== 'undefined');

        this.state.supportedCodecs = this.detectSupportedCodecs(videoElement);

        // Si tenemos AVPlay, preparar el contenedor
        if (this.state.hasAVPlay) {
            this._setupAVPlayContainer();
            this._registerTizenKeys();
        }

        console.log('tizenPlayerAdapter inicializado:', {
            isTizen: this.state.isTizen,
            hasAVPlay: this.state.hasAVPlay,
            supportedCodecs: this.state.supportedCodecs
        });

        return this.state;
    },

    /**
     * Configura el contenedor <object> para AVPlay
     */
    _setupAVPlayContainer() {
        // AVPlay necesita un <object> en el DOM con id="av-player"
        let container = document.getElementById('av-player');
        if (!container) {
            container = document.createElement('object');
            container.id = 'av-player';
            container.setAttribute('type', 'application/avplayer');
            container.style.cssText =
                'position:absolute;top:0;left:0;width:1920px;height:1080px;z-index:0;';
            // Insertar detrás del video element
            const playerContainer = document.querySelector('.player-container');
            if (playerContainer) {
                playerContainer.insertBefore(container, playerContainer.firstChild);
            } else {
                document.body.appendChild(container);
            }
        }
        this.state.avplayContainer = container;
    },

    /**
     * Registra teclas del control remoto que necesitan captura explícita en Tizen
     */
    _registerTizenKeys() {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                const keysToRegister = [
                    'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
                    'MediaRewind', 'MediaFastForward',
                    'MediaTrackPrevious', 'MediaTrackNext',
                    'ChannelUp', 'ChannelDown',
                    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                    'Info', 'Guide', 'Exit',
                    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
                ];
                keysToRegister.forEach(function(key) {
                    try {
                        tizen.tvinputdevice.registerKey(key);
                    } catch (e) {
                        // Algunas teclas pueden no estar disponibles en todos los modelos
                    }
                });
                console.log('Teclas de control remoto Tizen registradas');
            }
        } catch (e) {
            console.warn('No se pudieron registrar teclas Tizen:', e);
        }
    },

    /**
     * Detecta codecs soportados por el elemento <video>
     */
    detectSupportedCodecs(videoElement) {
        var can = function(s) {
            try { return videoElement.canPlayType(s); } catch (e) { return ''; }
        };

        var codecs = {
            h264_baseline: can('video/mp4; codecs="avc1.42E01E"'),
            h264_main: can('video/mp4; codecs="avc1.4D401E"'),
            h264_high: can('video/mp4; codecs="avc1.64001E"'),
            hevc: can('video/mp4; codecs="hev1.1.6.L93.B0"'),
            hls: can('application/vnd.apple.mpegurl') || can('application/x-mpegURL'),
            mpegts: can('video/mp2t') || can('video/mp2t; codecs="avc1.42E01E,mp4a.40.2"'),
            aac: can('audio/mp4; codecs="mp4a.40.2"'),
            mp3: can('audio/mpeg')
        };
        codecs.h264_available = !!(codecs.h264_baseline || codecs.h264_main || codecs.h264_high);
        return codecs;
    },

    /**
     * Analiza la URL para detectar tipo de stream
     */
    detectStreamInfo(url) {
        var lowerUrl = (url || '').toLowerCase().trim();
        var info = {
            url: url,
            format: 'unknown',
            mimeType: null,
            useHLSJS: false,
            isDirectStream: false
        };

        if (lowerUrl.includes('.m3u8') || lowerUrl.includes('m3u8') || lowerUrl.includes('/hls/')) {
            info.format = 'hls';
            info.mimeType = 'application/vnd.apple.mpegurl';
            // En Tizen con AVPlay, NO necesitamos HLS.js
            info.useHLSJS = !this.state.hasAVPlay && !this.state.supportedCodecs.hls;
        } else if (lowerUrl.includes('.ts') || lowerUrl.match(/\.ts(\?|$)/)) {
            info.format = 'mpegts';
            info.mimeType = 'video/mp2t';
            info.useHLSJS = !this.state.hasAVPlay;
            info.isDirectStream = true;
        } else if (lowerUrl.includes('.mp4') || lowerUrl.match(/\.mp4(\?|$)/)) {
            info.format = 'mp4';
            info.mimeType = 'video/mp4';
            info.useHLSJS = false;
        } else {
            // Por defecto, asumir HLS en IPTV
            info.format = 'hls';
            info.mimeType = 'application/vnd.apple.mpegurl';
            info.useHLSJS = !this.state.hasAVPlay;
        }
        return info;
    },

    /**
     * Verifica si se puede reproducir nativamente con <video>
     */
    canPlayNative(streamInfo) {
        if (streamInfo.useHLSJS) return false;
        if (streamInfo.format === 'hls') return !!this.state.supportedCodecs.hls;
        if (streamInfo.format === 'mp4') return !!this.state.supportedCodecs.h264_available;
        return false;
    },

    /**
     * Prepara un stream para reproducción (decide el método óptimo)
     * @param {string} url - URL del stream
     * @returns {Object} Configuración de reproducción
     */
    prepareStream(url) {
        var streamInfo = this.detectStreamInfo(url);
        var playbackMethod;

        // Prioridad: AVPlay > nativo > HLS.js
        if (this.state.hasAVPlay) {
            playbackMethod = 'avplay';
        } else if (this.canPlayNative(streamInfo)) {
            playbackMethod = 'native';
        } else {
            playbackMethod = 'hlsjs';
        }

        var config = {
            url: url,
            streamInfo: streamInfo,
            playbackMethod: playbackMethod,
            canPlayNative: this.canPlayNative(streamInfo),
            mimeType: streamInfo.mimeType,
            requiresHLSJS: playbackMethod === 'hlsjs',
            useAVPlay: playbackMethod === 'avplay',
            fallbackMethods: []
        };

        // Configurar cadena de fallback
        if (playbackMethod === 'avplay') {
            config.fallbackMethods = ['hlsjs', 'native'];
        } else if (playbackMethod === 'native') {
            config.fallbackMethods = ['hlsjs'];
        } else {
            config.fallbackMethods = this.canPlayNative(streamInfo) ? ['native'] : [];
        }

        this.state.currentStream = url;
        this.state.streamInfo = streamInfo;
        this.state.playbackMethod = playbackMethod;

        console.log('Stream preparado (Tizen):', config);
        return config;
    },

    /**
     * Configura el elemento <video> HTML5 para reproducción
     */
    configureVideoElement(videoElement, streamInfo) {
        if (!videoElement) return;

        try {
            videoElement.removeAttribute('type');
            videoElement.removeAttribute('src');
        } catch (e) { /* ignorar */ }

        if (streamInfo && streamInfo.mimeType) {
            try { videoElement.setAttribute('type', streamInfo.mimeType); } catch (e) { /* ignorar */ }
        }

        try {
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.setAttribute('preload', 'auto');
            videoElement.controls = false;
            videoElement.setAttribute('controls', 'false');
            videoElement.setAttribute('crossorigin', 'anonymous');
        } catch (e) { /* ignorar */ }
    },

    // =========================================================================
    // AVPlay API Methods
    // =========================================================================

    /**
     * Abre un stream con AVPlay
     * @param {string} url - URL del stream
     * @returns {boolean} true si se abrió exitosamente
     */
    avplayOpen(url) {
        if (!this.state.hasAVPlay) {
            console.error('AVPlay no está disponible');
            return false;
        }

        try {
            // Cerrar stream anterior si existe
            this.avplayClose();

            console.log('[AVPlay] Abriendo stream:', url);
            webapis.avplay.open(url);
            this.state.avplayState = 'IDLE';
            this.state.currentStream = url;
            this.state._errorCount = 0;

            // Configurar el rectángulo de display
            this._setDisplayRect();

            // Configurar listeners de AVPlay
            this._setupAVPlayListeners();

            return true;
        } catch (e) {
            console.error('[AVPlay] Error al abrir:', e);
            this.state.avplayState = 'NONE';
            return false;
        }
    },

    /**
     * Prepara el stream de forma asíncrona (prepareAsync)
     * @param {Function} onSuccess - Callback al prepararse exitosamente
     * @param {Function} onError - Callback en caso de error
     */
    avplayPrepareAsync(onSuccess, onError) {
        if (!this.state.hasAVPlay) {
            if (onError) onError(new Error('AVPlay no disponible'));
            return;
        }

        var self = this;
        try {
            console.log('[AVPlay] Preparando stream async...');
            webapis.avplay.prepareAsync(
                function successCallback() {
                    console.log('[AVPlay] Stream preparado exitosamente');
                    self.state.avplayState = 'READY';

                    // Obtener información del stream
                    try {
                        var duration = webapis.avplay.getDuration();
                        console.log('[AVPlay] Duración:', duration, 'ms');
                    } catch (e) {
                        console.log('[AVPlay] Stream en vivo (sin duración)');
                    }

                    if (onSuccess) onSuccess();
                },
                function errorCallback(e) {
                    console.error('[AVPlay] Error en prepareAsync:', e);
                    self.state.avplayState = 'NONE';
                    if (onError) onError(e);
                }
            );
        } catch (e) {
            console.error('[AVPlay] Excepción en prepareAsync:', e);
            this.state.avplayState = 'NONE';
            if (onError) onError(e);
        }
    },

    /**
     * Inicia la reproducción con AVPlay
     * @returns {boolean} true si se inició exitosamente
     */
    avplayPlay() {
        if (!this.state.hasAVPlay) return false;

        try {
            var currentState = this._getAVPlayState();
            console.log('[AVPlay] Intentando play, estado actual:', currentState);

            if (currentState === 'READY' || currentState === 'PAUSED') {
                webapis.avplay.play();
                this.state.avplayState = 'PLAYING';

                // Ocultar el <video> element y mostrar AVPlay
                this._showAVPlay();

                console.log('[AVPlay] Reproducción iniciada');
                return true;
            } else {
                console.warn('[AVPlay] No se puede reproducir en estado:', currentState);
                return false;
            }
        } catch (e) {
            console.error('[AVPlay] Error en play:', e);
            return false;
        }
    },

    /**
     * Pausa la reproducción
     */
    avplayPause() {
        if (!this.state.hasAVPlay) return;
        try {
            var state = this._getAVPlayState();
            if (state === 'PLAYING') {
                webapis.avplay.pause();
                this.state.avplayState = 'PAUSED';
            }
        } catch (e) {
            console.error('[AVPlay] Error en pause:', e);
        }
    },

    /**
     * Detiene la reproducción
     */
    avplayStop() {
        if (!this.state.hasAVPlay) return;
        try {
            var state = this._getAVPlayState();
            if (state === 'PLAYING' || state === 'PAUSED') {
                webapis.avplay.stop();
                this.state.avplayState = 'IDLE';
                console.log('[AVPlay] Reproducción detenida');
            }
        } catch (e) {
            console.error('[AVPlay] Error en stop:', e);
        }
    },

    /**
     * Cierra AVPlay completamente y libera recursos
     */
    avplayClose() {
        if (!this.state.hasAVPlay) return;
        try {
            var state = this._getAVPlayState();
            if (state !== 'NONE' && state !== 'IDLE') {
                try { webapis.avplay.stop(); } catch (e) { /* ignorar */ }
            }
            webapis.avplay.close();
            this.state.avplayState = 'NONE';
            this.state.currentStream = null;
            this._showVideoElement();
            console.log('[AVPlay] Cerrado');
        } catch (e) {
            // Puede fallar si ya estaba cerrado
            this.state.avplayState = 'NONE';
        }
    },

    /**
     * Busca a una posición (seekTo)
     * @param {number} positionMs - Posición en milisegundos
     */
    avplaySeek(positionMs) {
        if (!this.state.hasAVPlay) return;
        try {
            var state = this._getAVPlayState();
            if (state === 'PLAYING' || state === 'PAUSED') {
                webapis.avplay.seekTo(positionMs,
                    function() { console.log('[AVPlay] Seek completado'); },
                    function(e) { console.error('[AVPlay] Error en seek:', e); }
                );
            }
        } catch (e) {
            console.error('[AVPlay] Error en seekTo:', e);
        }
    },

    /**
     * Obtiene el tiempo actual en milisegundos
     */
    avplayGetCurrentTime() {
        if (!this.state.hasAVPlay) return 0;
        try {
            return webapis.avplay.getCurrentTime();
        } catch (e) {
            return 0;
        }
    },

    /**
     * Obtiene la duración total en milisegundos
     */
    avplayGetDuration() {
        if (!this.state.hasAVPlay) return 0;
        try {
            return webapis.avplay.getDuration();
        } catch (e) {
            return 0;
        }
    },

    // =========================================================================
    // Método principal de reproducción completa (open → prepare → play)
    // =========================================================================

    /**
     * Reproduce un stream completo con AVPlay: open → prepareAsync → play
     * Con manejo de errores y fallback automático.
     *
     * @param {string} url - URL del stream
     * @param {Object} callbacks - { onPlaying, onError, onBuffering, onFinished }
     */
    playStream(url, callbacks) {
        callbacks = callbacks || {};
        var self = this;

        if (!this.state.hasAVPlay) {
            console.warn('[AVPlay] No disponible, usando fallback');
            if (callbacks.onError) callbacks.onError('AVPlay no disponible');
            return;
        }

        // Paso 1: Abrir
        if (!this.avplayOpen(url)) {
            console.error('[AVPlay] No se pudo abrir el stream');
            if (callbacks.onError) callbacks.onError('No se pudo abrir el stream');
            return;
        }

        // Notificar buffering
        if (callbacks.onBuffering) callbacks.onBuffering();

        // Paso 2: Preparar async
        this.avplayPrepareAsync(
            function onPrepared() {
                // Paso 3: Reproducir
                if (self.avplayPlay()) {
                    console.log('[AVPlay] Reproducción completa iniciada');
                    if (callbacks.onPlaying) callbacks.onPlaying();
                } else {
                    console.error('[AVPlay] No se pudo iniciar la reproducción');
                    if (callbacks.onError) callbacks.onError('Error al iniciar reproducción');
                }
            },
            function onPrepareError(e) {
                console.error('[AVPlay] Error al preparar stream:', e);
                self.avplayClose();
                if (callbacks.onError) callbacks.onError('Error al preparar: ' + e);
            }
        );
    },

    // =========================================================================
    // Métodos internos
    // =========================================================================

    /**
     * Configura el rectángulo de display para AVPlay
     */
    _setDisplayRect() {
        if (!this.state.hasAVPlay) return;
        try {
            var rect = this.state.displayRect;
            webapis.avplay.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
            console.log('[AVPlay] DisplayRect configurado:', rect);
        } catch (e) {
            console.error('[AVPlay] Error en setDisplayRect:', e);
        }
    },

    /**
     * Actualiza el rectángulo de display (por si cambia el layout)
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    setDisplayRect(x, y, w, h) {
        this.state.displayRect = { x: x || 0, y: y || 0, w: w || 1920, h: h || 1080 };
        this._setDisplayRect();
    },

    /**
     * Obtiene el estado actual de AVPlay de forma segura
     */
    _getAVPlayState() {
        if (!this.state.hasAVPlay) return 'NONE';
        try {
            return webapis.avplay.getState();
        } catch (e) {
            return this.state.avplayState || 'NONE';
        }
    },

    /**
     * Configura los listeners de eventos de AVPlay
     */
    _setupAVPlayListeners() {
        if (!this.state.hasAVPlay) return;

        var self = this;
        try {
            webapis.avplay.setListener({
                onbufferingstart: function() {
                    console.log('[AVPlay] Buffering start');
                    self.state.avplayState = 'PLAYING';
                    self._emit('buffering');
                },
                onbufferingprogress: function(percent) {
                    if (percent % 25 === 0) {
                        console.log('[AVPlay] Buffering:', percent + '%');
                    }
                },
                onbufferingcomplete: function() {
                    console.log('[AVPlay] Buffering completo');
                    self._emit('bufferingComplete');
                },
                onstreamcompleted: function() {
                    console.log('[AVPlay] Stream completado');
                    self.state.avplayState = 'IDLE';
                    self._emit('finished');
                },
                oncurrentplaytime: function(currentTime) {
                    // Se llama periódicamente con el tiempo actual en ms
                    self._emit('timeupdate', { currentTime: currentTime });
                },
                onevent: function(eventType, eventData) {
                    console.log('[AVPlay] Evento:', eventType, eventData);
                    // Manejar eventos específicos
                    if (eventType === 'PLAYER_MSG_RESOLUTION_CHANGED') {
                        console.log('[AVPlay] Resolución cambiada');
                        self._setDisplayRect(); // Reajustar
                    }
                },
                onerror: function(eventType) {
                    console.error('[AVPlay] Error de playback:', eventType);
                    self.state._errorCount++;
                    self._emit('error', { type: eventType });
                },
                ondrmevent: function(drmEvent, drmData) {
                    console.log('[AVPlay] DRM evento:', drmEvent);
                },
                onsubtitlechange: function(duration, text, type, attriCount, attributes) {
                    // Ignorar subtítulos por ahora
                }
            });
            console.log('[AVPlay] Listeners configurados');
        } catch (e) {
            console.error('[AVPlay] Error configurando listeners:', e);
        }
    },

    /**
     * Muestra AVPlay y oculta el <video> HTML5
     */
    _showAVPlay() {
        if (this.state.videoElement) {
            this.state.videoElement.style.visibility = 'hidden';
            this.state.videoElement.style.zIndex = '-1';
        }
        if (this.state.avplayContainer) {
            this.state.avplayContainer.style.visibility = 'visible';
            this.state.avplayContainer.style.zIndex = '0';
        }
    },

    /**
     * Muestra el <video> HTML5 y oculta AVPlay
     */
    _showVideoElement() {
        if (this.state.videoElement) {
            this.state.videoElement.style.visibility = 'visible';
            this.state.videoElement.style.zIndex = '0';
        }
        if (this.state.avplayContainer) {
            this.state.avplayContainer.style.visibility = 'hidden';
            this.state.avplayContainer.style.zIndex = '-1';
        }
    },

    /**
     * Emite un evento interno
     */
    _emit(eventName, data) {
        var callbacks = this.state.listeners[eventName];
        if (callbacks) {
            for (var i = 0; i < callbacks.length; i++) {
                try {
                    callbacks[i](data);
                } catch (e) {
                    console.error('[AVPlay] Error en listener ' + eventName + ':', e);
                }
            }
        }
    },

    /**
     * Registra un listener de eventos
     */
    on(eventName, callback) {
        if (!this.state.listeners[eventName]) {
            this.state.listeners[eventName] = [];
        }
        this.state.listeners[eventName].push(callback);
    },

    /**
     * Elimina listeners de un evento
     */
    off(eventName) {
        delete this.state.listeners[eventName];
    },

    // =========================================================================
    // Métodos de compatibilidad (usados por player.js)
    // =========================================================================

    /**
     * Verifica la salud de la reproducción
     * Para AVPlay, siempre reporta saludable si está en estado PLAYING
     */
    checkPlaybackHealth(videoElement) {
        // Si estamos usando AVPlay
        if (this.state.playbackMethod === 'avplay' && this.state.hasAVPlay) {
            var avState = this._getAVPlayState();
            return {
                healthy: avState === 'PLAYING',
                hasVideo: avState === 'PLAYING', // AVPlay siempre tiene video si reproduce
                hasAudio: avState === 'PLAYING',
                videoWidth: 1920,
                videoHeight: 1080,
                readyState: avState === 'PLAYING' ? 4 : 0,
                networkState: avState === 'PLAYING' ? 1 : 0,
                paused: avState !== 'PLAYING',
                currentTime: this.avplayGetCurrentTime() / 1000,
                issues: avState !== 'PLAYING' && avState !== 'PAUSED' && avState !== 'READY'
                    ? ['AVPlay no está reproduciendo (estado: ' + avState + ')']
                    : []
            };
        }

        // Fallback: verificar el <video> element
        if (!videoElement) {
            return { healthy: false, reason: 'videoElement no disponible', issues: ['videoElement no disponible'] };
        }

        var state = {
            healthy: true,
            hasVideo: false,
            hasAudio: false,
            videoWidth: videoElement.videoWidth || 0,
            videoHeight: videoElement.videoHeight || 0,
            readyState: videoElement.readyState,
            networkState: videoElement.networkState,
            paused: videoElement.paused,
            currentTime: videoElement.currentTime,
            issues: []
        };

        state.hasVideo = state.videoWidth > 0 && state.videoHeight > 0;
        state.hasAudio = !videoElement.muted && (videoElement.volume > 0);

        // Señal típica de incompatibilidad de codec: solo audio
        if (state.readyState >= 2 && !state.hasVideo && !state.paused) {
            if (state.hasAudio && state.currentTime > 1) {
                state.healthy = false;
                state.issues.push('Solo audio - codec de video no compatible');
            }
        }

        if (state.networkState === 3) {
            state.healthy = false;
            state.issues.push('Error de red/decodificación');
        }

        return state;
    },

    /**
     * Verifica si AVPlay está activo y reproduciendo
     */
    isAVPlayActive() {
        return this.state.hasAVPlay &&
               this.state.playbackMethod === 'avplay' &&
               this._getAVPlayState() === 'PLAYING';
    },

    /**
     * Detiene y limpia todo (AVPlay + video element)
     */
    cleanup() {
        this.avplayClose();
        this.off('buffering');
        this.off('bufferingComplete');
        this.off('finished');
        this.off('timeupdate');
        this.off('error');
        this.state._errorCount = 0;
        this._showVideoElement();
    }
};

window.tizenPlayerAdapter = tizenPlayerAdapter;
