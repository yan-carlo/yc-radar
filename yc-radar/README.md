# Sistema de Radar Aeroportuario para FiveM/ESX

Radar avanzado estilo militar para servidores FiveM (compatible con ESX/QBCore). Permite monitorear aeronaves (aviones, helicópteros, jets) dentro de un área configurable, con interfaz NUI realista y muchas características útiles para roleplay ATC / control aéreo.

![Vista previa del radar](https://r2.fivemanage.com/O5yfhtPtAV4DBIWUnbt2S/Capturadepantalla2026-03-12074658.png) (https://r2.fivemanage.com/O5yfhtPtAV4DBIWUnbt2S/Capturadepantalla2026-03-12075010.png) (https://r2.fivemanage.com/O5yfhtPtAV4DBIWUnbt2S/Capturadepantalla2026-03-12075058.png)

## Características principales

- Configurable: coordenada central, radio de detección, altitud mínima
- Detección de aeronaves de jugadores **y NPCs** (sin distinguir entre ellos)
- Sistema de **Transponders** (on/off): aeronaves con transponder apagado aparecen como "Desconocida" (color gris/rojo configurable)
- Interfaz NUI grande y responsive (ocupa ~80-90% de pantalla)
- Direcciones cardinales (N, S, E, W + diagonales opcionales)
- Zoom con botones + rueda del mouse + reset
- Ocultar aeronaves específicas (client-side, persiste en la sesión)
- Soporte multi-radar (cada uno con su propia config, job y sala de operaciones)
- Restricción por job o abierto a todos
- Archivos de idioma (es/en) – fácil de traducir
- Optimizado para servidores con 100+ jugadores (intervalos configurables, límite de blips, etc.)
- Muestra matrícula de la aeronave (si transponder encendido)

## Instalación

1. Descarga o clona este repositorio
2. Coloca la carpeta (por ejemplo `radar-aeropuerto`) en la carpeta `resources/` de tu servidor
3. Añade a tu `server.cfg`:

## ensure radar-aeropuerto

4. Configura todo en `config.lua` (coordenadas, radios, jobs, intervalos, colores de blips, etc.)
5. Reinicia el recurso o el servidor

**Dependencias recomendadas** (según tu framework):
- ESX / QBCore (para jobs y notificaciones)
- ox_lib (opcional, para mejor UI/notificaciones)

## Configuración

La mayoría de las opciones están en `config.lua`. Ejemplos clave:

```lua
Config.Radars = {
 {
     center = vector3(-1234.5, 5678.9, 10.0),     -- Centro del radar
     radius = 8000.0,                              -- Radio en metros
     minAltitude = 150.0,                          -- Altitud mínima para detectar
     interactionPos = vector3(-1230.0, 5680.0, 10.0), -- Punto donde interactuar (E)
     allowedJobs = {'atc', 'police'},              -- nil o {} = todos
     -- etc.
 },
 -- Puedes agregar más radares aquí
}

Config.Locale = 'es'           -- 'es' o 'en'
Config.DetectionInterval = 1200 -- ms entre chequeos
Config.MaxBlips = 60            -- Límite de aeronaves mostradas
Comandos útiles (para jugadores con acceso)

/transponder on → Activar transponder
/transponder off → Apagar transponder (aparecerás como desconocido)