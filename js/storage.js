/**
 * Módulo de almacenamiento local para la aplicación IPTV
 * Maneja la persistencia de datos usando localStorage
 */
const Storage = {
    /**
     * Guarda un valor en localStorage
     * @param {string} key - Clave de almacenamiento
     * @param {*} value - Valor a guardar (se serializa a JSON)
     */
    set(key, value) {
        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(key, serialized);
            return true;
        } catch (error) {
            console.error('Error guardando en storage:', error);
            return false;
        }
    },
    
    /**
     * Obtiene un valor de localStorage
     * @param {string} key - Clave de almacenamiento
     * @param {*} defaultValue - Valor por defecto si no existe
     * @returns {*} Valor deserializado o defaultValue
     */
    get(key, defaultValue = null) {
        try {
            const serialized = localStorage.getItem(key);
            if (serialized === null) {
                return defaultValue;
            }
            return JSON.parse(serialized);
        } catch (error) {
            console.error('Error leyendo de storage:', error);
            return defaultValue;
        }
    },
    
    /**
     * Elimina un valor de localStorage
     * @param {string} key - Clave a eliminar
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error eliminando de storage:', error);
            return false;
        }
    },
    
    /**
     * Limpia todo el localStorage
     */
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Error limpiando storage:', error);
            return false;
        }
    },
    
    // Métodos específicos para la aplicación
    
    /**
     * Guarda las credenciales del usuario
     */
    saveCredentials(username, password) {
        return this.set(CONFIG.STORAGE_KEYS.CREDENTIALS, { username, password });
    },
    
    /**
     * Obtiene las credenciales guardadas
     */
    getCredentials() {
        return this.get(CONFIG.STORAGE_KEYS.CREDENTIALS, null);
    },
    
    /**
     * Elimina las credenciales
     */
    clearCredentials() {
        return this.remove(CONFIG.STORAGE_KEYS.CREDENTIALS);
    },
    
    /**
     * Guarda la playlist de canales
     */
    savePlaylist(playlist) {
        return this.set(CONFIG.STORAGE_KEYS.PLAYLIST, playlist);
    },
    
    /**
     * Obtiene la playlist guardada
     */
    getPlaylist() {
        return this.get(CONFIG.STORAGE_KEYS.PLAYLIST, []);
    },
    
    /**
     * Guarda el último canal visto
     */
    saveLastChannel(channelIndex) {
        return this.set(CONFIG.STORAGE_KEYS.LAST_CHANNEL, channelIndex);
    },
    
    /**
     * Obtiene el último canal visto
     */
    getLastChannel() {
        return this.get(CONFIG.STORAGE_KEYS.LAST_CHANNEL, 0);
    },
    
    /**
     * Guarda la calidad de video preferida
     */
    saveQuality(quality) {
        return this.set(CONFIG.STORAGE_KEYS.QUALITY, quality);
    },
    
    /**
     * Obtiene la calidad de video preferida
     */
    getQuality() {
        return this.get(CONFIG.STORAGE_KEYS.QUALITY, 'AUTO');
    },
    
    /**
     * Guarda los favoritos
     */
    saveFavorites(favorites) {
        return this.set(CONFIG.STORAGE_KEYS.FAVORITES, favorites);
    },
    
    /**
     * Obtiene los favoritos
     */
    getFavorites() {
        return this.get(CONFIG.STORAGE_KEYS.FAVORITES, []);
    },
    
    /**
     * Agrega un canal a favoritos
     */
    addFavorite(channelId) {
        const favorites = this.getFavorites();
        if (!favorites.includes(channelId)) {
            favorites.push(channelId);
            this.saveFavorites(favorites);
        }
        return favorites;
    },
    
    /**
     * Elimina un canal de favoritos
     */
    removeFavorite(channelId) {
        let favorites = this.getFavorites();
        favorites = favorites.filter(id => id !== channelId);
        this.saveFavorites(favorites);
        return favorites;
    },
    
    /**
     * Verifica si un canal es favorito
     */
    isFavorite(channelId) {
        return this.getFavorites().includes(channelId);
    },
    
    /**
     * Establece el estado de sesión activa
     * @param {boolean} active - Si la sesión está activa
     */
    setActiveSession(active) {
        return this.set(CONFIG.STORAGE_KEYS.ACTIVE_SESSION, active);
    },
    
    /**
     * Verifica si hay una sesión activa
     * @returns {boolean}
     */
    hasActiveSession() {
        return this.get(CONFIG.STORAGE_KEYS.ACTIVE_SESSION, false);
    }
};

// Hacer Storage global
window.Storage = Storage;

