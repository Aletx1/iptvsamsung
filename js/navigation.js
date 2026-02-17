/**
 * Sistema de navegación para control remoto de TV
 * Maneja la navegación con teclas direccionales y focus
 */
const Navigation = {
    // Elementos focuseables actuales
    focusableElements: [],
    currentFocusIndex: -1,
    currentScreen: null,
    
    /**
     * Inicializa el sistema de navegación
     */
    init() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        console.log('Sistema de navegación inicializado');
    },
    
    /**
     * Actualiza los elementos focuseables de la pantalla actual
     * @param {string} screenId - ID de la pantalla
     */
    updateFocusableElements(screenId) {
        this.currentScreen = screenId;
        const screen = document.getElementById(screenId);
        
        if (!screen) return;
        
        // Obtener todos los elementos focuseables
        this.focusableElements = Array.from(
            screen.querySelectorAll('.focusable, input, button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter(el => {
            // Filtrar elementos ocultos
            return el.offsetParent !== null && !el.disabled;
        });
        
        // Ordenar por tabindex si existe
        this.focusableElements.sort((a, b) => {
            const tabA = parseInt(a.getAttribute('tabindex') || '0');
            const tabB = parseInt(b.getAttribute('tabindex') || '0');
            return tabA - tabB;
        });
        
        this.currentFocusIndex = -1;
        
        // Enfocar el primer elemento si existe
        if (this.focusableElements.length > 0) {
            this.focusElement(0);
        }
    },
    
    /**
     * Enfoca un elemento por índice
     * @param {number} index - Índice del elemento
     */
    focusElement(index) {
        if (index < 0 || index >= this.focusableElements.length) return;
        
        // Quitar focus del elemento anterior
        if (this.currentFocusIndex >= 0 && this.focusableElements[this.currentFocusIndex]) {
            this.focusableElements[this.currentFocusIndex].blur();
        }
        
        this.currentFocusIndex = index;
        const element = this.focusableElements[index];
        
        if (element) {
            element.focus();
            
            // Scroll into view si es necesario
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },
    
    /**
     * Enfoca un elemento específico
     * @param {HTMLElement} element - Elemento a enfocar
     */
    focusSpecificElement(element) {
        const index = this.focusableElements.indexOf(element);
        if (index >= 0) {
            this.focusElement(index);
        } else {
            element.focus();
        }
    },
    
    /**
     * Maneja los eventos de teclado
     * @param {KeyboardEvent} event - Evento de teclado
     */
    handleKeyDown(event) {
        // Tizen key normalization
        let keyCode = event.keyCode;
        if (typeof window.tizen !== 'undefined') {
            // Algunos controles usan Backspace (8) para BACK
            if (keyCode === 8) keyCode = 10009;
            // Compatibilidad si venimos desde keycodes LG
            if (keyCode === 461) keyCode = 10009;
        }
        // Reasignar para el resto del handler
        event = Object.assign({}, event, { keyCode });

        const key = event.keyCode;
        
        // Manejar navegación básica
        switch (key) {
            case CONFIG.KEYS.UP:
                this.navigateUp();
                event.preventDefault();
                break;
                
            case CONFIG.KEYS.DOWN:
                this.navigateDown();
                event.preventDefault();
                break;
                
            case CONFIG.KEYS.LEFT:
                this.navigateLeft();
                event.preventDefault();
                break;
                
            case CONFIG.KEYS.RIGHT:
                this.navigateRight();
                event.preventDefault();
                break;
                
            case CONFIG.KEYS.ENTER:
                this.handleEnter();
                break;
                
            case CONFIG.KEYS.BACK:
            case CONFIG.KEYS.RETURN:
                this.handleBack();
                event.preventDefault();
                break;
                
            case CONFIG.KEYS.PLAY:
            case CONFIG.KEYS.PAUSE:
            case CONFIG.KEYS.PLAY_PAUSE:
                // Dejar que el reproductor maneje estas teclas
                break;
        }
        
        // Emitir evento personalizado para que otras partes de la app puedan escuchar
        const customEvent = new CustomEvent('tvKeyPress', {
            detail: { keyCode: key, originalEvent: event }
        });
        document.dispatchEvent(customEvent);
    },
    
    /**
     * Navega hacia arriba
     */
    navigateUp() {
        if (this.currentScreen === 'main-screen') {
            // En la grilla, moverse una fila arriba
            const columns = CONFIG.GRID.COLUMNS;
            const newIndex = this.currentFocusIndex - columns;
            if (newIndex >= 0) {
                this.focusElement(newIndex);
            }
        } else {
            this.focusPrevious();
        }
    },
    
    /**
     * Navega hacia abajo
     */
    navigateDown() {
        if (this.currentScreen === 'main-screen') {
            // En la grilla, moverse una fila abajo
            const columns = CONFIG.GRID.COLUMNS;
            const newIndex = this.currentFocusIndex + columns;
            if (newIndex < this.focusableElements.length) {
                this.focusElement(newIndex);
            }
        } else {
            this.focusNext();
        }
    },
    
    /**
     * Navega hacia la izquierda
     */
    navigateLeft() {
        if (this.currentScreen === 'main-screen') {
            // En la grilla, moverse a la izquierda
            const columns = CONFIG.GRID.COLUMNS;
            const currentCol = this.currentFocusIndex % columns;
            if (currentCol > 0) {
                this.focusElement(this.currentFocusIndex - 1);
            }
        } else {
            this.focusPrevious();
        }
    },
    
    /**
     * Navega hacia la derecha
     */
    navigateRight() {
        if (this.currentScreen === 'main-screen') {
            // En la grilla, moverse a la derecha
            const columns = CONFIG.GRID.COLUMNS;
            const currentCol = this.currentFocusIndex % columns;
            if (currentCol < columns - 1 && this.currentFocusIndex + 1 < this.focusableElements.length) {
                this.focusElement(this.currentFocusIndex + 1);
            }
        } else {
            this.focusNext();
        }
    },
    
    /**
     * Enfoca el elemento anterior
     */
    focusPrevious() {
        if (this.currentFocusIndex > 0) {
            this.focusElement(this.currentFocusIndex - 1);
        }
    },
    
    /**
     * Enfoca el siguiente elemento
     */
    focusNext() {
        if (this.currentFocusIndex < this.focusableElements.length - 1) {
            this.focusElement(this.currentFocusIndex + 1);
        }
    },
    
    /**
     * Maneja la tecla Enter
     */
    handleEnter() {
        const currentElement = this.focusableElements[this.currentFocusIndex];
        if (currentElement) {
            currentElement.click();
        }
    },
    
    /**
     * Maneja la tecla Back
     */
    handleBack() {
        // Emitir evento de back para que la app lo maneje
        const event = new CustomEvent('tvBack');
        document.dispatchEvent(event);
    },
    
    /**
     * Verifica si una tecla es un número
     * @param {number} keyCode - Código de tecla
     * @returns {boolean}
     */
    isNumberKey(keyCode) {
        return keyCode >= CONFIG.KEYS.NUM_0 && keyCode <= CONFIG.KEYS.NUM_9;
    },
    
    /**
     * Obtiene el número de una tecla numérica
     * @param {number} keyCode - Código de tecla
     * @returns {number}
     */
    getNumberFromKey(keyCode) {
        return keyCode - CONFIG.KEYS.NUM_0;
    }
};

// Hacer Navigation global
window.Navigation = Navigation;

