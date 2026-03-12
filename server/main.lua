-- yc-radar | server/main.lua

-- Framework: carga segun Config.Framework ('qbcore', 'esx', 'auto')
local Framework = nil
local fwType = nil

local function loadFramework(name)
    if name == 'qbcore' then
        local ok, obj = pcall(function() return exports['qb-core']:GetCoreObject() end)
        if ok and obj then return obj, 'qbcore' end
    elseif name == 'esx' then
        local ok, obj = pcall(function() return exports['es_extended']:getSharedObject() end)
        if ok and obj then return obj, 'esx' end
    end
    return nil, nil
end

if Config.Framework == 'auto' then
    Framework, fwType = loadFramework('qbcore')
    if not Framework then
        Framework, fwType = loadFramework('esx')
    end
else
    Framework, fwType = loadFramework(Config.Framework)
end

if not Framework then
    if Config.Framework == 'auto' then
        print('^1[yc-radar] ' .. _L('error_no_framework') .. '^0')
    else
        print('^1[yc-radar] ' .. string.format(_L('error_framework_not_found'), Config.Framework) .. '^0')
    end
    return
end

print(('[yc-radar] Framework detectado: %s'):format(fwType))

-- Wrappers de framework
local function getPlayerJob(src)
    if fwType == 'qbcore' then
        local Player = Framework.Functions.GetPlayer(src)
        if not Player then return nil, nil end
        return Player.PlayerData.job.name, Player.PlayerData.job.grade.level
    elseif fwType == 'esx' then
        local xPlayer = Framework.GetPlayerFromId(src)
        if not xPlayer then return nil, nil end
        return xPlayer.job.name, xPlayer.job.grade
    end
    return nil, nil
end

local function isAdmin(src)
    if IsPlayerAceAllowed(src, 'command') then return true end
    if fwType == 'qbcore' then
        return Framework.Functions.HasPermission(src, 'admin')
    elseif fwType == 'esx' then
        local xPlayer = Framework.GetPlayerFromId(src)
        if not xPlayer then return false end
        local group = xPlayer.getGroup()
        return group == 'admin' or group == 'superadmin'
    end
    return false
end

-- Estado
local radarAircraftData = {}
local activeRadarUsers = {}
local lastDataHash = {}
local lastUpdateTime = {}
local transponderStates = {}
local transponderOwners = {}

local function getTransponderState(netId)
    if not netId or type(netId) ~= 'number' then return true end
    local state = transponderStates[netId]
    if state == nil then return true end
    return state
end

RegisterNetEvent('yc-radar:transponderToggle', function(netId, state)
    local src = source
    if type(state) ~= 'boolean' then return end
    if netId and type(netId) == 'number' and netId > 0 then
        transponderStates[netId] = state
        transponderOwners[netId] = src
    end
end)

-- Validacion de radares
local function validateRadarConfig(radar)
    if not radar.id or type(radar.id) ~= 'string' then
        print('[yc-radar] ERROR: Radar sin ID valido')
        return false
    end
    if not radar.center then
        print(('[yc-radar] ERROR: Radar "%s" sin coordenada center'):format(radar.id))
        return false
    end
    if not radar.radius or type(radar.radius) ~= 'number' or radar.radius <= 0 then
        print(('[yc-radar] ERROR: Radar "%s" radius invalido'):format(radar.id))
        return false
    end
    if not radar.minAltitude or type(radar.minAltitude) ~= 'number' then
        print(('[yc-radar] ERROR: Radar "%s" minAltitude invalido'):format(radar.id))
        return false
    end
    return true
end

local function generateDataHash(data)
    if not data or #data == 0 then return '0' end
    local parts = {}
    for i, a in ipairs(data) do
        parts[i] = tostring(a.netId or 0)
            .. '_' .. tostring(math.floor((a.x or 0) / 10))
            .. '_' .. tostring(math.floor((a.y or 0) / 10))
            .. '_' .. tostring(math.floor((a.z or 0) / 10))
            .. '_' .. tostring(a.speed or 0)
            .. '_' .. tostring(a.transponderOn and 1 or 0)
    end
    return table.concat(parts, '|')
end

