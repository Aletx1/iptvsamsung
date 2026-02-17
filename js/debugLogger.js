/**
 * Simple on-screen logger for webOS TVs.
 * Toggle with GREEN (404). Clear with BLUE (406). Upload/Save with YELLOW (405).
 */
(function () {
    const MAX_LINES = 200;
    const KEY_TOGGLE = 404; // GREEN
    const KEY_SAVE = 405;   // YELLOW
    const KEY_CLEAR = 406;  // BLUE
    const STORAGE_KEY = 'iptv_debug_logs_v1';
    const state = {
        enabled: false,
        lines: [],
        original: {},
        uploadInProgress: false,
        autoUploadTimer: null
    };

    function formatArg(arg) {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
        if (arg instanceof Error) return arg.message || String(arg);
        try {
            return JSON.stringify(arg);
        } catch (e) {
            return String(arg);
        }
    }

    function formatLine(level, args) {
        const time = new Date().toISOString().split('T')[1].replace('Z', '');
        const msg = args.map(formatArg).join(' ');
        return `[${time}] ${level.toUpperCase()}: ${msg}`;
    }

    function ensureOverlay() {
        let overlay = document.getElementById('debug-log-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'debug-log-overlay';
        overlay.style.cssText = [
            'position:fixed',
            'left:10px',
            'right:10px',
            'bottom:10px',
            'max-height:45%',
            'background:rgba(0,0,0,0.85)',
            'color:#00ff7f',
            'font-family:monospace',
            'font-size:12px',
            'padding:10px',
            'border:1px solid #00ff7f',
            'border-radius:6px',
            'z-index:99999',
            'overflow:auto',
            'display:none'
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = 'color:#ffffff;margin-bottom:6px;';
        header.textContent = 'Debug Logs (GREEN=toggle, YELLOW=upload/save, BLUE=clear)';
        overlay.appendChild(header);

        const content = document.createElement('div');
        content.id = 'debug-log-content';
        overlay.appendChild(content);

        document.body.appendChild(overlay);
        return overlay;
    }

    function render() {
        const overlay = ensureOverlay();
        const content = document.getElementById('debug-log-content');
        if (!content) return;
        content.textContent = state.lines.join('\n');
        overlay.style.display = state.enabled ? 'block' : 'none';
        if (state.enabled) {
            overlay.scrollTop = overlay.scrollHeight;
        }
    }

    function addLine(level, args) {
        const line = formatLine(level, args);
        state.lines.push(line);
        if (state.lines.length > MAX_LINES) {
            state.lines.shift();
        }
        persist();
        if (level === 'error') {
            scheduleAutoUpload();
        }
        if (state.enabled) {
            render();
        }
    }

    function toggle() {
        state.enabled = !state.enabled;
        render();
    }

    function clear() {
        state.lines = [];
        persist();
        render();
    }

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, state.lines.join('\n'));
        } catch (e) {
            // no-op
        }
    }

    function restore() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                state.lines = saved.split('\n').filter(Boolean);
            }
        } catch (e) {
            // no-op
        }
    }

    function getUploadConfig() {
        const cfg = window.CONFIG && window.CONFIG.DEBUG ? window.CONFIG.DEBUG : {};
        return {
            url: cfg.LOG_UPLOAD_URL || '',
            timeout: cfg.LOG_UPLOAD_TIMEOUT || 10000,
            maxChars: cfg.LOG_UPLOAD_MAX_CHARS || 20000
        };
    }

    function hasUploadUrl() {
        const cfg = getUploadConfig();
        return !!cfg.url;
    }

    function scheduleAutoUpload() {
        if (!hasUploadUrl()) return;
        if (state.uploadInProgress) return;
        if (state.autoUploadTimer) return;

        state.autoUploadTimer = setTimeout(function () {
            state.autoUploadTimer = null;
            uploadLogs();
        }, 1500);
    }

    async function uploadLogs() {
        const { url, timeout, maxChars } = getUploadConfig();
        if (!url) {
            addLine('error', ['LOG_UPLOAD_URL no configurado en CONFIG.DEBUG']);
            return;
        }

        const content = state.lines.join('\n').slice(-maxChars);
        const payload = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            logs: content
        };

        if (state.uploadInProgress) return;
        state.uploadInProgress = true;
        addLine('info', ['Intentando subir logs a:', url]);

        if (typeof fetch === 'function') {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller ? controller.signal : undefined
                });

                if (!res.ok) {
                    addLine('error', ['Error subiendo logs:', res.status, res.statusText]);
                } else {
                    addLine('info', ['Logs enviados correctamente']);
                }
            } catch (e) {
                addLine('error', ['Fallo al subir logs:', e.message || e]);
            } finally {
                if (timer) clearTimeout(timer);
                state.uploadInProgress = false;
            }
            return;
        }

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = timeout;
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        addLine('info', ['Logs enviados correctamente (XHR)']);
                    } else {
                        addLine('error', ['Error subiendo logs (XHR):', xhr.status, xhr.statusText]);
                    }
                    state.uploadInProgress = false;
                }
            };
            xhr.onerror = function () {
                addLine('error', ['Fallo al subir logs (XHR)']);
                state.uploadInProgress = false;
            };
            xhr.ontimeout = function () {
                addLine('error', ['Timeout al subir logs (XHR)']);
                state.uploadInProgress = false;
            };
            xhr.send(JSON.stringify(payload));
        } catch (e) {
            addLine('error', ['Fallo al subir logs (XHR):', e.message || e]);
            state.uploadInProgress = false;
        }
    }

    function saveToFile() {
        try {
            const content = state.lines.join('\n');
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `iptv-debug-${stamp}.log`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addLine('info', ['Log guardado localmente (descarga)']);
        } catch (e) {
            addLine('error', ['No se pudo guardar el log:', e.message || e]);
        }
    }

    function interceptConsole() {
        ['log', 'warn', 'error', 'info'].forEach((level) => {
            state.original[level] = console[level].bind(console);
            console[level] = function (...args) {
                try {
                    addLine(level, args);
                } catch (e) {
                    // no-op
                }
                state.original[level](...args);
            };
        });
    }

    function installKeyHandlers() {
        document.addEventListener('keydown', function (event) {
            const key = event.keyCode;
            if (key === KEY_TOGGLE) {
                toggle();
                event.preventDefault();
            } else if (key === KEY_SAVE) {
                if (hasUploadUrl()) {
                    uploadLogs();
                } else {
                    saveToFile();
                }
                event.preventDefault();
            } else if (key === KEY_CLEAR) {
                clear();
                event.preventDefault();
            }
        });
    }

    function installGlobalHandlers() {
        window.addEventListener('error', function (event) {
            addLine('error', ['Global error:', event.message || event.error]);
        });
        window.addEventListener('unhandledrejection', function (event) {
            addLine('error', ['Unhandled promise:', event.reason]);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        restore();
        ensureOverlay();
        render();
    });

    interceptConsole();
    installKeyHandlers();
    installGlobalHandlers();

    window.DebugLogger = {
        toggle,
        saveToFile,
        uploadLogs,
        clear
    };
})();
