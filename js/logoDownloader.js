/**
 * Módulo para descargar y gestionar logos de canales automáticamente
 * Descarga logos desde URLs remotas y los almacena localmente
 * 
 * ESTRATEGIA DE BÚSQUEDA (en orden de precisión):
 * 1. PRIORIDAD MÁXIMA: Buscar por tvg-id (si está disponible en el M3U)
 *    - El tvg-id es un identificador único estándar en listas IPTV
 *    - Permite encontrar el logo exacto del canal
 * 
 * 2. PRIORIDAD ALTA: Base de datos de canales conocidos
 *    - Lista curada de canales populares con sus logos
 *    - Usa algoritmo de similitud para matching preciso
 * 
 * 3. PRIORIDAD MEDIA: Repositorio IPTV-org (GitHub)
 *    - Base de datos pública masiva de logos de TV
 *    - Busca por múltiples variaciones del nombre
 * 
 * 4. PRIORIDAD BAJA: Otras fuentes públicas
 *    - Clearbit, Simple Icons, etc.
 *    - Útiles para marcas conocidas
 * 
 * El sistema prueba todas las fuentes en orden hasta encontrar un logo válido.
 */
const LogoDownloader = {
    // Cache de logos descargados (URL original -> blob URL)
    logoCache: new Map(),
    
    // Configuración
    config: {
        // Tiempo máximo de espera para descargar un logo (ms)
        DOWNLOAD_TIMEOUT: 10000,
        
        // Tamaño máximo de logo en bytes (5MB)
        MAX_LOGO_SIZE: 5 * 1024 * 1024,
        
        // Formatos de imagen soportados
        SUPPORTED_FORMATS: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'],
        
        // Intentar descargar logos automáticamente al parsear canales
        AUTO_DOWNLOAD: true,
        
        // Buscar logos automáticamente para canales sin logo
        AUTO_FIND_MISSING_LOGOS: true,
        
        // Número máximo de descargas simultáneas
        MAX_CONCURRENT_DOWNLOADS: 5,
        
        // Número máximo de búsquedas simultáneas de logos
        MAX_CONCURRENT_SEARCHES: 3
    },
    
    /**
     * Inicializa el módulo y carga el cache desde localStorage
     */
    init() {
        this.loadCache();
        console.log('LogoDownloader inicializado, cache cargado:', this.logoCache.size, 'logos');
    },
    
    /**
     * Descarga un logo desde una URL y lo convierte a blob URL
     * @param {string} logoUrl - URL del logo a descargar
     * @param {string} channelId - ID del canal (para logging)
     * @returns {Promise<string|null>} Blob URL del logo o null si falla
     */
    async downloadLogo(logoUrl, channelId = '') {
        if (!logoUrl || typeof logoUrl !== 'string') {
            return null;
        }
        
        // Verificar si ya está en cache
        if (this.logoCache.has(logoUrl)) {
            const cached = this.logoCache.get(logoUrl);
            // Verificar que el blob URL sigue siendo válido
            if (cached && cached.blobUrl) {
                console.log(`Logo en cache para canal ${channelId}:`, logoUrl);
                return cached.blobUrl;
            }
        }
        
        try {
            console.log(`Descargando logo para canal ${channelId}:`, logoUrl);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.DOWNLOAD_TIMEOUT);
            
            const response = await fetch(logoUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'image/*',
                    'Cache-Control': 'no-cache'
                },
                signal: controller.signal,
                referrerPolicy: 'no-referrer'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn(`Error descargando logo ${logoUrl}:`, response.status, response.statusText);
                return null;
            }
            
            // Verificar content-type
            const contentType = response.headers.get('content-type') || '';
            const isValidImage = this.config.SUPPORTED_FORMATS.some(format => 
                contentType.toLowerCase().includes(format.split('/')[1])
            );
            
            if (!isValidImage && !contentType.startsWith('image/')) {
                console.warn(`Formato de imagen no soportado para ${logoUrl}:`, contentType);
                // Intentar de todas formas si parece una URL de imagen
                if (!logoUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i)) {
                    return null;
                }
            }
            
            // Verificar tamaño
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > this.config.MAX_LOGO_SIZE) {
                console.warn(`Logo demasiado grande para ${logoUrl}:`, contentLength, 'bytes');
                return null;
            }
            
            // Descargar como blob
            const blob = await response.blob();
            
            // Verificar tamaño del blob descargado
            if (blob.size > this.config.MAX_LOGO_SIZE) {
                console.warn(`Logo descargado demasiado grande para ${logoUrl}:`, blob.size, 'bytes');
                return null;
            }
            
            // Crear blob URL
            const blobUrl = URL.createObjectURL(blob);
            
            // Guardar en cache
            this.logoCache.set(logoUrl, {
                blobUrl: blobUrl,
                size: blob.size,
                contentType: blob.type,
                downloadedAt: Date.now()
            });
            
            // Guardar cache en localStorage
            this.saveCache();
            
            console.log(`Logo descargado exitosamente para canal ${channelId}:`, logoUrl, `(${blob.size} bytes)`);
            return blobUrl;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`Timeout descargando logo ${logoUrl} para canal ${channelId}`);
            } else {
                console.warn(`Error descargando logo ${logoUrl} para canal ${channelId}:`, error.message);
            }
            return null;
        }
    },
    
    /**
     * Descarga logos para múltiples canales de forma concurrente
     * @param {Array} channels - Array de canales con propiedad 'logo'
     * @param {Function} onProgress - Callback de progreso (canalIndex, total, downloaded)
     * @returns {Promise<Array>} Array de canales actualizados con logos descargados
     */
    async downloadLogosForChannels(channels, onProgress = null) {
        if (!channels || channels.length === 0) {
            return channels;
        }
        
        console.log(`Iniciando descarga de logos para ${channels.length} canales`);
        
        const channelsWithLogos = channels.filter(ch => ch.logo && ch.logo.trim() !== '');
        const total = channelsWithLogos.length;
        let downloaded = 0;
        
        if (total === 0) {
            console.log('No hay canales con logos para descargar');
            return channels;
        }
        
        // Procesar en lotes para no sobrecargar
        const batchSize = this.config.MAX_CONCURRENT_DOWNLOADS;
        const updatedChannels = [...channels];
        
        for (let i = 0; i < channelsWithLogos.length; i += batchSize) {
            const batch = channelsWithLogos.slice(i, i + batchSize);
            
            const promises = batch.map(async (channel, batchIndex) => {
                const channelIndex = updatedChannels.findIndex(ch => ch.id === channel.id);
                if (channelIndex === -1) return;
                
                const blobUrl = await this.downloadLogo(channel.logo, channel.id);
                if (blobUrl) {
                    updatedChannels[channelIndex].logo = blobUrl;
                    downloaded++;
                    
                    if (onProgress) {
                        onProgress(channelIndex, total, downloaded);
                    }
                }
            });
            
            await Promise.all(promises);
        }
        
        console.log(`Descarga de logos completada: ${downloaded}/${total} logos descargados exitosamente`);
        return updatedChannels;
    },
    
    /**
     * Calcula la similitud entre dos strings usando distancia de Levenshtein
     * @param {string} str1 - Primera cadena
     * @param {string} str2 - Segunda cadena
     * @returns {number} Similitud entre 0 y 1 (1 = idéntico)
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1 === str2) return 1;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1;
        
        // Distancia de Levenshtein
        const distance = this.levenshteinDistance(longer, shorter);
        const similarity = (longer.length - distance) / longer.length;
        
        return similarity;
    },
    
    /**
     * Calcula la distancia de Levenshtein entre dos strings
     * @param {string} str1 - Primera cadena
     * @param {string} str2 - Segunda cadena
     * @returns {number} Distancia
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    },
    
    /**
     * Normaliza el nombre del canal para búsqueda
     * @param {string} name - Nombre del canal
     * @returns {Object} Objeto con diferentes variaciones del nombre
     */
    normalizeChannelName(name) {
        if (!name) return { original: '', clean: '', noSpaces: '', slug: '' };
        
        const original = name.trim();
        
        // Nombre limpio (sin caracteres especiales, minúsculas)
        const clean = original
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, ' ');
        
        // Nombre sin espacios
        const noSpaces = clean.replace(/\s+/g, '');
        
        // Slug (con guiones)
        const slug = clean.replace(/\s+/g, '-');
        
        // Nombre sin palabras comunes de TV
        const withoutTVWords = clean
            .replace(/\b(tv|television|channel|canal|hd|fhd|uhd|4k|plus|pro|max|premium|ultra)\b/gi, '')
            .trim()
            .replace(/\s+/g, ' ');
        
        // Extraer palabras clave (las primeras 2-3 palabras significativas)
        const words = clean.split(' ').filter(w => w.length > 2);
        const keywords = words.slice(0, 3).join(' ');
        
        // Variación sin números al final (ej: "CNN HD" -> "CNN")
        const withoutNumbers = clean.replace(/\s*\d+\s*$/, '').trim();
        
        // Variación solo con la primera palabra (para canales como "FOX Sports")
        const firstWord = words.length > 0 ? words[0] : '';
        
        return {
            original,
            clean,
            noSpaces,
            slug,
            withoutTVWords,
            keywords,
            withoutNumbers,
            firstWord
        };
    },
    
    /**
     * Genera URLs de búsqueda de logos basadas en el nombre del canal
     * @param {Object} nameVariations - Variaciones del nombre del canal
     * @param {string} tvgId - ID del canal (tvg-id) opcional para búsqueda más precisa
     * @returns {Array<string>} Array de URLs a probar (ordenadas por prioridad)
     */
    generateLogoSources(nameVariations, tvgId = null) {
        const sources = [];
        const { clean, noSpaces, slug, withoutTVWords, keywords, withoutNumbers, firstWord } = nameVariations;
        
        // Si tenemos tvg-id, agregarlo a las fuentes prioritarias
        if (tvgId && tvgId.trim() !== '' && !tvgId.startsWith('channel_')) {
            const cleanTvgId = tvgId.trim().toLowerCase();
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${cleanTvgId}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${cleanTvgId}.jpg`);
        }
        
        // 1. Logos de canales conocidos (base de datos local/estática) - PRIORIDAD ALTA
        // Estos son los más confiables, probarlos primero
        const commonChannels = this.getCommonChannelLogos(clean, noSpaces);
        sources.push(...commonChannels);
        
        // También buscar con variaciones adicionales
        if (withoutTVWords && withoutTVWords !== clean) {
            const moreCommon = this.getCommonChannelLogos(withoutTVWords, withoutTVWords.replace(/\s+/g, ''));
            sources.push(...moreCommon);
        }
        
        if (withoutNumbers && withoutNumbers !== clean) {
            const moreCommon = this.getCommonChannelLogos(withoutNumbers, withoutNumbers.replace(/\s+/g, ''));
            sources.push(...moreCommon);
        }
        
        if (firstWord && firstWord.length >= 3) {
            const moreCommon = this.getCommonChannelLogos(firstWord, firstWord);
            sources.push(...moreCommon);
        }
        
        // 2. IPTV-Org GitHub (repositorio público de logos de TV) - MÁS CONFIABLE
        // Este repositorio tiene una base de datos enorme de logos indexados por nombre exacto
        // Probar primero sin palabras de TV y números (más preciso)
        if (withoutTVWords) {
            const tvWordsSlug = withoutTVWords.replace(/\s+/g, '-').toLowerCase();
            const tvWordsNoSpaces = withoutTVWords.replace(/\s+/g, '').toLowerCase();
            const tvWordsUnderscore = withoutTVWords.replace(/\s+/g, '_').toLowerCase();
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${tvWordsSlug}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${tvWordsNoSpaces}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${tvWordsUnderscore}.png`);
        }
        
        if (withoutNumbers) {
            const noNumbersSlug = withoutNumbers.replace(/\s+/g, '-').toLowerCase();
            const noNumbersNoSpaces = withoutNumbers.replace(/\s+/g, '').toLowerCase();
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${noNumbersSlug}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${noNumbersNoSpaces}.png`);
        }
        
        // Variaciones con slug estándar
        if (slug) {
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${slug.toLowerCase()}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${slug.toLowerCase()}.jpg`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${slug.toLowerCase().replace(/-/g, '_')}.png`);
        }
        
        if (noSpaces) {
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${noSpaces.toLowerCase()}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${noSpaces.toLowerCase()}.jpg`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${noSpaces.toLowerCase().replace(/-/g, '_')}.png`);
        }
        
        // Probar con primera palabra si es significativa
        if (firstWord && firstWord.length >= 3) {
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${firstWord.toLowerCase()}.png`);
        }
        
        // Probar con nombre completo en diferentes formatos
        if (clean) {
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${clean.replace(/\s+/g, '-').toLowerCase()}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${clean.replace(/\s+/g, '_').toLowerCase()}.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${clean.replace(/\s+/g, '').toLowerCase()}.png`);
        }
        
        // Probar variaciones específicas para nombres comunes chilenos
        // CNN CHILE -> cnnchile, cnn-chile, cnn_chile
        if (clean.includes('cnn') && clean.includes('chile')) {
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/cnnchile.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/cnn-chile.png`);
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/cnn_chile.png`);
        }
        
        // 3. Clearbit Logo API (gratuita, para dominios conocidos)
        if (noSpaces && noSpaces.length > 3) {
            sources.push(`https://logo.clearbit.com/${noSpaces}.com`);
            sources.push(`https://logo.clearbit.com/${noSpaces}.tv`);
            sources.push(`https://logo.clearbit.com/${noSpaces}.net`);
        }
        
        // 4. Simple Icons CDN (para marcas conocidas)
        if (noSpaces && noSpaces.length > 2) {
            sources.push(`https://cdn.simpleicons.org/${noSpaces}/white`);
            sources.push(`https://cdn.simpleicons.org/${noSpaces}`);
        }
        
        // 5. Logos-world.net (base de datos de logos conocidos)
        // Formato común: nombre-canal-logo.png
        if (slug) {
            sources.push(`https://logos-world.net/wp-content/uploads/${slug}.png`);
            sources.push(`https://logos-world.net/wp-content/uploads/${slug}.jpg`);
        }
        
        // 6. TV Logo databases alternativos
        if (noSpaces) {
            sources.push(`https://raw.githubusercontent.com/andreaswilli/tv-logos/master/logos/${noSpaces.toLowerCase()}.png`);
        }
        
        // 7. Búsqueda por palabras clave (si el nombre es muy largo)
        if (keywords && keywords !== clean) {
            const keywordSlug = keywords.replace(/\s+/g, '-').toLowerCase();
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${keywordSlug}.png`);
        }
        
        // 8. API de búsqueda de logos por nombre (si está disponible)
        // Nota: Algunas APIs requieren autenticación, pero podemos intentar endpoints públicos
        
        // 9. Logos indexados por nombre exacto en otros repositorios
        if (clean) {
            // Algunos repositorios usan el nombre exacto del canal
            const exactName = clean.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase();
            sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${exactName}.png`);
        }
        
        // Eliminar duplicados manteniendo el orden
        return [...new Set(sources)];
    },
    
    /**
     * Obtiene URLs de logos para canales comunes conocidos con matching preciso
     * @param {string} cleanName - Nombre limpio del canal
     * @param {string} noSpaces - Nombre sin espacios
     * @returns {Array<{url: string, score: number}>} URLs de logos conocidos con puntuación
     */
    getCommonChannelLogos(cleanName, noSpaces) {
        const commonLogos = {
            // Streaming Services
            'disney': 'https://logos-world.net/wp-content/uploads/2020/11/Disney-Plus-Logo.png',
            'disneyplus': 'https://logos-world.net/wp-content/uploads/2020/11/Disney-Plus-Logo.png',
            'disney plus': 'https://logos-world.net/wp-content/uploads/2020/11/Disney-Plus-Logo.png',
            'netflix': 'https://logos-world.net/wp-content/uploads/2020/04/Netflix-Logo.png',
            'hbo': 'https://logos-world.net/wp-content/uploads/2020/03/HBO-Logo.png',
            'hbo max': 'https://logos-world.net/wp-content/uploads/2020/05/HBO-Max-Logo.png',
            'hbomax': 'https://logos-world.net/wp-content/uploads/2020/05/HBO-Max-Logo.png',
            'amazon prime': 'https://logos-world.net/wp-content/uploads/2021/02/Amazon-Prime-Video-Logo.png',
            'primevideo': 'https://logos-world.net/wp-content/uploads/2021/02/Amazon-Prime-Video-Logo.png',
            'prime video': 'https://logos-world.net/wp-content/uploads/2021/02/Amazon-Prime-Video-Logo.png',
            'paramount': 'https://logos-world.net/wp-content/uploads/2021/03/Paramount-Plus-Logo.png',
            'paramountplus': 'https://logos-world.net/wp-content/uploads/2021/03/Paramount-Plus-Logo.png',
            'paramount plus': 'https://logos-world.net/wp-content/uploads/2021/03/Paramount-Plus-Logo.png',
            'apple tv': 'https://logos-world.net/wp-content/uploads/2020/06/Apple-TV-Logo.png',
            'appletv': 'https://logos-world.net/wp-content/uploads/2020/06/Apple-TV-Logo.png',
            
            // News Channels
            'cnn': 'https://logos-world.net/wp-content/uploads/2020/06/CNN-Logo.png',
            'bbc': 'https://logos-world.net/wp-content/uploads/2020/06/BBC-Logo.png',
            'bbc news': 'https://logos-world.net/wp-content/uploads/2020/06/BBC-News-Logo.png',
            'fox news': 'https://logos-world.net/wp-content/uploads/2020/11/Fox-News-Logo.png',
            'msnbc': 'https://logos-world.net/wp-content/uploads/2020/06/MSNBC-Logo.png',
            'sky news': 'https://logos-world.net/wp-content/uploads/2020/06/Sky-News-Logo.png',
            'al jazeera': 'https://logos-world.net/wp-content/uploads/2020/06/Al-Jazeera-Logo.png',
            'aljazeera': 'https://logos-world.net/wp-content/uploads/2020/06/Al-Jazeera-Logo.png',
            
            // Sports
            'espn': 'https://logos-world.net/wp-content/uploads/2018/06/ESPN-Logo.png',
            'fox sports': 'https://logos-world.net/wp-content/uploads/2020/11/Fox-Sports-Logo.png',
            'foxsports': 'https://logos-world.net/wp-content/uploads/2020/11/Fox-Sports-Logo.png',
            'nfl network': 'https://logos-world.net/wp-content/uploads/2020/06/NFL-Network-Logo.png',
            'nflnetwork': 'https://logos-world.net/wp-content/uploads/2020/06/NFL-Network-Logo.png',
            'nba tv': 'https://logos-world.net/wp-content/uploads/2020/06/NBA-TV-Logo.png',
            'nbatv': 'https://logos-world.net/wp-content/uploads/2020/06/NBA-TV-Logo.png',
            
            // Entertainment
            'fox': 'https://logos-world.net/wp-content/uploads/2020/11/Fox-Logo.png',
            'abc': 'https://logos-world.net/wp-content/uploads/2020/06/ABC-Logo.png',
            'cbs': 'https://logos-world.net/wp-content/uploads/2020/06/CBS-Logo.png',
            'nbc': 'https://logos-world.net/wp-content/uploads/2020/06/NBC-Logo.png',
            'discovery': 'https://logos-world.net/wp-content/uploads/2020/06/Discovery-Channel-Logo.png',
            'discovery channel': 'https://logos-world.net/wp-content/uploads/2020/06/Discovery-Channel-Logo.png',
            'national geographic': 'https://logos-world.net/wp-content/uploads/2020/06/National-Geographic-Logo.png',
            'natgeo': 'https://logos-world.net/wp-content/uploads/2020/06/National-Geographic-Logo.png',
            'nat geo': 'https://logos-world.net/wp-content/uploads/2020/06/National-Geographic-Logo.png',
            'history': 'https://logos-world.net/wp-content/uploads/2020/06/History-Channel-Logo.png',
            'history channel': 'https://logos-world.net/wp-content/uploads/2020/06/History-Channel-Logo.png',
            'cartoon network': 'https://logos-world.net/wp-content/uploads/2020/06/Cartoon-Network-Logo.png',
            'cartoonnetwork': 'https://logos-world.net/wp-content/uploads/2020/06/Cartoon-Network-Logo.png',
            'nickelodeon': 'https://logos-world.net/wp-content/uploads/2020/06/Nickelodeon-Logo.png',
            'nick': 'https://logos-world.net/wp-content/uploads/2020/06/Nickelodeon-Logo.png',
            'mtv': 'https://logos-world.net/wp-content/uploads/2020/06/MTV-Logo.png',
            'comedy central': 'https://logos-world.net/wp-content/uploads/2020/06/Comedy-Central-Logo.png',
            'comedycentral': 'https://logos-world.net/wp-content/uploads/2020/06/Comedy-Central-Logo.png',
            'animal planet': 'https://logos-world.net/wp-content/uploads/2020/06/Animal-Planet-Logo.png',
            'animalplanet': 'https://logos-world.net/wp-content/uploads/2020/06/Animal-Planet-Logo.png',
            'tlc': 'https://logos-world.net/wp-content/uploads/2020/06/TLC-Logo.png',
            'food network': 'https://logos-world.net/wp-content/uploads/2020/06/Food-Network-Logo.png',
            'foodnetwork': 'https://logos-world.net/wp-content/uploads/2020/06/Food-Network-Logo.png',
            'hgtv': 'https://logos-world.net/wp-content/uploads/2020/06/HGTV-Logo.png',
            'syfy': 'https://logos-world.net/wp-content/uploads/2020/06/Syfy-Logo.png',
            'amc': 'https://logos-world.net/wp-content/uploads/2020/06/AMC-Logo.png',
            'fx': 'https://logos-world.net/wp-content/uploads/2020/06/FX-Logo.png',
            'showtime': 'https://logos-world.net/wp-content/uploads/2020/06/Showtime-Logo.png',
            'starz': 'https://logos-world.net/wp-content/uploads/2020/06/Starz-Logo.png',
            'cinemax': 'https://logos-world.net/wp-content/uploads/2020/06/Cinemax-Logo.png',
            
            // Canales Chilenos
            'tvn': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvn.png',
            'television nacional': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvn.png',
            'television nacional de chile': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvn.png',
            'mega': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/mega.png',
            'mega chile': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/mega.png',
            'chilevision': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/chilevision.png',
            'chile vision': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/chilevision.png',
            'chv': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/chilevision.png',
            'canal 13': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13.png',
            'canal13': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13.png',
            'canal trece': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13.png',
            'la red': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/lared.png',
            'lared': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/lared.png',
            'cnn chile': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/cnnchile.png',
            'cnnchile': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/cnnchile.png',
            'tv+': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvplus.png',
            'tv plus': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvplus.png',
            'tvplus': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvplus.png',
            'zapping': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/zapping.png',
            'zapping tv': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/zapping.png',
            'ucv tv': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/ucvtv.png',
            'ucvtv': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/ucvtv.png',
            'ucv': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/ucvtv.png',
            'canal 9': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal9.png',
            'canal9': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal9.png',
            'tv chile': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvchile.png',
            'tvchile': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvchile.png',
            'canal 24 horas': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal24horas.png',
            'canal24horas': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal24horas.png',
            '24 horas': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal24horas.png',
            'mega plus': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/megaplus.png',
            'megaplus': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/megaplus.png',
            'chilevision noticias': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/chilevisionnoticias.png',
            'chilevision noticias 24': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/chilevisionnoticias.png',
            'tvn mas': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvnmas.png',
            'tvnmas': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvnmas.png',
            'tvn plus': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/tvnmas.png',
            'canal 13 cable': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13cable.png',
            'canal13cable': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13cable.png',
            '13c': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13cable.png',
            'cable 13': 'https://raw.githubusercontent.com/iptv-org/iptv/master/logos/canal13cable.png',
        };
        
        const results = [];
        const searchName = cleanName.toLowerCase();
        const searchNoSpaces = noSpaces.toLowerCase();
        const matches = [];
        
        // Buscar coincidencias con puntuación de similitud
        for (const [key, url] of Object.entries(commonLogos)) {
            const keyLower = key.toLowerCase();
            const keyNoSpaces = keyLower.replace(/\s+/g, '');
            let score = 0;
            
            // Coincidencia exacta (puntuación máxima)
            if (searchName === keyLower || searchNoSpaces === keyNoSpaces) {
                score = 1.0;
            }
            // El nombre contiene la clave completa
            else if (searchName.includes(keyLower) || searchNoSpaces.includes(keyNoSpaces)) {
                // Calcular similitud basada en qué tan bien coincide
                const similarity = this.calculateSimilarity(searchName, keyLower);
                score = similarity * 0.8; // Coincidencia parcial
            }
            // La clave está contenida en el nombre (menos preciso)
            else if (keyLower.includes(searchName) || keyNoSpaces.includes(searchNoSpaces)) {
                const similarity = this.calculateSimilarity(searchName, keyLower);
                score = similarity * 0.6;
            }
            // Similitud general (para nombres similares)
            else {
                const similarity = this.calculateSimilarity(searchName, keyLower);
                if (similarity > 0.7) { // Solo si es muy similar
                    score = similarity * 0.5;
                }
            }
            
            // Solo agregar si la puntuación es significativa y la clave tiene al menos 3 caracteres
            if (score > 0.5 && keyLower.length >= 3) {
                matches.push({ url, score, key: keyLower });
            }
        }
        
        // Ordenar por puntuación (mayor primero) y retornar solo URLs
        matches.sort((a, b) => b.score - a.score);
        
        // Retornar las mejores coincidencias (máximo 3)
        return matches.slice(0, 3).map(m => m.url);
    },
    
    /**
     * Verifica si una URL es una imagen válida
     * @param {string} url - URL a verificar
     * @returns {Promise<boolean>} true si es una imagen válida
     */
    async verifyImageUrl(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                referrerPolicy: 'no-referrer'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                return false;
            }
            
            const contentType = response.headers.get('content-type') || '';
            const isImage = contentType.startsWith('image/') || 
                           this.config.SUPPORTED_FORMATS.some(format => 
                               contentType.toLowerCase().includes(format.split('/')[1])
                           );
            
            return isImage;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Busca logo usando tvg-id (método más preciso)
     * @param {string} tvgId - ID del canal (tvg-id)
     * @returns {Promise<string|null>} URL del logo encontrado
     */
    async findLogoByTvgId(tvgId) {
        if (!tvgId || tvgId.trim() === '') {
            return null;
        }
        
        const cleanId = tvgId.trim().toLowerCase();
        const sources = [];
        
        // 1. IPTV-Org usa tvg-id directamente en muchos casos (formato más común)
        sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${cleanId}.png`);
        sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${cleanId}.jpg`);
        
        // 2. Algunos repositorios usan tvg-id con formato específico (URL encoded)
        sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${encodeURIComponent(cleanId)}.png`);
        
        // 3. Si el tvg-id contiene caracteres especiales, probar variaciones
        const idVariations = [
            cleanId,
            cleanId.replace(/[^a-z0-9]/g, ''),
            cleanId.replace(/[^a-z0-9]/g, '-'),
            cleanId.replace(/[^a-z0-9]/g, '_'),
            cleanId.replace(/\s+/g, '-'),
            cleanId.replace(/\s+/g, '_')
        ];
        
        for (const variation of idVariations) {
            if (variation !== cleanId && variation.length > 0) {
                sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${variation}.png`);
                sources.push(`https://raw.githubusercontent.com/iptv-org/iptv/master/logos/${variation}.jpg`);
            }
        }
        
        // Probar cada fuente (priorizar PNG)
        for (const sourceUrl of sources) {
            try {
                const isValid = await this.verifyImageUrl(sourceUrl);
                if (isValid) {
                    console.log(`✓ Logo encontrado por tvg-id "${tvgId}":`, sourceUrl);
                    return sourceUrl;
                }
            } catch (error) {
                continue;
            }
        }
        
        return null;
    },
    
    /**
     * Busca el logo consultando el índice de canales de IPTV-org
     * Este método es más lento pero más preciso
     * @param {string} channelName - Nombre del canal
     * @param {string} tvgId - ID del canal (opcional)
     * @returns {Promise<string|null>} URL del logo encontrado
     */
    async findLogoInIptvOrgIndex(channelName, tvgId = null) {
        try {
            // El repositorio IPTV-org tiene un archivo de canales con sus logos
            // Podríamos consultar su API o índice, pero por ahora usamos búsqueda directa
            // Nota: Esto requiere que el nombre coincida exactamente con el del repositorio
            
            // Por ahora, retornamos null y confiamos en la búsqueda directa por nombre
            // En el futuro se podría implementar una consulta al índice JSON del repositorio
            return null;
        } catch (error) {
            console.warn('Error consultando índice de IPTV-org:', error);
            return null;
        }
    },
    
    /**
     * Intenta encontrar un logo automáticamente basándose en el nombre del canal
     * @param {Object} channel - Objeto del canal con nombre y posiblemente tvg-id
     * @returns {Promise<string|null>} URL del logo encontrado o null
     */
    async findLogoAutomatically(channel) {
        if (!channel || !channel.name) {
            return null;
        }
        
        console.log(`Buscando logo automáticamente para: "${channel.name}"${channel.id ? ` (tvg-id: ${channel.id})` : ''}`);
        
        // PRIORIDAD 1: Buscar por tvg-id si está disponible (más preciso)
        if (channel.id && channel.id !== `channel_${channel.number}` && !channel.id.startsWith('channel_')) {
            const logoByTvgId = await this.findLogoByTvgId(channel.id);
            if (logoByTvgId) {
                return logoByTvgId;
            }
        }
        
        // PRIORIDAD 2: Buscar por nombre normalizado
        const nameVariations = this.normalizeChannelName(channel.name);
        
        if (!nameVariations.clean) {
            return null;
        }
        
        // Generar todas las URLs posibles ordenadas por prioridad (incluir tvg-id si está disponible)
        const logoSources = this.generateLogoSources(nameVariations, channel.id);
        
        console.log(`Probando ${logoSources.length} fuentes de logos para "${channel.name}"`);
        
        // Probar cada fuente en paralelo (limitado a 5 simultáneas)
        const batchSize = 5;
        for (let i = 0; i < logoSources.length; i += batchSize) {
            const batch = logoSources.slice(i, i + batchSize);
            
            const results = await Promise.all(
                batch.map(async (sourceUrl) => {
                    try {
                        const isValid = await this.verifyImageUrl(sourceUrl);
                        if (isValid) {
                            return sourceUrl;
                        }
                    } catch (error) {
                        // Continuar con la siguiente
                    }
                    return null;
                })
            );
            
            // Si encontramos un logo válido, retornarlo
            const validLogo = results.find(url => url !== null);
            if (validLogo) {
                console.log(`✓ Logo encontrado para "${channel.name}":`, validLogo);
                return validLogo;
            }
        }
        
        console.log(`✗ No se encontró logo para "${channel.name}"`);
        return null;
    },
    
    /**
     * Procesa canales: descarga logos existentes y busca automáticamente si no tienen
     * @param {Array} channels - Array de canales
     * @param {boolean} autoFind - Si buscar logos automáticamente para canales sin logo
     * @param {Function} onProgress - Callback de progreso (processed, total, found)
     * @returns {Promise<Array>} Canales actualizados
     */
    async processChannels(channels, autoFind = null, onProgress = null) {
        if (!channels || channels.length === 0) {
            return channels;
        }
        
        // Usar configuración por defecto si no se especifica
        if (autoFind === null) {
            autoFind = this.config.AUTO_FIND_MISSING_LOGOS;
        }
        
        console.log(`Procesando logos para ${channels.length} canales (autoFind: ${autoFind})`);
        
        // Primero descargar logos existentes
        let updatedChannels = await this.downloadLogosForChannels(channels);
        
        // Si autoFind está activado, buscar logos para canales sin logo
        if (autoFind) {
            const channelsWithoutLogo = updatedChannels.filter(ch => !ch.logo || ch.logo.trim() === '');
            console.log(`Buscando logos automáticamente para ${channelsWithoutLogo.length} canales sin logo`);
            
            if (channelsWithoutLogo.length > 0) {
                let found = 0;
                const total = channelsWithoutLogo.length;
                
                // Procesar en lotes para no sobrecargar
                const batchSize = this.config.MAX_CONCURRENT_SEARCHES;
                
                for (let i = 0; i < channelsWithoutLogo.length; i += batchSize) {
                    const batch = channelsWithoutLogo.slice(i, i + batchSize);
                    
                    const promises = batch.map(async (channel) => {
                        try {
                            const foundLogo = await this.findLogoAutomatically(channel);
                            if (foundLogo) {
                                const blobUrl = await this.downloadLogo(foundLogo, channel.id);
                                if (blobUrl) {
                                    const index = updatedChannels.findIndex(ch => ch.id === channel.id);
                                    if (index !== -1) {
                                        updatedChannels[index].logo = blobUrl;
                                        found++;
                                        
                                        if (onProgress) {
                                            onProgress(i + batch.indexOf(channel) + 1, total, found);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.warn(`Error buscando logo para ${channel.name}:`, error);
                        }
                    });
                    
                    await Promise.all(promises);
                }
                
                console.log(`Búsqueda automática completada: ${found}/${total} logos encontrados`);
            }
        }
        
        return updatedChannels;
    },
    
    /**
     * Guarda el cache de logos en localStorage
     */
    saveCache() {
        try {
            // Convertir Map a objeto serializable
            const cacheData = {};
            this.logoCache.forEach((value, key) => {
                // No guardar blob URLs en localStorage (se regeneran)
                // Solo guardar metadatos
                cacheData[key] = {
                    size: value.size,
                    contentType: value.contentType,
                    downloadedAt: value.downloadedAt
                };
            });
            
            localStorage.setItem('iptv_logo_cache', JSON.stringify(cacheData));
        } catch (error) {
            console.warn('Error guardando cache de logos:', error);
        }
    },
    
    /**
     * Carga el cache de logos desde localStorage
     */
    loadCache() {
        try {
            const cacheData = localStorage.getItem('iptv_logo_cache');
            if (cacheData) {
                const parsed = JSON.parse(cacheData);
                // El cache se reconstruirá al descargar logos nuevamente
                // Por ahora solo guardamos las URLs para referencia
                Object.keys(parsed).forEach(url => {
                    this.logoCache.set(url, {
                        size: parsed[url].size,
                        contentType: parsed[url].contentType,
                        downloadedAt: parsed[url].downloadedAt,
                        blobUrl: null // Se regenerará al descargar
                    });
                });
            }
        } catch (error) {
            console.warn('Error cargando cache de logos:', error);
        }
    },
    
    /**
     * Limpia el cache de logos y libera blob URLs
     */
    clearCache() {
        // Liberar blob URLs
        this.logoCache.forEach((value) => {
            if (value.blobUrl) {
                try {
                    URL.revokeObjectURL(value.blobUrl);
                } catch (error) {
                    console.warn('Error revocando blob URL:', error);
                }
            }
        });
        
        this.logoCache.clear();
        localStorage.removeItem('iptv_logo_cache');
        console.log('Cache de logos limpiado');
    },
    
    /**
     * Obtiene estadísticas del cache
     * @returns {Object} Estadísticas del cache
     */
    getCacheStats() {
        let totalSize = 0;
        this.logoCache.forEach((value) => {
            totalSize += value.size || 0;
        });
        
        return {
            totalLogos: this.logoCache.size,
            totalSize: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
        };
    }
};

// Inicializar al cargar el módulo
LogoDownloader.init();

// Hacer LogoDownloader global
window.LogoDownloader = LogoDownloader;

