/**
 * Parser de archivos M3U para la aplicación IPTV
 * Convierte el contenido M3U en una lista estructurada de canales
 */
const M3UParser = {
    /**
     * Parsea el contenido de un archivo M3U
     * @param {string} content - Contenido del archivo M3U
     * @returns {Object} Objeto con canales y categorías
     */
    parse(content) {
        if (!content || typeof content !== 'string') {
            console.error('Contenido de playlist inválido');
            return { channels: [], categories: [], totalChannels: 0 };
        }
        
        // Normalizar saltos de línea
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = content.split('\n');
        const channels = [];
        const categories = new Map();
        
        let currentChannel = null;
        let channelNumber = 1;
        
        console.log(`Parseando playlist: ${lines.length} líneas`);
        
        // Detectar formato
        const hasExtInf = content.includes('#EXTINF');
        const hasChannelName = content.includes('Channel name:');
        const hasNameTag = content.includes('#Name:');
        
        console.log('Formato detectado:', {
            'M3U estándar (#EXTINF)': hasExtInf,
            'WebTVList (Channel name:)': hasChannelName,
            'Simple (#Name:)': hasNameTag
        });
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            
            // Saltar líneas vacías y líneas de fin de formato
            if (!line || line === '[Webtv channel END]' || line === '#EXTM3U') continue;
            
            // Formato webtvlist de XUI: Channel name: y URL: en líneas separadas
            if (line.startsWith('Channel name:')) {
                const name = line.replace('Channel name:', '').trim();
                // Buscar la siguiente línea que tenga URL:
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (nextLine.startsWith('URL:')) {
                        const url = this.normalizeUrl(nextLine.replace('URL:', '').trim());
                        
                        if (url && this.isValidStreamUrl(url)) {
                            const channel = {
                                id: `channel_${channelNumber}`,
                                name: name || `Canal ${channelNumber}`,
                                url: url,
                                logo: null,
                                category: 'Sin categoría',
                                number: channelNumber
                            };
                            
                            channels.push(channel);
                            const category = channel.category;
                            if (!categories.has(category)) {
                                categories.set(category, []);
                            }
                            categories.get(category).push(channel);
                            channelNumber++;
                            i++; // Saltar la línea de URL que ya procesamos
                        }
                    }
                }
                continue;
            }
            
            // Formato simple de XUI: URL #Name: Nombre del Canal
            if (line.includes(' #Name: ')) {
                const parts = line.split(' #Name: ');
                if (parts.length === 2) {
                    const url = this.normalizeUrl(parts[0]);
                    const name = parts[1].trim();
                    
                    if (url && this.isValidStreamUrl(url)) {
                        const channel = {
                            id: `channel_${channelNumber}`,
                            name: name || `Canal ${channelNumber}`,
                            url: url,
                            logo: null,
                            category: 'Sin categoría',
                            number: channelNumber
                        };
                        
                        channels.push(channel);
                        const category = channel.category;
                        if (!categories.has(category)) {
                            categories.set(category, []);
                        }
                        categories.get(category).push(channel);
                        channelNumber++;
                    }
                }
                continue;
            }
            
            // Formato M3U estándar: #EXTINF:
            if (line.startsWith('#EXTINF:')) {
                // Parsear información del canal (formato M3U estándar)
                currentChannel = this.parseExtInf(line, channelNumber);
                channelNumber++;
            } else if (line.startsWith('#EXT')) {
                // Ignorar otras etiquetas EXT pero mantener el canal actual
                continue;
            } else if (!line.startsWith('#') && currentChannel) {
                // URL del stream - limpiar y normalizar
                const url = this.normalizeUrl(line);
                
                if (url && this.isValidStreamUrl(url)) {
                    currentChannel.url = url;
                    
                    // Asegurar que el canal tenga nombre
                    if (!currentChannel.name || currentChannel.name.trim() === '') {
                        currentChannel.name = `Canal ${currentChannel.number}`;
                    }
                    
                    // Agregar canal a la lista
                    channels.push(currentChannel);
                    
                    // Agregar a la categoría correspondiente
                    const category = currentChannel.category || 'Sin categoría';
                    if (!categories.has(category)) {
                        categories.set(category, []);
                    }
                    categories.get(category).push(currentChannel);
                    
                    currentChannel = null;
                } else {
                    console.warn('URL inválida ignorada:', line.substring(0, 50));
                    currentChannel = null;
                }
            }
        }
        
        console.log(`Playlist parseada: ${channels.length} canales encontrados en ${categories.size} categorías`);
        
        if (channels.length === 0) {
            console.warn('No se encontraron canales en la playlist. Contenido:', content.substring(0, 500));
        }
        
        return {
            channels,
            categories: this.categoriesToArray(categories),
            totalChannels: channels.length
        };
    },
    
    /**
     * Normaliza una URL del stream
     * @param {string} url - URL a normalizar
     * @returns {string} URL normalizada
     */
    normalizeUrl(url) {
        if (!url) return '';
        
        // Eliminar espacios y caracteres especiales al inicio/final
        url = url.trim();
        
        // Eliminar caracteres de control
        url = url.replace(/[\x00-\x1F\x7F]/g, '');
        
        // Si la URL no tiene protocolo, intentar agregarlo
        if (!url.match(/^https?:\/\//i) && !url.match(/^rtmp?:\/\//i) && !url.match(/^rtsp:\/\//i)) {
            // Si parece una URL pero le falta protocolo, agregar http://
            if (url.includes('.') && !url.startsWith('/')) {
                url = 'http://' + url;
            }
        }
        
        return url;
    },
    
    /**
     * Verifica si una URL es válida para streaming
     * @param {string} url - URL a verificar
     * @returns {boolean}
     */
    isValidStreamUrl(url) {
        if (!url || url.length < 5) return false;
        
        // Verificar que tenga un protocolo válido
        const validProtocols = ['http://', 'https://', 'rtmp://', 'rtmps://', 'rtsp://'];
        const hasValidProtocol = validProtocols.some(protocol => 
            url.toLowerCase().startsWith(protocol)
        );
        
        return hasValidProtocol;
    },
    
    /**
     * Parsea una línea EXTINF
     * @param {string} line - Línea EXTINF
     * @param {number} number - Número de canal
     * @returns {Object} Objeto con la información del canal
     */
    parseExtInf(line, number) {
        const channel = {
            id: '',
            name: '',
            url: '',
            logo: null,
            category: '',
            number: number
        };
        
        // Extraer nombre (después de la última coma)
        const nameMatch = line.match(/,(.+)$/);
        if (nameMatch) {
            channel.name = nameMatch[1].trim();
        }
        
        // Extraer tvg-id
        const idMatch = line.match(/tvg-id="([^"]*)"/);
        if (idMatch) {
            channel.id = idMatch[1];
        }
        
        // Extraer logo (soporta tvg-logo, logo, channel-logo)
        const logoMatch = line.match(/(?:tvg-logo|logo|channel-logo)="([^"]+)"/i);
        if (logoMatch && logoMatch[1] && logoMatch[1].trim() !== '') {
            let logoUrl = logoMatch[1].trim();
            // Si es URL absoluta, usarla directamente
            if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
                channel.logo = logoUrl;
            } else if (logoUrl.startsWith('/')) {
                // Si es ruta relativa, construir URL completa con el servidor
                channel.logo = CONFIG.SERVER.BASE_URL + logoUrl;
            } else {
                // Ruta relativa sin slash inicial
                channel.logo = CONFIG.SERVER.BASE_URL + '/' + logoUrl;
            }
        }
        
        // Extraer group-title (categoría)
        const categoryMatch = line.match(/group-title="([^"]*)"/);
        if (categoryMatch) {
            channel.category = categoryMatch[1];
        }
        
        // Generar ID si no existe
        if (!channel.id) {
            channel.id = `channel_${number}`;
        }
        
        return channel;
    },
    
    /**
     * Convierte el Map de categorías a un array
     * @param {Map} categoriesMap - Map de categorías
     * @returns {Array} Array de objetos de categoría
     */
    categoriesToArray(categoriesMap) {
        const result = [];
        categoriesMap.forEach((channels, name) => {
            result.push({
                name,
                channels
            });
        });
        return result;
    },
    
    /**
     * Busca canales por nombre
     * @param {Array} channels - Lista de canales
     * @param {string} query - Término de búsqueda
     * @returns {Array} Canales que coinciden con la búsqueda
     */
    searchChannels(channels, query) {
        if (!query || query.trim() === '') {
            return channels;
        }
        
        const searchTerm = query.toLowerCase().trim();
        return channels.filter(channel => {
            return channel.name.toLowerCase().includes(searchTerm) ||
                   channel.category.toLowerCase().includes(searchTerm) ||
                   channel.number.toString().includes(searchTerm);
        });
    },
    
    /**
     * Encuentra un canal por número
     * @param {Array} channels - Lista de canales
     * @param {number} number - Número de canal
     * @returns {Object|null} Canal encontrado o null
     */
    findChannelByNumber(channels, number) {
        return channels.find(channel => channel.number === number) || null;
    },
    
    /**
     * Obtiene el índice de un canal por número
     * @param {Array} channels - Lista de canales
     * @param {number} number - Número de canal
     * @returns {number} Índice del canal o -1
     */
    getChannelIndexByNumber(channels, number) {
        return channels.findIndex(channel => channel.number === number);
    }
};

// Hacer M3UParser global
window.M3UParser = M3UParser;

