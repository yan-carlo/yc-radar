Config = {}

Config.Locale = 'en'
Config.Framework = 'qbcore'             -- 'qbcore', 'esx' o 'auto' (detecta automaticamente)
Config.InteractKey = 38
Config.InteractDistance = 2.0
Config.ShowMarker = true
Config.MarkerType = 25
Config.MarkerColor = { r = 0, g = 150, b = 255, a = 120 }

Config.DetectionInterval = 2000
Config.UIRefreshInterval = 1000
Config.MaxBlips = 80

Config.Transponder = {
    npcDefaultOn = true,
    commandName = 'transponder',
    defaultKey = 'Y',
}

Config.AircraftClasses = {
    [15] = true,    -- Helicopteros
    [16] = true,    -- Aviones
}

Config.PilotHUD = {
    enabled = true,
    speedUnit = 'mph',          -- 'kmh', 'mph', 'kts'
    altitudeUnit = 'm',         -- 'm', 'ft'
    color = '#ffffff',
    opacity = 0.88,
    width = 560,
    compassHeight = 100,
    position = {
        bottom = 2.5,           -- vh
        right = 2.0,            -- vw
    },
}

Config.Radars = {
    {
        id = 'lsia_radar',
        label = 'LSIA - Radar Principal',    
        enabled = false,                                    -- Activar o desactivar este radar
        center = vector3(-1037.0, -2963.0, 13.95),          -- Centro del radar
        radius = 5000.0,                                    -- Radio de detección
        minAltitude = 50.0,                                 -- Altitud mínima para detección
        interactCoord = vector3(-1037.0, -2963.0, 13.95),   -- Coordenada para interactuar con el radar 
        jobRestriction = 'all',                             -- 'all' para todos, o el nombre del trabajo (ej. 'police')
        minJobGrade = 0,                                    -- Grado mínimo del trabajo para interactuar (0 para todos los grados)
        ui = {
            radarColor = '#ffffff',
            backgroundColor = '#0a0a0a',
            sweepColor = 'rgba(0, 0, 0, 0.15)',
            blipFriendly = '#ffffff',
            blipUnknown = '#ff3333',
            rangeRings = 4,
        },
    },
    {
        id = 'zancudo_radar',
        label = 'Fort Zancudo',
        enabled = true,
        center = vector3(-2505.38, 3305.08, 99.0),
        radius = 10000.0,
        minAltitude = 45.0,
        interactCoord = vector3(-2358.17, 3248.32, 101.45),
        jobRestriction = 'police',
        minJobGrade = 0,
        ui = {
            radarColor = '#00ccff',
            backgroundColor = '#050a10',
            sweepColor = 'rgba(0, 204, 255, 0.15)',
            blipFriendly = '#00ff41',
            blipUnknown = '#ff3333',
            rangeRings = 5,
        },
    },
}

Locales = {}

function _L(key)      
    local locale = Config.Locale or 'es'
    if Locales[locale] and Locales[locale][key] then
        return Locales[locale][key]
    end
    if Locales['es'] and Locales['es'][key] then
        return Locales['es'][key]
    end
    return key
end