local function sortAndLimitAircraft(data, centerX, centerY, maxBlips)
    if #data <= maxBlips then return data end
    for _, aircraft in ipairs(data) do
        local dx = (aircraft.x or 0) - centerX
        local dy = (aircraft.y or 0) - centerY
        aircraft._dist = dx * dx + dy * dy
    end
    table.sort(data, function(a, b) return (a._dist or 0) < (b._dist or 0) end)
    local limited = {}
    for i = 1, math.min(#data, maxBlips) do
        data[i]._dist = nil
        limited[i] = data[i]
    end
    return limited
end

-- Inicializacion
Citizen.CreateThread(function()
    local validCount = 0
    for i, radar in ipairs(Config.Radars) do
        if radar.enabled then
            if validateRadarConfig(radar) then
                radarAircraftData[radar.id] = {}
                activeRadarUsers[radar.id] = {}
                lastDataHash[radar.id] = '0'
                validCount = validCount + 1
            else
                Config.Radars[i].enabled = false
            end
        end
    end
    print(('[yc-radar] %d radares activos | Intervalo: %dms | MaxBlips: %d'):format(
        validCount, Config.DetectionInterval, Config.MaxBlips
    ))
end)

-- Escaneo periodico
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(Config.DetectionInterval)
        for _, radar in ipairs(Config.Radars) do
            if radar.enabled and radarAircraftData[radar.id] then
                local hasUsers = false
                for _ in pairs(activeRadarUsers[radar.id] or {}) do
                    hasUsers = true
                    break
                end
                if hasUsers then
                    TriggerClientEvent('yc-radar:requestScan', -1, radar.id, radar.center, radar.radius, radar.minAltitude)
                end
            end
        end
    end
end)

