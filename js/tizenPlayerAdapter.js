/**
 * Adaptador de Reproductor para Samsung Tizen
 * Delegado a tizenAVPlayAdapter.js que implementa la API completa de AVPlay.
 * Este archivo se mantiene por compatibilidad con las referencias existentes.
 *
 * Si tizenAVPlayAdapter.js ya fue cargado, reutiliza esa instancia.
 * De lo contrario, provee una implementación básica de fallback.
 */
(function() {
    // Si el adaptador completo ya fue cargado (tizenAVPlayAdapter.js), usarlo
    if (window.tizenPlayerAdapter && window.tizenPlayerAdapter.avplayOpen) {
        console.log('tizenPlayerAdapter: Usando implementación AVPlay completa');
        return; // Ya está global, no hacer nada
    }

    // Fallback mínimo si tizenAVPlayAdapter.js no se cargó
    console.warn('tizenPlayerAdapter: tizenAVPlayAdapter.js no encontrado, usando fallback básico');

    var tizenPlayerAdapterFallback = {
        state: {
            isTizen: false,
            hasAVPlay: false,
            videoElement: null,
            supportedCodecs: {},
            currentStream: null,
            playbackMethod: null,
            streamInfo: null
        },

        init: function(videoElement) {
            if (!videoElement) throw new Error('tizenPlayerAdapter: videoElement es requerido');
            this.state.videoElement = videoElement;
            this.state.isTizen = (typeof window.tizen !== 'undefined') || /tizen/i.test(navigator.userAgent);
            this.state.hasAVPlay = false;
            this.state.supportedCodecs = this.detectSupportedCodecs(videoElement);
            console.log('tizenPlayerAdapter (fallback) inicializado');
            return this.state;
        },

        detectSupportedCodecs: function(videoElement) {
            var can = function(s) {
                try { return videoElement.canPlayType(s); } catch (e) { return ''; }
            };
            return {
                h264_baseline: can('video/mp4; codecs="avc1.42E01E"'),
                h264_main: can('video/mp4; codecs="avc1.4D401E"'),
                h264_high: can('video/mp4; codecs="avc1.64001E"'),
                hls: can('application/vnd.apple.mpegurl') || can('application/x-mpegURL'),
                mpegts: can('video/mp2t'),
                aac: can('audio/mp4; codecs="mp4a.40.2"'),
                mp3: can('audio/mpeg'),
                h264_available: !!(can('video/mp4; codecs="avc1.42E01E"') ||
                                   can('video/mp4; codecs="avc1.4D401E"') ||
                                   can('video/mp4; codecs="avc1.64001E"'))
            };
        },

        prepareStream: function(url) {
            return {
                url: url,
                playbackMethod: 'hlsjs',
                requiresHLSJS: true,
                useAVPlay: false,
                fallbackMethods: []
            };
        },

        configureVideoElement: function(videoElement) {
            if (!videoElement) return;
            try {
                videoElement.setAttribute('playsinline', '');
                videoElement.setAttribute('preload', 'auto');
                videoElement.controls = false;
            } catch (e) { /* ignorar */ }
        },

        checkPlaybackHealth: function(videoElement) {
            if (!videoElement) return { healthy: false, issues: ['no videoElement'] };
            var w = videoElement.videoWidth || 0;
            var h = videoElement.videoHeight || 0;
            var hasVideo = w > 0 && h > 0;
            var issues = [];
            if (videoElement.readyState >= 2 && !hasVideo && !videoElement.paused && videoElement.currentTime > 1) {
                issues.push('Solo audio - codec de video no compatible');
            }
            return {
                healthy: issues.length === 0,
                hasVideo: hasVideo,
                hasAudio: !videoElement.muted && videoElement.volume > 0,
                videoWidth: w,
                videoHeight: h,
                readyState: videoElement.readyState,
                paused: videoElement.paused,
                currentTime: videoElement.currentTime,
                issues: issues
            };
        },

        cleanup: function() {}
    };

    window.tizenPlayerAdapter = tizenPlayerAdapterFallback;
})();
