/**
 * Aplicación principal IPTV Premium para LG WebOS
 * Interfaz moderna con mejor visualización de logos
 */
const App = {
    currentScreen: 'splash-screen',
    channels: [],
    filteredChannels: [],
    categories: [],
    selectedCategory: null,
    channelNumberInput: '',
    channelNumberTimer: null,
    savedScrollPosition: 0, // Guardar posición del scroll antes de ir al reproductor

    async init() {
        try {
            console.log('Iniciando aplicación IPTV Premium para LG WebOS');
            
            // Verificar que CONFIG esté disponible
            if (typeof CONFIG === 'undefined') {
                console.error('ERROR: CONFIG no está definido. Verifica que config.js se cargue antes que app.js');
                // Mostrar error al usuario
                document.getElementById('splash-screen').innerHTML = 
                    '<div class="splash-content"><h2>Error de Carga</h2><p>No se pudo cargar la configuración</p></div>';
                return;
            }
            
            // Inicializar webOS si está disponible (no crítico si falla)
            try {
                this.initWebOS();
            } catch (error) {
                console.warn('Error al inicializar webOS (continuando):', error);
            }

            // En simulador/navegador, forzar perfil HLS si estaba en MPEGTS
            try {
                const isWebOS = typeof webOS !== 'undefined' ||
                                /web0s|webos|lg browser/i.test(navigator.userAgent);
                const hasConfig = typeof CONFIG !== 'undefined' && CONFIG.SERVER;
                if (!isWebOS && hasConfig && CONFIG.SERVER.ACTIVE_PROFILE === 'WEBOS_MPEGTS_DIRECT') {
                    if (typeof CONFIG.setActiveProfile === 'function') {
                        CONFIG.setActiveProfile('WEBOS_HLS_COMPAT');
                        console.log('Perfil ajustado a HLS para simulador/navegador');
                    } else {
                        CONFIG.SERVER.ACTIVE_PROFILE = 'WEBOS_HLS_COMPAT';
                    }
                }
            } catch (error) {
                console.warn('No se pudo ajustar perfil para simulador:', error);
            }
            
            // Inicializar módulos críticos con manejo de errores
            try {
                if (typeof Navigation !== 'undefined') {
                    Navigation.init();
                } else {
                    console.error('Navigation no está definido');
                }
            } catch (error) {
                console.error('Error al inicializar Navigation:', error);
            }
            
            try {
                if (typeof Player !== 'undefined') {
                    Player.init();
                } else {
                    console.error('Player no está definido');
                }
            } catch (error) {
                console.error('Error al inicializar Player:', error);
            }
            
            try {
                this.setupEventListeners();
            } catch (error) {
                console.error('Error al configurar event listeners:', error);
            }
            
            // Mostrar splash y luego verificar sesión activa
            // Reducir tiempo de espera si hay problemas
            const splashTimeout = CONFIG && CONFIG.TIMEOUTS ? CONFIG.TIMEOUTS.SPLASH : 2000;
            
            setTimeout(() => {
                try {
                    const hasActiveSession = Storage && Storage.hasActiveSession ? Storage.hasActiveSession() : false;
                    const credentials = Storage && Storage.getCredentials ? Storage.getCredentials() : null;
                    
                    if (hasActiveSession && credentials) {
                        // Sesión activa - ir directo a canales
                        this.autoLogin(credentials);
                    } else if (credentials) {
                        // Hay credenciales pero no sesión activa - mostrar login prellenado
                        this.prefillLogin(credentials);
                        this.showScreen('login-screen');
                    } else {
                        this.showScreen('login-screen');
                    }
                } catch (error) {
                    console.error('Error en transición de splash:', error);
                    // Forzar mostrar login si hay error
                    this.showScreen('login-screen');
                }
            }, splashTimeout);
            
        } catch (error) {
            console.error('Error crítico en inicialización:', error);
            console.error('Stack:', error.stack);
            // Intentar mostrar login de emergencia
            try {
                document.getElementById('splash-screen').classList.remove('active');
                document.getElementById('login-screen').classList.add('active');
            } catch (e) {
                console.error('No se pudo mostrar pantalla de error:', e);
            }
        }
    },
    
    /**
     * Prellena el formulario de login con credenciales guardadas
     */
    prefillLogin(credentials) {
        document.getElementById('username').value = credentials.username;
        document.getElementById('password').value = credentials.password;
    },

    /**
     * Asigna logos locales desde la carpeta imgs basándose en el número del canal
     * Busca archivos con el formato: imgs/{numero}.{extension}
     * Extensiones soportadas: svg, avif, webp, png, jpg, jpeg (en orden de prioridad)
     * Los logos locales tienen prioridad sobre logos remotos
     * @param {Array} channels - Array de canales
     * @returns {Array} Canales actualizados con logos locales asignados
     */
    assignLocalLogos(channels) {
        if (!channels || channels.length === 0) {
            return channels;
        }

        // Orden de prioridad: svg > avif > webp > png > jpg > jpeg
        const supportedExtensions = ['svg', 'avif', 'webp', 'png', 'jpg', 'jpeg'];
        let assignedCount = 0;

        // Procesar cada canal
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i];
            if (!channel.number) {
                continue;
            }
            
            // Guardar el número original del canal
            const channelNumber = parseInt(channel.number);
            
            if (isNaN(channelNumber)) {
                continue;
            }
            
            // Asignar logo local basándose en el número del canal
            // Prioridad: svg > avif > webp > png > jpg > jpeg
            // Crear un array con todas las posibles extensiones para que el HTML pruebe en orden
            const logoVariants = supportedExtensions.map(ext => `imgs/${channelNumber}.${ext}`);
            channel.logo = logoVariants[0]; // SVG por defecto (prioridad)
            channel._logoVariants = logoVariants; // Guardar todas las variantes para fallback
            channel._channelNumber = channelNumber; // Guardar número para generar fallback dinámico
            
            assignedCount++;
        }

        if (assignedCount > 0) {
            console.log(`Logos locales asignados: ${assignedCount} canales de ${channels.length} totales (formato principal: svg, con soporte para avif, webp, png, jpg, jpeg)`);
        }

        return channels;
    },

    /**
     * Inicializa las APIs de webOS TV
     */
    initWebOS() {
        try {
            if (typeof webOS !== 'undefined' && webOS) {
                // Registrar la app para recibir eventos de visibilidad
                document.addEventListener('webOSRelaunch', (e) => {
                    console.log('App relanzada con parámetros:', e.detail);
                });
                
                // Prevenir que la app se cierre con el botón back en la pantalla principal
                if (webOS.platform && webOS.platform.tv) {
                    console.log('Ejecutando en LG WebOS TV');
                }
                return true;
            } else {
                console.log('webOS API no disponible - ejecutando en modo desarrollo');
                return false;
            }
        } catch (error) {
            console.warn('Error al inicializar webOS (no crítico):', error);
            return false;
        }
    },

    setupEventListeners() {
        try {
            // Login form
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleLogin();
                });
            }
            
            const btnExit = document.getElementById('btn-exit');
            if (btnExit) {
                btnExit.addEventListener('click', () => this.exitApp());
            }
            
            // Main screen
            const btnSearch = document.getElementById('btn-search');
            if (btnSearch) {
                btnSearch.addEventListener('click', () => this.toggleSearch());
            }
            
            const btnRefresh = document.getElementById('btn-refresh');
            if (btnRefresh) {
                btnRefresh.addEventListener('click', () => this.refreshChannels());
            }
            
            const btnLogout = document.getElementById('btn-logout');
            if (btnLogout) {
                btnLogout.addEventListener('click', () => this.logout());
            }
            
            const searchClear = document.getElementById('search-clear');
            if (searchClear) {
                searchClear.addEventListener('click', () => this.clearSearch());
            }
            
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            }
            
            // Back button (opcional - solo si webOS está disponible)
            try {
                document.addEventListener('tvBack', () => this.handleBack());
            } catch (e) {
                console.warn('No se pudo registrar evento tvBack:', e);
            }
            
            // Number keys for channel change (opcional)
            try {
                document.addEventListener('tvKeyPress', (e) => this.handleGlobalKeys(e.detail));
            } catch (e) {
                console.warn('No se pudo registrar evento tvKeyPress:', e);
            }
        } catch (error) {
            console.error('Error al configurar event listeners:', error);
        }
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
        
        if (screenId === 'login-screen') {
            Navigation.updateFocusableElements(screenId);
            document.getElementById('username').focus();
        } else if (screenId === 'main-screen') {
            console.log('Mostrando pantalla principal, canales disponibles:', this.filteredChannels.length);
            // Asegurar que se actualice la grilla
            setTimeout(() => {
                this.updateChannelsGrid();
                this.updateCategories();
                // Restaurar posición del scroll guardada
                this.restoreScrollPosition();
            }, 150); // Aumentado el delay para asegurar que el DOM esté completamente renderizado
        } else if (screenId === 'player-screen') {
            // Guardar posición del scroll cuando se va al reproductor (solo si ya hay una pantalla principal visible)
            if (this.currentScreen === 'main-screen') {
                this.saveScrollPosition();
            }
        }
    },
    
    /**
     * Guarda la posición actual del scroll de la lista de canales
     */
    saveScrollPosition() {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            this.savedScrollPosition = mainContent.scrollTop;
            console.log('Posición del scroll guardada:', this.savedScrollPosition);
        }
    },
    
    /**
     * Restaura la posición guardada del scroll
     */
    restoreScrollPosition() {
        const mainContent = document.querySelector('.main-content');
        if (mainContent && this.savedScrollPosition > 0) {
            // Usar requestAnimationFrame para asegurar que el DOM esté renderizado
            requestAnimationFrame(() => {
                mainContent.scrollTop = this.savedScrollPosition;
                console.log('Posición del scroll restaurada:', this.savedScrollPosition);
            });
        }
    },

    async handleLogin() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!username || !password) {
            this.showLoginError('Por favor ingresa usuario y contraseña');
            return;
        }
        
        const btn = document.getElementById('btn-login');
        btn.classList.add('loading');
        btn.disabled = true;
        
        try {
            console.log('Iniciando login para usuario:', username);
            const playlist = await this.fetchPlaylist(username, password);
            
            if (!playlist) {
                throw new Error('No se recibió respuesta del servidor');
            }
            
            console.log('Playlist recibida, parseando...');
            const parsed = M3UParser.parse(playlist);
            
            console.log('Canales parseados:', parsed.channels.length);
            console.log('Categorías:', parsed.categories.length);
            
            if (parsed.channels.length === 0) {
                console.error('No se encontraron canales. Contenido de playlist:', playlist.substring(0, 1000));
                throw new Error('No se encontraron canales en la playlist. Verifica el formato.');
            }
            
            // Validar que los canales tengan URL
            const validChannels = parsed.channels.filter(ch => ch.url && ch.url.trim() !== '');
            console.log('Canales válidos (con URL):', validChannels.length);
            
            if (validChannels.length === 0) {
                throw new Error('Los canales no tienen URLs válidas');
            }
            
            // Guardar categorías
            this.categories = parsed.categories;
            
            // Asignar logos locales desde la carpeta imgs (basados en número de canal)
            const channelsWithLocalLogos = this.assignLocalLogos(validChannels);
            
            // Asignar canales inicialmente
            this.channels = channelsWithLocalLogos;
            this.filteredChannels = [...this.channels];
            
            console.log('Canales cargados exitosamente:', this.channels.length);
            console.log('Primeros 3 canales:', this.channels.slice(0, 3).map(ch => ({ number: ch.number, name: ch.name, logo: ch.logo })));
            
            // Guardar credenciales y activar sesión
            Storage.saveCredentials(username, password);
            Storage.setActiveSession(true);
            Storage.savePlaylist(this.channels);
            
            // Resetear posición del scroll al hacer login (nueva sesión)
            this.savedScrollPosition = 0;
            this.showScreen('main-screen');
            
            // Actualizar la grilla de canales después de un pequeño delay para asegurar que el DOM esté listo
            setTimeout(() => {
                console.log('Actualizando grilla de canales, total:', this.filteredChannels.length);
                this.updateChannelsGrid();
            }, 100);
        } catch (error) {
            console.error('Error en login:', error);
            console.error('Stack:', error.stack);
            const errorMessage = error.message || 'Error al cargar los canales. Verifica tus credenciales.';
            this.showLoginError(errorMessage);
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    },

    async autoLogin(credentials) {
        try {
            const playlist = await this.fetchPlaylist(credentials.username, credentials.password);
            const parsed = M3UParser.parse(playlist);
            
            if (parsed.channels.length === 0) {
                throw new Error('No se encontraron canales');
            }
            
            // Validar que los canales tengan URL
            const validChannels = parsed.channels.filter(ch => ch.url && ch.url.trim() !== '');
            
            // Guardar categorías
            this.categories = parsed.categories;
            
            // Asignar logos locales desde la carpeta imgs (basados en número de canal)
            const channelsWithLocalLogos = this.assignLocalLogos(validChannels);
            
            // Asignar canales inicialmente
            this.channels = channelsWithLocalLogos;
            this.filteredChannels = [...this.channels];
            
            console.log('Canales cargados exitosamente (auto-login):', this.channels.length);
            console.log('Primeros 3 canales:', this.channels.slice(0, 3).map(ch => ({ number: ch.number, name: ch.name, logo: ch.logo })));
            
            // Guardar credenciales y activar sesión
            Storage.saveCredentials(credentials.username, credentials.password);
            Storage.setActiveSession(true);
            Storage.savePlaylist(this.channels);
            
            // Resetear posición del scroll al hacer auto-login
            this.savedScrollPosition = 0;
            this.showScreen('main-screen');
            
            // Actualizar la grilla de canales después de un pequeño delay para asegurar que el DOM esté listo
            setTimeout(() => {
                console.log('Actualizando grilla de canales (auto-login), total:', this.filteredChannels.length);
                this.updateChannelsGrid();
            }, 100);
        } catch (error) {
            console.error('Auto-login fallido:', error);
            // Si falla el auto-login, mostrar pantalla de login
            this.showScreen('login-screen');
        }
    },

    async fetchPlaylist(username, password) {
        // Usar el helper buildPlaylistUrl() para construir la URL correctamente
        // Esto asegura que se use el perfil activo y los formatos configurados
        const url = CONFIG.buildPlaylistUrl(username, password);
        
        console.log('Descargando playlist desde:', url);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUTS.REQUEST);
            
            const response = await fetch(url, { 
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'Cache-Control': 'no-cache',
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log('Respuesta recibida, status:', response.status, response.statusText);
            console.log('Content-Type:', response.headers.get('content-type'));
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.error('Error HTTP:', response.status, response.statusText);
                console.error('Respuesta del servidor:', errorText.substring(0, 200));
                throw new Error(`Error al obtener playlist: ${response.status} ${response.statusText}`);
            }
            
            const text = await response.text();
            console.log('Playlist descargada, tamaño:', text.length, 'caracteres');
            
            if (!text || text.trim().length === 0) {
                throw new Error('La playlist está vacía');
            }
            
            // Mostrar muestra del contenido
            const preview = text.substring(0, Math.min(1000, text.length));
            console.log('Muestra del contenido:', preview);
            console.log('¿Contiene #EXTINF?:', text.includes('#EXTINF'));
            console.log('¿Contiene Channel name?:', text.includes('Channel name:'));
            console.log('¿Contiene #Name:?:', text.includes('#Name:'));
            
            return text;
        } catch (error) {
            console.error('Error al descargar playlist:', error);
            if (error.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado. Verifica tu conexión.');
            }
            throw error;
        }
    },

    showLoginError(message) {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => errorEl.style.display = 'none', 5000);
    },

    /**
     * Actualiza la lista de categorías
     */
    updateCategories() {
        const categoriesSection = document.getElementById('categories-section');
        const categoriesList = document.getElementById('categories-list');
        
        if (!categoriesSection || !categoriesList) {
            return;
        }
        
        if (this.categories.length === 0) {
            categoriesSection.style.display = 'none';
            return;
        }
        
        categoriesSection.style.display = 'block';
        
        // Agregar categoría "Todos" al inicio
        const allCategories = [
            { name: 'Todos', channels: this.channels },
            ...this.categories
        ];
        
        categoriesList.innerHTML = allCategories.map((category, index) => {
            const isActive = (this.selectedCategory === null && index === 0) || 
                           (this.selectedCategory === category.name);
            return `
                <div class="category-chip focusable ${isActive ? 'active' : ''}" 
                     data-category="${category.name === 'Todos' ? '' : category.name}" 
                     tabindex="${10 + index}">
                    ${category.name} (${category.channels.length})
                </div>
            `;
        }).join('');
        
        // Agregar event listeners
        categoriesList.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const categoryName = chip.dataset.category || null;
                this.filterByCategory(categoryName);
            });
        });
    },

    /**
     * Filtra canales por categoría
     */
    filterByCategory(categoryName) {
        this.selectedCategory = categoryName;
        
        if (!categoryName) {
            this.filteredChannels = [...this.channels];
        } else {
            this.filteredChannels = this.channels.filter(ch => ch.category === categoryName);
        }
        
        this.updateCategories();
        this.updateChannelsGrid();
    },

    updateChannelsGrid() {
        const grid = document.getElementById('channels-grid');
        const loading = document.getElementById('loading-channels');
        const noChannels = document.getElementById('no-channels');
        const channelsCount = document.getElementById('channels-count');
        
        if (!grid) {
            console.error('Elemento channels-grid no encontrado');
            return;
        }
        
        loading.style.display = 'none';
        
        console.log('Actualizando grilla de canales, total:', this.filteredChannels.length);
        
        // Actualizar contador de canales
        if (channelsCount) {
            channelsCount.textContent = `${this.filteredChannels.length} ${this.filteredChannels.length === 1 ? 'canal' : 'canales'}`;
        }
        
        if (this.filteredChannels.length === 0) {
            console.warn('No hay canales para mostrar');
            noChannels.style.display = 'flex';
            grid.innerHTML = '';
            return;
        }
        
        noChannels.style.display = 'none';
        
        // Función helper global para manejar fallback de imágenes
        if (!window.tryLogoFallback) {
            window.tryLogoFallback = function(imgElement, channelNumber) {
                // Orden de prioridad: svg > avif > webp > png > jpg > jpeg
                const extensions = ['svg', 'avif', 'webp', 'png', 'jpg', 'jpeg'];
                const currentSrc = imgElement.src;
                const currentExt = currentSrc.split('.').pop().split('?')[0].toLowerCase();
                let currentIndex = extensions.indexOf(currentExt);
                
                if (currentIndex < 0) currentIndex = 0;
                currentIndex++;
                
                if (currentIndex < extensions.length && channelNumber) {
                    // Intentar siguiente formato
                    imgElement.src = `imgs/${channelNumber}.${extensions[currentIndex]}`;
                    imgElement.onerror = function() {
                        window.tryLogoFallback(imgElement, channelNumber);
                    };
                } else {
                    // Si todos los formatos fallan, mostrar placeholder
                    imgElement.style.display = 'none';
                    const placeholder = imgElement.nextElementSibling;
                    if (placeholder && placeholder.classList.contains('channel-logo-placeholder')) {
                        placeholder.style.display = 'flex';
                    }
                }
            };
        }
        
        // OPTIMIZACIÓN: Renderizar por lotes para mejorar rendimiento
        // Limpiar grid primero
        grid.innerHTML = '';
        
        console.log('🔍 DIAGNÓSTICO: filteredChannels.length =', this.filteredChannels.length);
        console.log('🔍 DIAGNÓSTICO: Primeros 3 canales:', this.filteredChannels.slice(0, 3));
        
        // Renderizar inicialmente solo los primeros 50 canales
        const INITIAL_BATCH = 50;
        const BATCH_SIZE = 25; // Cargar 25 más cada vez
        let renderedCount = 0;
        const self = this; // Guardar referencia para usar en callbacks
        
        const renderBatch = (startIndex, endIndex) => {
            console.log(`🔍 Renderizando lote: ${startIndex} a ${endIndex} (total: ${self.filteredChannels.length})`);
            const batch = self.filteredChannels.slice(startIndex, endIndex);
            console.log(`🔍 Tamaño del lote: ${batch.length} canales`);
            
            if (batch.length === 0) {
                console.warn('⚠️ Lote vacío, no hay canales para renderizar');
                return;
            }
            
            const fragment = document.createDocumentFragment();
            
            batch.forEach((channel, batchIndex) => {
                const index = startIndex + batchIndex;
                const initials = channel.name ? channel.name.substring(0, 2).toUpperCase() : '??';
                const hasLogo = channel.logo && channel.logo.trim() !== '';
                const channelNumber = channel.number || channel._channelNumber || index + 1;
                
                const card = document.createElement('div');
                card.className = 'channel-card focusable';
                card.dataset.index = index;
                card.tabIndex = 0;
                
                card.innerHTML = `
                    <div class="channel-logo-container">
                        ${hasLogo 
                            ? `<img src="${channel.logo}" alt="${channel.name || 'Canal'}" class="channel-logo" 
                                onerror="window.tryLogoFallback(this, ${channelNumber})"
                                referrerpolicy="no-referrer"
                                loading="lazy">`
                            : ''
                        }
                        <span class="channel-logo-placeholder" style="${hasLogo ? 'display:none;' : 'display:flex;'}">${initials}</span>
                    </div>
                    <div class="channel-info-card">
                        <div class="channel-number-card">Canal ${channel.number || index + 1}</div>
                        <div class="channel-name-card">${channel.name || 'Sin nombre'}</div>
                        ${channel.category ? `<div class="channel-category">${channel.category}</div>` : ''}
                    </div>
                `;
                
                // Agregar event listener
                card.addEventListener('click', () => {
                    self.playChannel(index);
                });
                
                fragment.appendChild(card);
            });
            
            grid.appendChild(fragment);
            renderedCount = endIndex;
            console.log(`✅ Lote renderizado: ${renderedCount} canales mostrados de ${self.filteredChannels.length}`);
            
            // Actualizar elementos focusables después de cada lote
            if (typeof Navigation !== 'undefined' && Navigation.updateFocusableElements) {
                Navigation.updateFocusableElements('main-screen');
            }
        };
        
        // Renderizar primer lote
        const initialCount = Math.min(INITIAL_BATCH, this.filteredChannels.length);
        console.log(`🔍 Renderizando primer lote: 0 a ${initialCount}`);
        renderBatch(0, initialCount);
        
        // Lazy load del resto cuando el usuario hace scroll
        if (this.filteredChannels.length > INITIAL_BATCH) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                let isLoadingMore = false; // Prevenir múltiples cargas simultáneas
                
                const loadMore = () => {
                    if (isLoadingMore) return;
                    if (renderedCount < self.filteredChannels.length) {
                        isLoadingMore = true;
                        const nextEnd = Math.min(renderedCount + BATCH_SIZE, self.filteredChannels.length);
                        renderBatch(renderedCount, nextEnd);
                        isLoadingMore = false;
                    }
                };
                
                // Cargar más cuando el usuario se acerca al final
                mainContent.addEventListener('scroll', () => {
                    const scrollTop = mainContent.scrollTop;
                    const scrollHeight = mainContent.scrollHeight;
                    const clientHeight = mainContent.clientHeight;
                    
                    // Cargar más cuando esté a 200px del final
                    if (scrollHeight - scrollTop - clientHeight < 200) {
                        loadMore();
                    }
                }, { passive: true });
            }
        }
        
        if (typeof Navigation !== 'undefined' && Navigation.updateFocusableElements) {
            Navigation.updateFocusableElements('main-screen');
        }
        
        console.log('✅ updateChannelsGrid completado');
    },
    
    /**
     * Actualiza el logo de un canal específico en la grilla sin re-renderizar todo
     * @param {number} channelIndex - Índice del canal en filteredChannels
     */
    updateChannelLogo(channelIndex) {
        if (channelIndex < 0 || channelIndex >= this.filteredChannels.length) {
            return;
        }
        
        const channel = this.filteredChannels[channelIndex];
        if (!channel || !channel.logo || channel.logo.trim() === '') {
            return;
        }
        
        const grid = document.getElementById('channels-grid');
        if (!grid) {
            return;
        }
        
        const card = grid.querySelector(`.channel-card[data-index="${channelIndex}"]`);
        if (!card) {
            return;
        }
        
        const logoContainer = card.querySelector('.channel-logo-container');
        if (!logoContainer) {
            return;
        }
        
        // Verificar si ya tiene un logo cargado
        const existingImg = logoContainer.querySelector('.channel-logo');
        if (existingImg && existingImg.src === channel.logo) {
            return; // Ya está actualizado
        }
        
        // Actualizar o agregar el logo
        const initials = channel.name.substring(0, 2).toUpperCase();
        const placeholder = logoContainer.querySelector('.channel-logo-placeholder');
        
        if (placeholder && !existingImg) {
            // Crear nueva imagen
            const img = document.createElement('img');
            img.src = channel.logo;
            img.alt = channel.name;
            img.className = 'channel-logo';
            img.referrerPolicy = 'no-referrer';
            img.loading = 'lazy';
            img.onerror = function() {
                this.onerror = null;
                this.style.display = 'none';
                if (placeholder) {
                    placeholder.style.display = 'flex';
                }
            };
            
            // Ocultar placeholder y mostrar imagen
            placeholder.style.display = 'none';
            logoContainer.insertBefore(img, placeholder);
        } else if (existingImg) {
            // Actualizar imagen existente
            existingImg.src = channel.logo;
            existingImg.style.display = 'block';
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }
    },

    playChannel(index) {
        // Guardar posición del scroll antes de ir al reproductor
        this.saveScrollPosition();
        this.showScreen('player-screen');
        Player.loadChannel(this.filteredChannels, index);
    },

    toggleSearch() {
        const container = document.getElementById('search-container');
        container.classList.toggle('active');
        if (container.classList.contains('active')) {
            document.getElementById('search-input').focus();
        }
    },

    handleSearch(query) {
        this.filteredChannels = M3UParser.searchChannels(this.channels, query);
        this.updateChannelsGrid();
    },

    clearSearch() {
        document.getElementById('search-input').value = '';
        this.filteredChannels = [...this.channels];
        this.updateChannelsGrid();
    },

    async refreshChannels() {
        const credentials = Storage.getCredentials();
        if (credentials) {
            document.getElementById('loading-channels').style.display = 'flex';
            try {
                await this.autoLogin(credentials);
            } finally {
                document.getElementById('loading-channels').style.display = 'none';
            }
        }
    },

    logout() {
        // Mantener credenciales guardadas pero desactivar sesión
        Storage.setActiveSession(false);
        this.channels = [];
        this.filteredChannels = [];
        this.categories = [];
        this.selectedCategory = null;
        
        
        // Prellenar login con credenciales guardadas
        const credentials = Storage.getCredentials();
        if (credentials) {
            this.prefillLogin(credentials);
        }
        
        this.showScreen('login-screen');
    },

    handleBack() {
        switch (this.currentScreen) {
            case 'player-screen':
                Player.goBack();
                break;
            case 'main-screen':
                // Show exit confirmation or do nothing
                break;
            case 'login-screen':
                this.exitApp();
                break;
        }
    },

    handleGlobalKeys(detail) {
        const { keyCode } = detail;
        
        if (this.currentScreen === 'main-screen' && Navigation.isNumberKey(keyCode)) {
            this.handleChannelNumberInput(Navigation.getNumberFromKey(keyCode));
        }
    },

    handleChannelNumberInput(digit) {
        this.channelNumberInput += digit.toString();
        this.showChannelNumberOverlay(this.channelNumberInput);
        
        clearTimeout(this.channelNumberTimer);
        this.channelNumberTimer = setTimeout(() => {
            const number = parseInt(this.channelNumberInput);
            if (!isNaN(number)) {
                const index = M3UParser.getChannelIndexByNumber(this.filteredChannels, number);
                if (index >= 0) {
                    this.playChannel(index);
                }
            }
            this.channelNumberInput = '';
            this.hideChannelNumberOverlay();
        }, CONFIG.TIMEOUTS.CHANNEL_INPUT);
    },

    showChannelNumberOverlay(number) {
        const overlay = document.getElementById('channel-number-overlay');
        document.getElementById('channel-number-text').textContent = number;
        overlay.style.display = 'block';
    },

    hideChannelNumberOverlay() {
        document.getElementById('channel-number-overlay').style.display = 'none';
    },

    exitApp() {
        try {
            // Tizen TV: cerrar aplicación de forma nativa
            if (typeof window.tizen !== 'undefined' && window.tizen.application) {
                window.tizen.application.getCurrentApplication().exit();
                return;
            }
        } catch (e) {
            console.warn('No se pudo cerrar vía Tizen API:', e);
        }

        // Fallbacks
        try { window.close(); } catch (_) {}
    }
};

// Exportar App al scope global
// La inicialización se maneja desde index.html con mejor manejo de errores
window.App = App;


// Exportar App al scope global
// La inicialización se maneja desde index.html con mejor manejo de errores
window.App = App;

