/* =============================================
   yc-radar | style.css
   Estilo visual de radar militar aereo
   v2.0 — Responsive, zoom, ocultacion
   ============================================= */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    background: transparent;
    overflow: hidden;
    font-family: 'Courier New', 'Lucida Console', monospace;
    color: var(--radar-color, #00ff41);
    user-select: none;
}

/* CSS Variables (se actualizan desde JS segun config) */
:root {
    --radar-color: #00ff41;
    --bg-color: #0a0a0a;
    --sweep-color: rgba(0, 255, 65, 0.15);
    --blip-friendly: #00ff41;
    --blip-unknown: #ff3333;
}

.hidden {
    display: none !important;
}

/* =============================================
   CONTENEDOR PRINCIPAL — 90% del viewport
   ============================================= */

#radar-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1.2vw;
    padding: 2vh 2vw;
    background: rgba(0, 0, 0, 0.80);
    z-index: 9999;
}

/* =============================================
   PANEL DEL RADAR — ocupa la mayor parte
   ============================================= */

#radar-panel {
    background: var(--bg-color);
    border: 2px solid var(--radar-color);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    max-width: 72vw;
    max-height: 96vh;
    box-shadow:
        0 0 30px rgba(0, 255, 65, 0.12),
        inset 0 0 40px rgba(0, 0, 0, 0.5);
}

/* Header */
#radar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8vh 1.2vw;
    border-bottom: 1px solid var(--radar-color);
    background: rgba(0, 255, 65, 0.03);
    flex-shrink: 0;
}

#radar-title {
    font-size: clamp(12px, 1.1vw, 18px);
    font-weight: bold;
    letter-spacing: 3px;
    text-transform: uppercase;
}

#radar-label {
    font-size: clamp(10px, 0.9vw, 14px);
    opacity: 0.7;
    letter-spacing: 1px;
}

#btn-close {
    background: none;
    border: 1px solid var(--radar-color);
    color: var(--radar-color);
    font-size: clamp(14px, 1.2vw, 22px);
    width: clamp(26px, 2.2vw, 36px);
    height: clamp(26px, 2.2vw, 36px);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

#btn-close:hover {
    background: var(--radar-color);
    color: var(--bg-color);
}

/* =============================================
   DISPLAY DEL RADAR (CANVAS) — responsive
   ============================================= */

#radar-display-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 0;
    padding: 1vh 1vw;
}

#radar-display {
    position: relative;
    /* El tamano se calcula como el menor entre el ancho y alto disponibles */
    width: min(74vh, 62vw);
    height: min(74vh, 62vw);
    flex-shrink: 0;
}

#radar-canvas {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--bg-color);
}

/* =============================================
   CONTROLES DE ZOOM
   ============================================= */

#zoom-controls {
    position: absolute;
    right: 1vw;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    z-index: 10;
}

.zoom-btn {
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid var(--radar-color);
    color: var(--radar-color);
    font-family: 'Courier New', monospace;
    font-size: clamp(14px, 1.2vw, 20px);
    font-weight: bold;
    width: clamp(30px, 2.5vw, 40px);
    height: clamp(30px, 2.5vw, 40px);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

.zoom-btn:hover {
    background: var(--radar-color);
    color: var(--bg-color);
}

.zoom-btn-text {
    font-size: clamp(9px, 0.75vw, 13px);
    letter-spacing: 1px;
}

#zoom-level {
    font-size: clamp(10px, 0.85vw, 14px);
    font-weight: bold;
    opacity: 0.7;
    letter-spacing: 1px;
}

/* =============================================
   PANEL DE INFORMACION INFERIOR
   ============================================= */

#radar-info-panel {
    border-top: 1px solid var(--radar-color);
    padding: 0.7vh 1.2vw;
    background: rgba(0, 255, 65, 0.03);
    flex-shrink: 0;
}

.info-row {
    display: flex;
    justify-content: space-between;
    gap: 0.8vw;
}

.info-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
}

.info-label {
    font-size: clamp(7px, 0.6vw, 10px);
    opacity: 0.5;
    letter-spacing: 2px;
    margin-bottom: 2px;
}

.info-value {
    font-size: clamp(11px, 1vw, 16px);
    font-weight: bold;
    letter-spacing: 1px;
}

.status-active {
    animation: blink 2s ease-in-out infinite;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* =============================================
   PANEL DE CONTACTOS (LATERAL) — responsive
   ============================================= */

#contacts-panel {
    background: var(--bg-color);
    border: 2px solid var(--radar-color);
    border-radius: 8px;
    width: clamp(250px, 22vw, 380px);
    max-height: 96vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow:
        0 0 20px rgba(0, 255, 65, 0.1),
        inset 0 0 30px rgba(0, 0, 0, 0.5);
}

#contacts-header {
    padding: 0.8vh 1vw;
    border-bottom: 1px solid var(--radar-color);
    font-size: clamp(9px, 0.8vw, 13px);
    letter-spacing: 2px;
    font-weight: bold;
    background: rgba(0, 255, 65, 0.03);
    flex-shrink: 0;
}

#contacts-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5vh 0.5vw;
}

/* Scrollbar personalizada */
#contacts-list::-webkit-scrollbar {
    width: 4px;
}

#contacts-list::-webkit-scrollbar-track {
    background: var(--bg-color);
}

#contacts-list::-webkit-scrollbar-thumb {
    background: var(--radar-color);
    border-radius: 2px;
}