-- Recibir datos de aeronaves
RegisterNetEvent('yc-radar:scanResult', function(radarId, aircraftList)
    local src = source
    if type(radarId) ~= 'string' or type(aircraftList) ~= 'table' then return end
    if not radarAircraftData[radarId] then return end

    -- Anti-spam
    if #aircraftList > Config.MaxBlips + 20 then
        print(('[yc-radar] WARN: Jugador %d envio %d resultados para %s'):format(src, #aircraftList, radarId))
        return
    end

    lastUpdateTime[radarId] = os.time()

    local currentData = radarAircraftData[radarId] or {}
    local mergedData = {}
    local seenKeys = {}

    for _, aircraft in ipairs(aircraftList) do
        local key = tostring(aircraft.netId or '')
        if key ~= '' and not seenKeys[key] then
            seenKeys[key] = true
            if type(aircraft.netId) == 'number' and aircraft.netId > 0 then
                aircraft.transponderOn = getTransponderState(aircraft.netId)
            end
            mergedData[#mergedData + 1] = aircraft
        end
    end

    for _, aircraft in ipairs(currentData) do
        local key = tostring(aircraft.netId or '')
        if key ~= '' and aircraft.source ~= src and not seenKeys[key] then
            seenKeys[key] = true
            mergedData[#mergedData + 1] = aircraft
        end
    end

    local radarCenterX, radarCenterY = 0, 0
    for _, radar in ipairs(Config.Radars) do
        if radar.id == radarId then
            radarCenterX = radar.center.x
            radarCenterY = radar.center.y
            break
        end
    end

    mergedData = sortAndLimitAircraft(mergedData, radarCenterX, radarCenterY, Config.MaxBlips)

    local newHash = generateDataHash(mergedData)
    local hasChanged = (newHash ~= lastDataHash[radarId])

    radarAircraftData[radarId] = mergedData
    lastDataHash[radarId] = newHash

    if hasChanged then
        for playerId in pairs(activeRadarUsers[radarId] or {}) do
            TriggerClientEvent('yc-radar:updateRadarData', playerId, radarId, mergedData)
        end
    end
end)

-- Solicitud de apertura
RegisterNetEvent('yc-radar:requestOpen', function(radarId)
    local src = source
    if type(radarId) ~= 'string' then return end

    local radarConfig = nil
    for _, radar in ipairs(Config.Radars) do
        if radar.id == radarId and radar.enabled then
            radarConfig = radar
            break
        end
    end

    if not radarConfig then
        TriggerClientEvent('yc-radar:accessDenied', src, _L('notify_radar_not_found'))
        return
    end

    if radarConfig.jobRestriction ~= 'all' then
        local jobName, jobGrade = getPlayerJob(src)
        if not jobName then
            TriggerClientEvent('yc-radar:accessDenied', src, _L('notify_player_error'))
            return
        end
        if jobName ~= radarConfig.jobRestriction then
            TriggerClientEvent('yc-radar:accessDenied', src, _L('notify_wrong_job'))
            return
        end
        if radarConfig.minJobGrade > 0 and (jobGrade or 0) < radarConfig.minJobGrade then
            TriggerClientEvent('yc-radar:accessDenied', src, _L('notify_wrong_grade'))
            return
        end
    end

    if not activeRadarUsers[radarId] then
        activeRadarUsers[radarId] = {}
    end
    activeRadarUsers[radarId][src] = true

    TriggerClientEvent('yc-radar:openConfirmed', src, radarId, {
        id = radarConfig.id,
        label = radarConfig.label,
        center = radarConfig.center,
        radius = radarConfig.radius,
        minAltitude = radarConfig.minAltitude,
        ui = radarConfig.ui,
    })
    TriggerClientEvent('yc-radar:updateRadarData', src, radarId, radarAircraftData[radarId] or {})
end)

RegisterNetEvent('yc-radar:closeRadar', function(radarId)
    local src = source
    if type(radarId) ~= 'string' then return end
    if activeRadarUsers[radarId] then
        activeRadarUsers[radarId][src] = nil
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    for _, users in pairs(activeRadarUsers) do
        users[src] = nil
    end
    for netId, owner in pairs(transponderOwners) do
        if owner == src then
            transponderStates[netId] = nil
            transponderOwners[netId] = nil
        end
    end
end)

-- Limpieza de datos obsoletos (previene aeronaves fantasma)
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(5000)
        local now = os.time()
        for _, radar in ipairs(Config.Radars) do
            if radar.enabled and radarAircraftData[radar.id] then
                local lastUpdate = lastUpdateTime[radar.id] or 0
                if now - lastUpdate > 10 and #radarAircraftData[radar.id] > 0 then
                    radarAircraftData[radar.id] = {}
                    lastDataHash[radar.id] = '0'
                    for playerId in pairs(activeRadarUsers[radar.id] or {}) do
                        TriggerClientEvent('yc-radar:updateRadarData', playerId, radar.id, {})
                    end
                end
            end
        end
    end
end)

-- Comando /radar (solo admins)
RegisterCommand('radar', function(source, args)
    local src = source
    if src <= 0 then return end

    if not isAdmin(src) then
        TriggerClientEvent('yc-radar:accessDenied', src, _L('notify_no_permission'))
        return
    end

    local targetRadarId = args[1]
    local radarConfig = nil
    for _, radar in ipairs(Config.Radars) do
        if radar.enabled then
            if targetRadarId then
                if radar.id == targetRadarId then
                    radarConfig = radar
                    break
                end
            else
                radarConfig = radar
                break
            end
        end
    end

    if not radarConfig then
        TriggerClientEvent('yc-radar:accessDenied', src, _L('notify_radar_not_found'))
        return
    end

    if not activeRadarUsers[radarConfig.id] then
        activeRadarUsers[radarConfig.id] = {}
    end
    activeRadarUsers[radarConfig.id][src] = true

    TriggerClientEvent('yc-radar:forceOpen', src, radarConfig.id, {
        id = radarConfig.id,
        label = radarConfig.label,
        center = radarConfig.center,
        radius = radarConfig.radius,
        minAltitude = radarConfig.minAltitude,
        ui = radarConfig.ui,
    })
    TriggerClientEvent('yc-radar:updateRadarData', src, radarConfig.id, radarAircraftData[radarConfig.id] or {})
end, false)

-- Exports
exports('getRadarAircraft', function(radarId)
    if type(radarId) ~= 'string' or radarId == '' then return nil end
    if not radarAircraftData[radarId] then return nil end
    local copy = {}
    for i, v in ipairs(radarAircraftData[radarId]) do copy[i] = v end
    return copy
end)

exports('isRadarActive', function(radarId)
    if type(radarId) ~= 'string' or radarId == '' then return false end
    if not activeRadarUsers[radarId] then return false end
    for _ in pairs(activeRadarUsers[radarId]) do return true end
    return false
end)

exports('getRadarAircraftCount', function(radarId)
    if type(radarId) ~= 'string' or radarId == '' then return 0 end
    if not radarAircraftData[radarId] then return 0 end
    return #radarAircraftData[radarId]
end)

exports('getTransponderState', function(netId)
    if type(netId) ~= 'number' or netId <= 0 then return true end
    return getTransponderState(netId)
end)

exports('setTransponderState', function(netId, state)
    if type(netId) ~= 'number' or netId <= 0 then return false end
    if type(state) ~= 'boolean' then return false end
    transponderStates[netId] = state
    return true
end)

-- Limpieza de transponders huerfanos
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(30000)
        for netId, _ in pairs(transponderStates) do
            local owner = transponderOwners[netId]
            if owner and not GetPlayerName(owner) then
                transponderStates[netId] = nil
                transponderOwners[netId] = nil
            end
        end
    end
end)
