# IPTV Application for Samsung Tizen

## Descripción

Aplicación IPTV desarrollada para televisores Samsung Smart TV (sistema operativo Tizen), orientada a la reproducción de canales de televisión mediante streaming.
La aplicación está diseñada para ejecutarse en entornos Smart TV, considerando navegación mediante control remoto, limitaciones del hardware y compatibilidad con sistemas de reproducción multimedia nativos.
## Funcionalidades principales
---
-  Reproducción de canales IPTV
-  Navegación mediante control remoto
-  Uso de reproductor nativo AVPlay
---
## Tecnologías utilizadas

- HTML5  
- CSS3  
- JavaScript (Vanilla)  
- Samsung Tizen Studio  
- AVPlay API  
- HLS (HTTP Live Streaming)
---
## Ejecución del proyecto

### ▶️ Opción 1: Tizen Studio (recomendado)
1. Abrir Tizen Studio  
2. Importar el proyecto como **Web Application (TV Profile)**  
3. Conectar TV Samsung en modo desarrollador  
4. Ejecutar:
---
### Opción 2: Instalación mediante archivo `.wgt`
El archivo ejecutable se encuentra en:
/iptvsamsung/iptvsamsung.wgt
Pasos:

1. Activar **Developer Mode** en la TV Samsung  
2. Asegurar que la TV y el PC estén en la misma red  
3. Conectar la TV desde Tizen Studio (Device Manager)  
4. Instalar el archivo `.wgt`

---

## Requisitos

- Samsung Smart TV con sistema Tizen  
- Red local (para pruebas en dispositivo real)  
- Tizen Studio (opcional para desarrollo)

---

## Consideraciones

- La aplicación requiere una fuente IPTV válida (M3U o API).
- Algunos canales pueden no reproducirse dependiendo de:
  - formato del stream
  - codecs utilizados
  - compatibilidad del televisor