/* Tarjeta de contacto individual */
.contact-card {
    border: 1px solid rgba(0, 255, 65, 0.3);
    border-radius: 4px;
    padding: 0.6vh 0.6vw;
    margin-bottom: 0.4vh;
    font-size: clamp(9px, 0.7vw, 11px);
    letter-spacing: 1px;
    transition: all 0.3s;
    background: rgba(0, 255, 65, 0.02);
    position: relative;
}

.contact-card:hover {
    border-color: var(--radar-color);
    background: rgba(0, 255, 65, 0.06);
}

.contact-card.transponder-on {
    border-left: 3px solid var(--blip-friendly);
}

.contact-card.transponder-off {
    border-left: 3px solid var(--blip-unknown);
}

.contact-card.is-hidden {
    opacity: 0.35;
}

.contact-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}

.contact-callsign {
    font-size: clamp(10px, 0.85vw, 14px);
    font-weight: bold;
}

.contact-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px 8px;
    opacity: 0.75;
}

.contact-detail-label {
    opacity: 0.5;
}

/* Boton de ocultar/mostrar en cada contacto */
.btn-toggle-hide {
    background: none;
    border: 1px solid var(--radar-color);
    color: var(--radar-color);
    font-family: 'Courier New', monospace;
    font-size: clamp(7px, 0.55vw, 10px);
    padding: 2px 6px;
    cursor: pointer;
    border-radius: 3px;
    letter-spacing: 1px;
    transition: all 0.15s;
    flex-shrink: 0;
}

.btn-toggle-hide:hover {
    background: var(--radar-color);
    color: var(--bg-color);
}

.btn-toggle-hide.active {
    background: rgba(255, 50, 50, 0.2);
    border-color: #ff5555;
    color: #ff5555;
}

/* =============================================
   MENSAJE "SIN CONTACTOS" CON ANIMACION DE ESCANEO
   ============================================= */

.no-contacts-msg {
    text-align: center;
    padding: 20px;
    font-size: 11px;
    letter-spacing: 2px;
    opacity: 0.3;
    animation: scanPulse 3s ease-in-out infinite;
}

.no-contacts-msg .scan-dot {
    display: inline-block;
    animation: scanDots 2s steps(3, end) infinite;
}

@keyframes scanPulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.45; }
}

@keyframes scanDots {
    0%   { content: ''; }
    33%  { content: '.'; }
    66%  { content: '..'; }
    100% { content: '...'; }
}

/* =============================================
   EFECTO CRT (scanlines)
   ============================================= */

#radar-container::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    background: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.03) 0px,
        rgba(0, 0, 0, 0.03) 1px,
        transparent 1px,
        transparent 2px
    );
    z-index: 10000;
}

/* =============================================
   MEDIA QUERIES PARA RESPONSIVE
   ============================================= */

/* Pantallas medianas (1280-1600px ancho) */
@media (max-width: 1600px) {
    #radar-display {
        width: min(70vh, 58vw);
        height: min(70vh, 58vw);
    }

    #contacts-panel {
        width: clamp(220px, 20vw, 320px);
    }
}

/* Pantallas pequenas (< 1280px ancho) */
@media (max-width: 1280px) {
    #radar-container {
        flex-direction: column;
        gap: 1vh;
        padding: 1vh 1vw;
    }

    #radar-panel {
        max-width: 96vw;
        max-height: 70vh;
    }

    #radar-display {
        width: min(55vh, 85vw);
        height: min(55vh, 85vw);
    }

    #contacts-panel {
        width: 96vw;
        max-height: 25vh;
    }

    #contacts-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5vh 0.5vw;
    }

    .contact-card {
        flex: 1 1 45%;
        min-width: 200px;
    }
}

/* =============================================
   HUD DE PILOTO — Panel inferior derecho
   Colores y dimensiones controlados por JS via config
   ============================================= */

#pilot-hud {
    --hud-color: #00ff41;
    position: fixed;
    bottom: 2.5vh;
    right: 2vw;
    width: 280px;
    background: rgba(8, 8, 8, 0.88);
    border: 1px solid var(--hud-color);
    border-radius: 6px;
    font-family: 'Courier New', 'Lucida Console', monospace;
    overflow: hidden;
    z-index: 9998;
    box-shadow:
        0 0 15px rgba(0, 255, 65, 0.08),
        inset 0 0 20px rgba(0, 0, 0, 0.4);
}

#hud-compass-wrapper {
    position: relative;
    width: 100%;
    height: 50px;
    border-bottom: 1px solid var(--hud-color);
    overflow: hidden;
}

#hud-compass-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

#hud-info {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0;
    padding: 8px 12px;
}

.hud-data-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 0;
}

.hud-data-label {
    font-size: 10px;
    color: var(--hud-color);
    opacity: 0.6;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 2px;
}

.hud-data-value {
    font-size: 15px;
    font-weight: bold;
    color: var(--hud-color);
    letter-spacing: 1px;
}

.hud-xpdr-on {
    color: var(--hud-color) !important;
}

.hud-xpdr-off {
    color: #ff3333 !important;
}

/* Pantallas muy pequenas (< 900px ancho) */
@media (max-width: 900px) {
    #radar-display {
        width: min(50vh, 90vw);
        height: min(50vh, 90vw);
    }

    #zoom-controls {
        right: 0.5vw;
    }

    .zoom-btn {
        width: 28px;
        height: 28px;
        font-size: 12px;
    }

    #zoom-level {
        font-size: 9px;
    }
}
