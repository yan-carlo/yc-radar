// =============================================
// yc-radar | script.js
// Motor de renderizado del radar aereo militar
// v2.0 — Zoom, ocultacion, cardinales, locale, responsive
// =============================================

(function () {
    'use strict';

    // =============================================
    // ESTADO
    // =============================================
    let radarActive = false;
    let canvas = null;
    let ctx = null;
    let animationFrame = null;
    let sweepAngle = 0; // Angulo actual de la linea de barrido (radianes)

    // Configuracion del radar actual
    let radarConfig = {
        radarId: '',
        label: '',
        radius: 5000,
        minAltitude: 100,
        centerX: 0,
        centerY: 0,
        ui: {
            radarColor: '#00ff41',
            backgroundColor: '#0a0a0a',
            sweepColor: 'rgba(0, 255, 65, 0.15)',
            blipFriendly: '#00ff41',
            blipUnknown: '#ff3333',
            rangeRings: 4,
        },
    };

    // Lista de aeronaves detectadas
    let aircraftData = [];

    // Velocidad de barrido (radianes por frame a ~60fps)
    const SWEEP_SPEED = 0.015;

    // Historial de posiciones para efecto de estela (trail)
    let blipTrails = {}; // key -> [{x, y, timestamp}]
    const TRAIL_DURATION = 5000; // 5 segundos de estela

    // =============================================
    // ZOOM
    // =============================================
    const ZOOM_LEVELS = [1, 1.5, 2, 3, 4];
    let zoomIndex = 0; // Indice actual en ZOOM_LEVELS
    let zoomLevel = 1; // Nivel de zoom actual

    // =============================================
    // OCULTACION DE AERONAVES
    // =============================================
    // Se limpia cada vez que se abre el radar (no persiste entre sesiones)
    const hiddenAircraft = new Set(); // Almacena claves unicas de aeronaves ocultas

    // =============================================
    // LOCALIZACION
    // =============================================
    let locale = {}; // Tabla de traducciones recibida desde Lua

    /**
     * Obtiene una cadena traducida
     * @param {string} key Clave de traduccion
     * @param {string} [fallback] Valor por defecto si no se encuentra
     * @returns {string}
     */
    function L(key, fallback) {
        return locale[key] || fallback || key;
    }

    // =============================================
    // SISTEMA DE AUDIO
    // Pre-carga los sonidos para evitar latencia en la primera reproduccion
    // =============================================

    const sndClick = new Audio('sounds/click.mp3');
    const sndHover = new Audio('sounds/over.wav');

    // Volumen moderado para no molestar
    sndClick.volume = 0.15;
    sndHover.volume = 0.15;

    /**
     * Reproduce un sonido clonandolo para permitir reproducciones superpuestas
     * (ej: clicks rapidos sin que se corten entre si)
     * @param {HTMLAudioElement} audio Sonido base pre-cargado
     */
    function playSound(audio) {
        var clone = audio.cloneNode();
        clone.volume = audio.volume;
        clone.play().catch(function () {
            // Ignorar errores de autoplay (el navegador puede bloquear si no hubo interaccion)
        });
    }

    /**
     * Agrega eventos de click y hover a un elemento de boton
     * @param {HTMLElement} el Elemento del boton
     */
    function attachButtonSounds(el) {
        if (!el) return;

        el.addEventListener('mouseenter', function () {
            playSound(sndHover);
        });

        el.addEventListener('click', function () {
            playSound(sndClick);
        });
    }

    // =============================================
    // ELEMENTOS DOM
    // =============================================
    const container = document.getElementById('radar-container');
    const labelEl = document.getElementById('radar-label');
    const infoRadius = document.getElementById('info-radius');
    const infoMinAlt = document.getElementById('info-min-alt');
    const infoContacts = document.getElementById('info-contacts');
    const infoHidden = document.getElementById('info-hidden');
    const infoZoom = document.getElementById('info-zoom');
    const infoStatus = document.getElementById('info-status');
    const contactsList = document.getElementById('contacts-list');
    const btnClose = document.getElementById('btn-close');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const zoomLevelEl = document.getElementById('zoom-level');

    // =============================================
    // HUD DE PILOTO — Estado y elementos DOM
    // =============================================
    const pilotHud = document.getElementById('pilot-hud');
    const hudHeadingEl = document.getElementById('hud-heading');
    const hudAltitudeEl = document.getElementById('hud-altitude');
    const hudSpeedEl = document.getElementById('hud-speed');
    const hudTransponderEl = document.getElementById('hud-transponder');
    let hudCompassCanvas = null;
    let hudCompassCtx = null;

    // Config del HUD (recibida desde Lua)
    let hudConfig = {
        speedUnit: 'kmh',
        altitudeUnit: 'm',
        color: '#00ff41',
        opacity: 0.88,
        width: 280,
        compassHeight: 50,
        position: { bottom: 2.5, right: 2.0 },
    };

    // Interpolacion suave de la brujula (60fps client-side)
    let hudTargetHeading = 0;
    let hudDisplayHeading = 0;
    let hudAnimFrame = null;
    let hudVisible = false;

    // =============================================
    // UTILIDADES
    // =============================================

    /**
     * Genera una clave unica para identificar una aeronave
     */
    function getAircraftKey(aircraft) {
        if (aircraft.netId && aircraft.netId !== 0) {
            return 'net_' + aircraft.netId;
        }
        return 'local_' + aircraft.model + '_' + Math.floor(aircraft.x) + '_' + Math.floor(aircraft.y);
    }

    /**
     * Convierte coordenadas del mundo GTA a coordenadas relativas del radar
     * Tiene en cuenta el nivel de zoom
     */
    function worldToRadar(worldX, worldY) {
        const dx = worldX - radarConfig.centerX;
        const dy = worldY - radarConfig.centerY;
        const effectiveRadius = radarConfig.radius / zoomLevel;
        return {
            x: dx / effectiveRadius,
            y: -dy / effectiveRadius, // Invertir Y (GTA Y sube al norte, canvas Y baja)
        };
    }

    /**
     * Formatea la distancia para mostrar
     */
    function formatDistance(meters) {
        if (meters >= 1000) {
            return (meters / 1000).toFixed(1) + ' km';
        }
        return Math.floor(meters) + ' m';
    }

    /**
     * Aplica las variables CSS segun la configuracion del radar
     */
    function applyTheme(ui) {
        const root = document.documentElement;
        root.style.setProperty('--radar-color', ui.radarColor || '#00ff41');
        root.style.setProperty('--bg-color', ui.backgroundColor || '#0a0a0a');
        root.style.setProperty('--sweep-color', ui.sweepColor || 'rgba(0, 255, 65, 0.15)');
        root.style.setProperty('--blip-friendly', ui.blipFriendly || '#00ff41');
        root.style.setProperty('--blip-unknown', ui.blipUnknown || '#ff3333');
    }

    /**
     * Aplica traducciones a los elementos del DOM con data-locale
     */
    function applyLocaleToDOM() {
        document.querySelectorAll('[data-locale]').forEach(function (el) {
            const key = el.getAttribute('data-locale');
            if (locale[key]) {
                el.textContent = locale[key];
            }
        });

        // Actualizar el titulo principal
        const titleEl = document.getElementById('radar-title');
        if (titleEl) titleEl.textContent = L('radar_title', 'RADAR AEREO');

        // Actualizar status
        if (infoStatus) infoStatus.textContent = L('status_active', 'ACTIVO');
    }

    // =============================================
    // ZOOM - LOGICA
    // =============================================

    function setZoom(newIndex) {
        zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, newIndex));
        zoomLevel = ZOOM_LEVELS[zoomIndex];

        // Actualizar UI
        const label = zoomLevel + 'x';
        zoomLevelEl.textContent = label;
        if (infoZoom) infoZoom.textContent = label;
    }

    function zoomIn() {
        setZoom(zoomIndex + 1);
    }

    function zoomOut() {
        setZoom(zoomIndex - 1);
    }

    function zoomReset() {
        setZoom(0);
    }

    // =============================================
    // CANVAS - TAMANIO DINAMICO
    // =============================================

    /**
     * Redimensiona el canvas al tamano del contenedor
     */
    function resizeCanvas() {
        if (!canvas) return;

        const display = document.getElementById('radar-display');
        if (!display) return;

        const rect = display.getBoundingClientRect();
        const size = Math.floor(Math.min(rect.width, rect.height));

        if (size <= 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }

    // =============================================
    // RENDERIZADO DEL RADAR
    // =============================================

    function renderLoop() {
        if (!radarActive) return;

        sweepAngle = (sweepAngle + SWEEP_SPEED) % (Math.PI * 2);
        drawRadar();
        animationFrame = requestAnimationFrame(renderLoop);
    }

    function drawRadar() {
        if (!ctx || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        const centerX = w / 2;
        const centerY = h / 2;
        const radarRadius = Math.min(w, h) / 2 - 55; // Margen amplio para etiquetas cardinales

        ctx.clearRect(0, 0, w, h);

        // Fondo circular
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
        ctx.fillStyle = radarConfig.ui.backgroundColor || '#0a0a0a';
        ctx.fill();
        ctx.clip();

        drawGrid(centerX, centerY, radarRadius);
        drawRangeRings(centerX, centerY, radarRadius);
        drawCompassLines(centerX, centerY, radarRadius);
        drawSweep(centerX, centerY, radarRadius);
        drawBlipTrails(centerX, centerY, radarRadius);
        drawBlips(centerX, centerY, radarRadius);
        drawCenter(centerX, centerY);

        ctx.restore();

        // Borde del radar
        ctx.beginPath();
        ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
        ctx.strokeStyle = radarConfig.ui.radarColor || '#00ff41';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Etiquetas cardinales con sombra (FUERA del clip, sobre el borde)
        drawCompassLabels(centerX, centerY, radarRadius);
    }

    // =============================================
    // GRILLA DE FONDO
    // =============================================

    function drawGrid(cx, cy, radius) {
        const color = radarConfig.ui.radarColor || '#00ff41';
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.05;
        ctx.lineWidth = 1;

        const gridSize = radius / 10;
        for (let x = cx - radius; x <= cx + radius; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, cy - radius);
            ctx.lineTo(x, cy + radius);
            ctx.stroke();
        }
        for (let y = cy - radius; y <= cy + radius; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(cx - radius, y);
            ctx.lineTo(cx + radius, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // =============================================
    // ANILLOS DE DISTANCIA (ajustados por zoom)
    // =============================================

    function drawRangeRings(cx, cy, radius) {
        const rings = radarConfig.ui.rangeRings || 4;
        const color = radarConfig.ui.radarColor || '#00ff41';
        const effectiveRadius = radarConfig.radius / zoomLevel;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        for (let i = 1; i <= rings; i++) {
            const r = (radius / rings) * i;
            ctx.globalAlpha = 0.15;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();

            // Etiqueta de distancia (ajustada por zoom)
            const dist = (effectiveRadius / rings) * i;
            ctx.globalAlpha = 0.3;
            ctx.font = Math.max(9, Math.floor(radius / 55)) + 'px "Courier New", monospace';
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.fillText(formatDistance(dist), cx + r + 4, cy - 2);
        }
        ctx.globalAlpha = 1;
    }

    // =============================================
    // LINEAS CARDINALES
    // =============================================

    function drawCompassLines(cx, cy, radius) {
        const color = radarConfig.ui.radarColor || '#00ff41';

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1;

        // N-S
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // E-W
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.stroke();

        // Diagonales (NE-SW, NW-SE)
        ctx.globalAlpha = 0.12;
        const diag = radius * Math.cos(Math.PI / 4);

        ctx.beginPath();
        ctx.moveTo(cx - diag, cy - diag);
        ctx.lineTo(cx + diag, cy + diag);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + diag, cy - diag);
        ctx.lineTo(cx - diag, cy + diag);
        ctx.stroke();

        ctx.globalAlpha = 1;
    }

    // =============================================
    // ETIQUETAS CARDINALES — con sombra, grandes, visibles
    // Incluye N, S, E, W y NE, NW, SE, SW
    // =============================================

    function drawCompassLabels(cx, cy, radius) {
        // Tamanos de fuente proporcionales al radar
        const mainSize = Math.max(18, Math.floor(radius / 14));
        const interSize = Math.max(13, Math.floor(radius / 20));

        // Distancia desde el borde del circulo al centro del texto
        // Usar 28px como punto medio del margen de 55px
        const mainGap = 28;
        const interGap = 26;

        const diag = radius * Math.cos(Math.PI / 4);

        // Funcion auxiliar para dibujar texto con contorno negro + relleno claro
        function drawCardinalText(text, x, y, fontSize) {
            ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Contorno negro (strokeText es mas limpio que multiples fillText)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 1.0;
            ctx.strokeText(text, x, y);

            // Relleno en color claro amarillento
            ctx.fillStyle = '#f0f0c0';
            ctx.globalAlpha = 1.0;
            ctx.fillText(text, x, y);
        }

        // Cardinales principales: N (arriba), S (abajo), E (derecha), W (izquierda)
        drawCardinalText(L('cardinal_n', 'N'), cx, cy - radius - mainGap, mainSize);
        drawCardinalText(L('cardinal_s', 'S'), cx, cy + radius + mainGap, mainSize);
        drawCardinalText(L('cardinal_e', 'E'), cx + radius + mainGap, cy, mainSize);
        drawCardinalText(L('cardinal_w', 'W'), cx - radius - mainGap, cy, mainSize);

        // Intercardinales: posicionados sobre las lineas diagonales, justo fuera del circulo
        var iOff = interGap * 0.71; // cos(45) * gap para alinear con la diagonal
        drawCardinalText(L('cardinal_ne', 'NE'), cx + diag + iOff, cy - diag - iOff, interSize);
        drawCardinalText(L('cardinal_nw', 'NW'), cx - diag - iOff, cy - diag - iOff, interSize);
        drawCardinalText(L('cardinal_se', 'SE'), cx + diag + iOff, cy + diag + iOff, interSize);
        drawCardinalText(L('cardinal_sw', 'SW'), cx - diag - iOff, cy + diag + iOff, interSize);

        // Marcas de grados cada 30 grados (excluir cardinales e intercardinales)
        const color = radarConfig.ui.radarColor || '#00ff41';
        var degFontSize = Math.max(9, Math.floor(radius / 50));
        ctx.font = degFontSize + 'px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let deg = 0; deg < 360; deg += 30) {
            if (deg % 45 === 0) continue;

            const rad = ((90 - deg) * Math.PI) / 180;
            const x = cx + Math.cos(rad) * (radius + 18);
            const y = cy - Math.sin(rad) * (radius + 18);

            // Contorno negro para legibilidad
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.7;
            ctx.strokeText(deg + '\u00B0', x, y);

            ctx.fillStyle = color;
            ctx.globalAlpha = 0.5;
            ctx.fillText(deg + '\u00B0', x, y);
        }

        ctx.globalAlpha = 1;
    }

    // =============================================
    // LINEA DE BARRIDO (SWEEP)
    // =============================================

    function drawSweep(cx, cy, radius) {
        const trailAngle = 0.6;
        const gradient = ctx.createConicGradient(sweepAngle - trailAngle, cx, cy);
        const sweepColorBase = radarConfig.ui.radarColor || '#00ff41';

        const r = parseInt(sweepColorBase.slice(1, 3), 16);
        const g = parseInt(sweepColorBase.slice(3, 5), 16);
        const b = parseInt(sweepColorBase.slice(5, 7), 16);

        gradient.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        gradient.addColorStop(0.7, 'rgba(' + r + ',' + g + ',' + b + ',0.03)');
        gradient.addColorStop(0.95, 'rgba(' + r + ',' + g + ',' + b + ',0.08)');
        gradient.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0.15)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, sweepAngle - trailAngle, sweepAngle);
        ctx.closePath();
        ctx.fill();

        // Linea de barrido
        const endX = cx + Math.cos(sweepAngle) * radius;
        const endY = cy + Math.sin(sweepAngle) * radius;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = radarConfig.ui.radarColor || '#00ff41';
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // =============================================
    // ESTELAS DE BLIPS
    // =============================================

    function drawBlipTrails(cx, cy, radius) {
        const now = Date.now();

        for (const key in blipTrails) {
            // No dibujar estelas de aeronaves ocultas
            if (hiddenAircraft.has(key)) continue;

            const trail = blipTrails[key];
            if (trail.length < 2) continue;

            ctx.beginPath();
            let started = false;

            for (let i = 0; i < trail.length; i++) {
                const point = trail[i];
                const age = now - point.timestamp;
                if (age > TRAIL_DURATION) continue;

                const px = cx + point.x * radius;
                const py = cy + point.y * radius;

                // Solo dibujar si esta dentro del circulo visible
                const d = Math.sqrt(point.x * point.x + point.y * point.y);
                if (d > 1.05) continue;

                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }

            if (started) {
                ctx.strokeStyle = trail[0].color || radarConfig.ui.radarColor;
                ctx.globalAlpha = 0.15;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
    }

    // =============================================
    // BLIPS DE AERONAVES
    // =============================================

    function drawBlips(cx, cy, radius) {
        const now = Date.now();

        // Factor de escala para blips basado en zoom
        const blipScale = 1 + (zoomLevel - 1) * 0.35;

        for (const aircraft of aircraftData) {
            const key = getAircraftKey(aircraft);

            // Omitir aeronaves ocultas por el jugador
            if (hiddenAircraft.has(key)) continue;

            const pos = worldToRadar(aircraft.x, aircraft.y);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            if (dist > 1.0) continue;

            const px = cx + pos.x * radius;
            const py = cy + pos.y * radius;

            // Color segun estado del transponder
            let blipColor;
            if (aircraft.transponderOn !== false) {
                blipColor = radarConfig.ui.blipFriendly || '#00ff41';
            } else {
                blipColor = radarConfig.ui.blipUnknown || '#ff3333';
            }

            // Trail
            if (!blipTrails[key]) {
                blipTrails[key] = [];
            }
            blipTrails[key].push({
                x: pos.x,
                y: pos.y,
                timestamp: now,
                color: blipColor,
            });
            blipTrails[key] = blipTrails[key].filter(
                function (p) { return now - p.timestamp < TRAIL_DURATION; }
            );

            // Glow
            ctx.shadowColor = blipColor;
            ctx.shadowBlur = 8 * blipScale;

            // Icono escalado con zoom
            drawAircraftIcon(px, py, aircraft.heading, blipColor, aircraft.vehicleClass, blipScale);

            ctx.shadowBlur = 0;

            // Etiqueta (mas detallada a mayor zoom)
            drawBlipLabel(px, py, aircraft, blipColor, blipScale);
        }
    }

    /**
     * Dibuja el icono de una aeronave escalado
     */
    function drawAircraftIcon(x, y, heading, color, vehicleClass, scale) {
        const baseSize = vehicleClass === 16 ? 8 : 6;
        const size = baseSize * scale;
        const angle = ((90 - heading) * Math.PI) / 180;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-angle + Math.PI / 2);

        ctx.beginPath();

        if (vehicleClass === 16) {
            // Avion
            ctx.moveTo(0, -size);
            ctx.lineTo(size * 0.4, size * 0.3);
            ctx.lineTo(size * 0.8, size * 0.5);
            ctx.lineTo(size * 0.4, size * 0.4);
            ctx.lineTo(size * 0.2, size);
            ctx.lineTo(0, size * 0.7);
            ctx.lineTo(-size * 0.2, size);
            ctx.lineTo(-size * 0.4, size * 0.4);
            ctx.lineTo(-size * 0.8, size * 0.5);
            ctx.lineTo(-size * 0.4, size * 0.3);
            ctx.closePath();
        } else {
            // Helicoptero: rombo
            ctx.moveTo(0, -size);
            ctx.lineTo(size * 0.6, 0);
            ctx.lineTo(0, size);
            ctx.lineTo(-size * 0.6, 0);
            ctx.closePath();
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    /**
     * Dibuja la etiqueta de un blip
     * A mayor zoom, se muestra mas informacion
     */
    function drawBlipLabel(x, y, aircraft, color, scale) {
        const baseFontSize = Math.max(8, Math.floor(9 * scale));
        const labelX = x + 12 * scale;
        const labelY = y - 8 * scale;
        const lineHeight = baseFontSize + 2;

        ctx.font = baseFontSize + 'px "Courier New", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';

        // Transponder ON: mostrar matricula; OFF: mostrar "DESCONOCIDA"
        ctx.globalAlpha = 0.85;
        if (aircraft.transponderOn !== false) {
            const line1 = aircraft.plate || aircraft.model || L('unknown', '???');
            ctx.fillText(line1, labelX, labelY);
        } else {
            ctx.fillText(L('unknown_aircraft', '???'), labelX, labelY);
        }

        // Linea 2: altitud y velocidad (siempre visible, transponder o no)
        ctx.globalAlpha = 0.55;
        const altLabel = L('label_alt', 'ALT');
        const spdLabel = L('label_speed', 'VEL');
        ctx.fillText(altLabel + ':' + aircraft.altitude + ' ' + spdLabel + ':' + aircraft.speed, labelX, labelY + lineHeight);

        // Linea 3: heading y modelo (solo a zoom >= 2, solo con transponder ON)
        if (zoomLevel >= 2 && aircraft.transponderOn !== false) {
            ctx.globalAlpha = 0.45;
            const hdgLabel = L('label_heading', 'HDG');
            ctx.fillText(hdgLabel + ':' + aircraft.heading + '\u00B0 ' + aircraft.model, labelX, labelY + lineHeight * 2);
        }

        // Linea 4: tipo (solo a zoom >= 3)
        if (zoomLevel >= 3) {
            ctx.globalAlpha = 0.40;
            const typeStr = aircraft.vehicleClass === 16 ? L('type_plane', 'AVION') : L('type_heli', 'HELI');
            ctx.fillText(typeStr, labelX, labelY + lineHeight * 3);
        }

        ctx.globalAlpha = 1;
    }

    /**
     * Dibuja el punto central del radar
     */
    function drawCenter(cx, cy) {
        const color = radarConfig.ui.radarColor || '#00ff41';

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 6, cy);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy + 6);
        ctx.stroke();

        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    // =============================================
    // PANEL DE CONTACTOS CON OCULTACION
    // =============================================

    function updateContactsList() {
        contactsList.innerHTML = '';

        // Contar aeronaves visibles
        let visibleCount = 0;
        for (const aircraft of aircraftData) {
            if (!hiddenAircraft.has(getAircraftKey(aircraft))) {
                visibleCount++;
            }
        }

        // Actualizar contadores en el panel de info
        infoContacts.textContent = visibleCount.toString();
        infoHidden.textContent = hiddenAircraft.size.toString();

        // Limpiar intervalos de animacion previos si existen
        var prevMsg = contactsList.querySelector('.no-contacts-msg');
        if (prevMsg && prevMsg._dotInterval) {
            clearInterval(prevMsg._dotInterval);
        }

        if (aircraftData.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'no-contacts-msg';

            const textNode = document.createTextNode(L('no_contacts', 'SIN CONTACTOS'));
            const dotEl = document.createElement('span');
            emptyMsg.appendChild(textNode);
            emptyMsg.appendChild(dotEl);

            // Animar los puntos de escaneo
            let dotCount = 0;
            emptyMsg._dotInterval = setInterval(function () {
                dotCount = (dotCount + 1) % 4;
                dotEl.textContent = '.'.repeat(dotCount);
            }, 500);

            contactsList.appendChild(emptyMsg);
            return;
        }

        // Ordenar por distancia al centro del radar
        const sorted = aircraftData.slice().sort(function (a, b) {
            const distA = Math.pow(a.x - radarConfig.centerX, 2) + Math.pow(a.y - radarConfig.centerY, 2);
            const distB = Math.pow(b.x - radarConfig.centerX, 2) + Math.pow(b.y - radarConfig.centerY, 2);
            return distA - distB;
        });

        for (const aircraft of sorted) {
            const key = getAircraftKey(aircraft);
            const isHidden = hiddenAircraft.has(key);
            const hasTransponder = aircraft.transponderOn !== false;

            const card = document.createElement('div');
            card.className = 'contact-card'
                + (hasTransponder ? ' transponder-on' : ' transponder-off')
                + (isHidden ? ' is-hidden' : '');

            const dist = Math.sqrt(
                Math.pow(aircraft.x - radarConfig.centerX, 2) +
                Math.pow(aircraft.y - radarConfig.centerY, 2)
            );

            const dx = aircraft.x - radarConfig.centerX;
            const dy = aircraft.y - radarConfig.centerY;
            let bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
            if (bearing < 0) bearing += 360;

            const typeLabel = aircraft.vehicleClass === 16 ? L('type_plane', 'AVION') : L('type_heli', 'HELI');
            const hideBtnText = isHidden ? L('btn_show', 'MOSTRAR') : L('btn_hide', 'OCULTAR');
            const hideBtnClass = isHidden ? 'btn-toggle-hide active' : 'btn-toggle-hide';

            if (hasTransponder) {
                // Transponder ON: mostrar toda la informacion con matricula
                const callsign = aircraft.plate || aircraft.model || L('unknown', 'DESCONOCIDO');
                card.innerHTML =
                    '<div class="contact-card-header">'
                    + '<span class="contact-callsign">' + callsign + '</span>'
                    + '<button class="' + hideBtnClass + '" data-key="' + key + '">' + hideBtnText + '</button>'
                    + '</div>'
                    + '<div class="contact-details">'
                    + '<span class="contact-detail-label">' + L('label_type', 'TIPO') + ':</span><span>' + typeLabel + '</span>'
                    + '<span class="contact-detail-label">' + L('label_model', 'MODELO') + ':</span><span>' + aircraft.model + '</span>'
                    + '<span class="contact-detail-label">' + L('label_plate', 'MATRICULA') + ':</span><span>' + (aircraft.plate || '-') + '</span>'
                    + '<span class="contact-detail-label">' + L('label_alt', 'ALT') + ':</span><span>' + aircraft.altitude + ' m</span>'
                    + '<span class="contact-detail-label">' + L('label_speed', 'VEL') + ':</span><span>' + aircraft.speed + ' km/h</span>'
                    + '<span class="contact-detail-label">' + L('label_heading', 'HDG') + ':</span><span>' + aircraft.heading + '\u00B0</span>'
                    + '<span class="contact-detail-label">' + L('label_distance', 'DIST') + ':</span><span>' + formatDistance(dist) + '</span>'
                    + '<span class="contact-detail-label">' + L('label_bearing', 'BRG') + ':</span><span>' + Math.floor(bearing) + '\u00B0</span>'
                    + '</div>';
            } else {
                // Transponder OFF: solo info basica, sin datos identificativos
                card.innerHTML =
                    '<div class="contact-card-header">'
                    + '<span class="contact-callsign">' + L('unknown_aircraft', 'DESCONOCIDA') + '</span>'
                    + '<button class="' + hideBtnClass + '" data-key="' + key + '">' + hideBtnText + '</button>'
                    + '</div>'
                    + '<div class="contact-details">'
                    + '<span class="contact-detail-label">' + L('label_alt', 'ALT') + ':</span><span>' + aircraft.altitude + ' m</span>'
                    + '<span class="contact-detail-label">' + L('label_speed', 'VEL') + ':</span><span>' + aircraft.speed + ' km/h</span>'
                    + '<span class="contact-detail-label">' + L('label_distance', 'DIST') + ':</span><span>' + formatDistance(dist) + '</span>'
                    + '<span class="contact-detail-label">' + L('label_bearing', 'BRG') + ':</span><span>' + Math.floor(bearing) + '\u00B0</span>'
                    + '</div>';
            }

            contactsList.appendChild(card);
        }

        // Eventos de los botones de ocultar/mostrar (incluyendo sonidos)
        contactsList.querySelectorAll('.btn-toggle-hide').forEach(function (btn) {
            // Sonido hover al pasar el raton
            btn.addEventListener('mouseenter', function () {
                playSound(sndHover);
            });

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                playSound(sndClick);

                const aircraftKey = btn.getAttribute('data-key');
                if (hiddenAircraft.has(aircraftKey)) {
                    hiddenAircraft.delete(aircraftKey);
                } else {
                    hiddenAircraft.add(aircraftKey);
                }
                // Re-renderizar la lista
                updateContactsList();
            });
        });
    }

    // =============================================
    // CONTROL DEL RADAR (ABRIR / CERRAR)
    // =============================================

    function openRadar(config) {
        radarConfig.radarId = config.radarId;
        radarConfig.label = config.label;
        radarConfig.radius = config.radius;
        radarConfig.minAltitude = config.minAltitude;
        radarConfig.centerX = config.centerX;
        radarConfig.centerY = config.centerY;

        if (config.ui) {
            radarConfig.ui = Object.assign({}, radarConfig.ui, config.ui);
        }

        // Cargar traducciones
        if (config.locale) {
            locale = config.locale;
        }

        // Aplicar tema y traducciones al DOM
        applyTheme(radarConfig.ui);
        applyLocaleToDOM();

        // Actualizar UI
        labelEl.textContent = radarConfig.label;
        infoRadius.textContent = formatDistance(radarConfig.radius);
        infoMinAlt.textContent = radarConfig.minAltitude + ' m';
        infoContacts.textContent = '0';
        infoHidden.textContent = hiddenAircraft.size.toString();

        // Resetear zoom
        setZoom(0);

        // Limpiar datos de aeronaves y estado de ocultacion al abrir
        aircraftData = [];
        blipTrails = {};
        hiddenAircraft.clear();
        sweepAngle = 0;

        // Inicializar canvas
        canvas = document.getElementById('radar-canvas');

        // Mostrar contenedor primero para que el CSS compute las dimensiones
        container.classList.remove('hidden');

        // Esperar un frame para que el layout se calcule y luego dimensionar el canvas
        requestAnimationFrame(function () {
            resizeCanvas();
            radarActive = true;
            renderLoop();
            updateContactsList();
        });
    }

    function closeRadar() {
        radarActive = false;
        container.classList.add('hidden');

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        aircraftData = [];
        blipTrails = {};
    }

    // =============================================
    // HUD DE PILOTO — Brujula y datos de vuelo
    // =============================================

    /**
     * Convierte hex (#RRGGBB) a rgba string
     */
    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    /**
     * Inicializa el canvas de la brujula del HUD con DPR correcto
     */
    function initHudCanvas() {
        hudCompassCanvas = document.getElementById('hud-compass-canvas');
        if (!hudCompassCanvas) return;

        var wrapper = document.getElementById('hud-compass-wrapper');
        var rect = wrapper.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;

        hudCompassCanvas.width = rect.width * dpr;
        hudCompassCanvas.height = rect.height * dpr;
        hudCompassCanvas.style.width = rect.width + 'px';
        hudCompassCanvas.style.height = rect.height + 'px';

        hudCompassCtx = hudCompassCanvas.getContext('2d');
        hudCompassCtx.scale(dpr, dpr);
    }

    /**
     * Muestra el HUD de piloto y aplica configuracion visual
     * @param {object} [config] Configuracion recibida desde Lua
     */
    function showPilotHUD(config) {
        if (!pilotHud) return;

        // Aplicar configuracion si se recibio
        if (config) {
            hudConfig = config;
            var col = config.color || '#00ff41';
            var pos = config.position || { bottom: 2.5, right: 2.0 };

            // Dimensiones y posicion
            pilotHud.style.width = (config.width || 280) + 'px';
            pilotHud.style.bottom = (pos.bottom || 2.5) + 'vh';
            pilotHud.style.right = (pos.right || 2.0) + 'vw';

            // Color y opacidad
            pilotHud.style.setProperty('--hud-color', col);
            pilotHud.style.background = 'rgba(8, 8, 8, ' + (config.opacity || 0.88) + ')';
            pilotHud.style.borderColor = hexToRgba(col, 0.45);
            pilotHud.style.boxShadow = '0 0 15px ' + hexToRgba(col, 0.08) + ', inset 0 0 20px rgba(0,0,0,0.4)';

            // Altura de la brujula
            var compassWrapper = document.getElementById('hud-compass-wrapper');
            if (compassWrapper) {
                compassWrapper.style.height = (config.compassHeight || 50) + 'px';
                compassWrapper.style.borderBottomColor = hexToRgba(col, 0.3);
            }
        }

        pilotHud.classList.remove('hidden');
        hudVisible = true;

        requestAnimationFrame(function () {
            initHudCanvas();
            startHudAnimation();
        });
    }

    /**
     * Oculta el HUD de piloto y detiene la animacion
     */
    function hidePilotHUD() {
        if (!pilotHud) return;
        pilotHud.classList.add('hidden');
        hudVisible = false;
        hudCompassCanvas = null;
        hudCompassCtx = null;

        if (hudAnimFrame) {
            cancelAnimationFrame(hudAnimFrame);
            hudAnimFrame = null;
        }
    }

    /**
     * Inicia el loop de animacion de la brujula (60fps)
     */
    function startHudAnimation() {
        if (hudAnimFrame) cancelAnimationFrame(hudAnimFrame);
        hudAnimLoop();
    }

    /**
     * Loop de animacion: interpola el heading suavemente hacia el valor objetivo
     * Maneja correctamente el wrap-around 360/0
     */
    function hudAnimLoop() {
        if (!hudVisible) return;

        // Lerp con shortest path (wrap-around seguro)
        var diff = hudTargetHeading - hudDisplayHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        if (Math.abs(diff) > 0.05) {
            hudDisplayHeading += diff * 0.18;
            hudDisplayHeading = ((hudDisplayHeading % 360) + 360) % 360;
        } else {
            hudDisplayHeading = hudTargetHeading;
        }

        drawCompassTape(hudDisplayHeading);

        // Actualizar texto del heading con el valor interpolado
        if (hudHeadingEl) {
            hudHeadingEl.textContent = Math.round(hudDisplayHeading) + '\u00B0';
        }

        hudAnimFrame = requestAnimationFrame(hudAnimLoop);
    }

    /**
     * Recibe datos del piloto desde Lua y actualiza indicadores
     * La brujula se actualiza via interpolacion en hudAnimLoop, no aqui
     * @param {object} data { heading, altitude, speed, transponderOn }
     */
    function updatePilotHUD(data) {
        // Heading: solo fijar el objetivo, la animacion interpola
        hudTargetHeading = data.heading;

        // Velocidad (convertir desde m/s segun unidad configurada)
        var speedVal, speedLabel;
        if (hudConfig.speedUnit === 'mph') {
            speedVal = Math.round(data.speed * 2.23694);
            speedLabel = 'mph';
        } else if (hudConfig.speedUnit === 'kts') {
            speedVal = Math.round(data.speed * 1.94384);
            speedLabel = 'kts';
        } else {
            speedVal = Math.round(data.speed * 3.6);
            speedLabel = 'km/h';
        }
        if (hudSpeedEl) hudSpeedEl.textContent = speedVal + ' ' + speedLabel;

        // Altitud (convertir segun unidad configurada)
        if (hudConfig.altitudeUnit === 'ft') {
            if (hudAltitudeEl) hudAltitudeEl.textContent = Math.round(data.altitude * 3.28084) + ' ft';
        } else {
            if (hudAltitudeEl) hudAltitudeEl.textContent = Math.round(data.altitude) + ' m';
        }

        // Transponder
        if (hudTransponderEl) {
            if (data.transponderOn) {
                hudTransponderEl.textContent = '\u25CF ON';
                hudTransponderEl.className = 'hud-data-value hud-xpdr-on';
            } else {
                hudTransponderEl.textContent = '\u25CF OFF';
                hudTransponderEl.className = 'hud-data-value hud-xpdr-off';
            }
        }
    }

    /**
     * Dibuja la cinta de brujula horizontal en el canvas del HUD
     * Usa el color del config para ticks y etiquetas
     * @param {number} heading Rumbo interpolado (0-360, clockwise)
     */
    function drawCompassTape(heading) {
        if (!hudCompassCtx || !hudCompassCanvas) return;

        var dpr = window.devicePixelRatio || 1;
        var w = hudCompassCanvas.width / dpr;
        var h = hudCompassCanvas.height / dpr;
        var centerX = w / 2;
        var degsVisible = 120;
        var pixPerDeg = w / degsVisible;
        var c = hudCompassCtx;
        var col = hudConfig.color || '#00ff41';

        // Fuentes proporcionales al alto del canvas (escalan con compassHeight)
        var fontMain = Math.max(14, Math.round(h * 0.24));
        var fontInter = Math.max(11, Math.round(h * 0.17));
        var fontDeg = Math.max(10, Math.round(h * 0.14));
        var lwMain = Math.max(2, Math.round(h * 0.025));
        var lwInter = Math.max(1.5, h * 0.018);
        var lwMed = Math.max(1, h * 0.014);
        var triSize = Math.max(6, Math.round(h * 0.08));

        // Limpiar
        c.clearRect(0, 0, w, h);

        // Fondo
        c.fillStyle = 'rgba(5, 5, 5, 0.95)';
        c.fillRect(0, 0, w, h);

        // Mapa de cardinales
        var cardinals = {
            0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
            180: 'S', 225: 'SW', 270: 'W', 315: 'NW'
        };

        var startDeg = Math.floor((heading - degsVisible / 2) / 5) * 5;
        var endDeg = Math.ceil((heading + degsVisible / 2) / 5) * 5;

        for (var deg = startDeg; deg <= endDeg; deg += 5) {
            var normDeg = ((deg % 360) + 360) % 360;
            var x = centerX + (deg - heading) * pixPerDeg;

            if (x < -20 || x > w + 20) continue;

            if (cardinals[normDeg] !== undefined) {
                var isMain = normDeg % 90 === 0;

                // Tick largo
                c.strokeStyle = isMain ? '#ffffff' : col;
                c.lineWidth = isMain ? lwMain : lwInter;
                c.globalAlpha = isMain ? 1.0 : 0.9;
                c.beginPath();
                c.moveTo(x, h);
                c.lineTo(x, h * 0.3);
                c.stroke();

                // Etiqueta cardinal
                c.fillStyle = isMain ? '#ffffff' : col;
                c.font = isMain
                    ? 'bold ' + fontMain + 'px "Courier New", monospace'
                    : 'bold ' + fontInter + 'px "Courier New", monospace';
                c.textAlign = 'center';
                c.textBaseline = 'bottom';
                c.globalAlpha = isMain ? 1.0 : 0.9;
                c.fillText(cardinals[normDeg], x, h * 0.26);
                c.globalAlpha = 1;
            } else if (normDeg % 10 === 0) {
                // Tick mediano + numero
                c.strokeStyle = col;
                c.lineWidth = lwMed;
                c.globalAlpha = 0.75;
                c.beginPath();
                c.moveTo(x, h);
                c.lineTo(x, h * 0.48);
                c.stroke();

                c.fillStyle = col;
                c.font = fontDeg + 'px "Courier New", monospace';
                c.textAlign = 'center';
                c.textBaseline = 'bottom';
                c.globalAlpha = 0.7;
                c.fillText(normDeg.toString().padStart(3, '0'), x, h * 0.44);
                c.globalAlpha = 1;
            } else {
                // Tick pequeno (cada 5 grados)
                c.strokeStyle = col;
                c.lineWidth = lwMed;
                c.globalAlpha = 0.35;
                c.beginPath();
                c.moveTo(x, h);
                c.lineTo(x, h * 0.65);
                c.stroke();
                c.globalAlpha = 1;
            }
        }

        // Indicador central: triangulo blanco
        c.fillStyle = '#ffffff';
        c.globalAlpha = 1.0;
        c.beginPath();
        c.moveTo(centerX, h * 0.2);
        c.lineTo(centerX - triSize, 2);
        c.lineTo(centerX + triSize, 2);
        c.closePath();
        c.fill();

        // Linea central
        c.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(centerX, h * 0.2);
        c.lineTo(centerX, h);
        c.stroke();

        // Bordes laterales difuminados
        var fadeW = w * 0.1;

        var gradL = c.createLinearGradient(0, 0, fadeW, 0);
        gradL.addColorStop(0, 'rgba(5, 5, 5, 1)');
        gradL.addColorStop(1, 'rgba(5, 5, 5, 0)');
        c.fillStyle = gradL;
        c.fillRect(0, 0, fadeW, h);

        var gradR = c.createLinearGradient(w - fadeW, 0, w, 0);
        gradR.addColorStop(0, 'rgba(5, 5, 5, 0)');
        gradR.addColorStop(1, 'rgba(5, 5, 5, 1)');
        c.fillStyle = gradR;
        c.fillRect(w - fadeW, 0, fadeW, h);
    }

    // =============================================
    // COMUNICACION CON LUA (NUI MESSAGES)
    // =============================================

    window.addEventListener('message', function (event) {
        var data = event.data;

        switch (data.action) {
            case 'openRadar':
                openRadar(data);
                break;

            case 'closeRadar':
                closeRadar();
                break;

            case 'updateAircraft':
                if (radarActive && data.aircraft) {
                    aircraftData = data.aircraft;
                    updateContactsList();
                }
                break;

            case 'showPilotHUD':
                showPilotHUD(data.config);
                break;

            case 'hidePilotHUD':
                hidePilotHUD();
                break;

            case 'updatePilotHUD':
                updatePilotHUD(data);
                break;
        }
    });

    // =============================================
    // EVENT LISTENERS DE UI
    // =============================================

    // Boton de cerrar
    btnClose.addEventListener('click', function () {
        closeRadar();
        fetch('https://yc-radar/closeRadar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
    });

    // Tecla ESC para cerrar
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && radarActive) {
            closeRadar();
            fetch('https://yc-radar/closeRadar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
        }
    });

    // Zoom: botones
    btnZoomIn.addEventListener('click', function () { zoomIn(); });
    btnZoomOut.addEventListener('click', function () { zoomOut(); });
    btnZoomReset.addEventListener('click', function () { zoomReset(); });

    // Zoom: rueda del raton sobre el radar
    document.addEventListener('wheel', function (e) {
        if (!radarActive) return;

        // Verificar que el cursor esta sobre el area del radar
        var target = e.target;
        var isOverRadar = false;
        while (target) {
            if (target.id === 'radar-display-wrapper' || target.id === 'radar-display' || target.id === 'radar-canvas') {
                isOverRadar = true;
                break;
            }
            target = target.parentElement;
        }

        if (isOverRadar) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    }, { passive: false });

    // Resize handler para responsive
    window.addEventListener('resize', function () {
        if (radarActive) {
            resizeCanvas();
        }
    });

    // =============================================
    // SONIDOS: Vincular a botones estaticos del DOM
    // Los botones dinamicos (.btn-toggle-hide) se vinculan
    // en updateContactsList() al crearse
    // =============================================

    attachButtonSounds(btnClose);
    attachButtonSounds(btnZoomIn);
    attachButtonSounds(btnZoomOut);
    attachButtonSounds(btnZoomReset);

})();
