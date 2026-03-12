-- yc-radar | client/main.lua

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

if not Framework then return end

-- Estado
local isRadarOpen = false
local currentRadarId = nil
local currentRadarConfig = nil
local lastNuiUpdateTime = 0
local lastAircraftHash = ''
local cachedAircraftData = nil
local myTransponderOn = true

local function notify(msg, notifType)
    if fwType == 'qbcore' then
        Framework.Functions.Notify(msg, notifType or 'primary', 5000)
    elseif fwType == 'esx' then
        Framework.ShowNotification(msg)
    end
end

Citizen.CreateThread(function()
    Citizen.Wait(500)
    AddTextEntry('YC_RADAR_HELP', _L('notify_interact'))
end)

local function hashAircraftData(data)
    if not data or #data == 0 then return '0' end
    local count = #data
    local sumX, sumY, sumZ = 0, 0, 0
    for _, a in ipairs(data) do
        sumX = sumX + math.floor((a.x or 0) / 5)
        sumY = sumY + math.floor((a.y or 0) / 5)
        sumZ = sumZ + math.floor((a.z or 0) / 5)
    end
    return count .. '_' .. sumX .. '_' .. sumY .. '_' .. sumZ
end

local function buildLocaleTable()
    local keys = {
        'radar_title', 'contacts_detected', 'no_contacts', 'close',
        'info_radius', 'info_min_alt', 'info_contacts', 'info_status',
        'info_hidden', 'status_active', 'info_zoom',
        'zoom_in', 'zoom_out', 'zoom_reset',
        'type_plane', 'type_heli',
        'label_type', 'label_model', 'label_alt', 'label_speed',
        'label_heading', 'label_distance', 'label_bearing',
        'label_plate',
        'unknown', 'unknown_aircraft',
        'btn_hide', 'btn_show',
        'cardinal_n', 'cardinal_s', 'cardinal_e', 'cardinal_w',
        'cardinal_ne', 'cardinal_nw', 'cardinal_se', 'cardinal_sw',
    }
    local t = {}
    for _, key in ipairs(keys) do
        t[key] = _L(key)
    end
    return t
end

-- Proximidad: busca el radar mas cercano
local cachedNearestRadar = nil
local cachedNearestDist = math.huge

Citizen.CreateThread(function()
    local markerThresholdSq = 8.0 * 8.0

    while true do
        if isRadarOpen then
            cachedNearestRadar = nil
            cachedNearestDist = math.huge
            Citizen.Wait(1000)
        else
            local playerCoords = GetEntityCoords(PlayerPedId())
            local bestRadar = nil
            local bestDistSq = math.huge

            for _, radar in ipairs(Config.Radars) do
                if radar.enabled then
                    local dx = playerCoords.x - radar.interactCoord.x
                    local dy = playerCoords.y - radar.interactCoord.y
                    local dz = playerCoords.z - radar.interactCoord.z
                    local distSq = dx * dx + dy * dy + dz * dz
                    if distSq < bestDistSq then
                        bestDistSq = distSq
                        bestRadar = radar
                    end
                end
            end

            cachedNearestRadar = bestRadar
            cachedNearestDist = bestDistSq < markerThresholdSq and math.sqrt(bestDistSq) or math.huge

            if bestDistSq < markerThresholdSq then
                Citizen.Wait(200)
            elseif bestDistSq < 2500.0 then
                Citizen.Wait(500)
            else
                Citizen.Wait(1000)
            end
        end
    end
end)

-- Marcadores e interaccion
Citizen.CreateThread(function()
    local markerType = Config.MarkerType
    local markerR = Config.MarkerColor.r
    local markerG = Config.MarkerColor.g
    local markerB = Config.MarkerColor.b
    local markerA = Config.MarkerColor.a
    local showMarker = Config.ShowMarker
    local interactDist = Config.InteractDistance
    local interactKey = Config.InteractKey

    while true do
        local radar = cachedNearestRadar
        local dist = cachedNearestDist

        if radar and dist < 8.0 then
            local coord = radar.interactCoord

            if showMarker then
                DrawMarker(
                    markerType,
                    coord.x, coord.y, coord.z - 0.98,
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    0.8, 0.8, 0.5,
                    markerR, markerG, markerB, markerA,
                    false, true, 2, nil, nil, false
                )
            end

            if dist < interactDist then
                BeginTextCommandDisplayHelp('YC_RADAR_HELP')
                EndTextCommandDisplayHelp(0, false, true, -1)

                if IsControlJustReleased(0, interactKey) and not isRadarOpen then
                    TriggerServerEvent('yc-radar:requestOpen', radar.id)
                end
            end

            Citizen.Wait(0)
        else
            Citizen.Wait(500)
        end
    end
end)

-- Escaneo de aeronaves (solicitado por el servidor)
RegisterNetEvent('yc-radar:requestScan', function(radarId, center, radius, minAltitude)
    if not radarId or not center or not radius then return end

    local playerCoords = GetEntityCoords(PlayerPedId())
    local playerDistToCenter = #(vector2(playerCoords.x, playerCoords.y) - vector2(center.x, center.y))
    if playerDistToCenter > radius + 500.0 then return end

    local aircraftList = {}
    local vehicles = GetGamePool('CVehicle')
    local centerX2D = center.x
    local centerY2D = center.y
    local radiusSq = radius * radius

    for _, vehicle in ipairs(vehicles) do
        if DoesEntityExist(vehicle) and not IsEntityDead(vehicle) then
            local vehCoords = GetEntityCoords(vehicle)
            local dx = vehCoords.x - centerX2D
            local dy = vehCoords.y - centerY2D
            local distSq = dx * dx + dy * dy

            if distSq <= radiusSq and vehCoords.z >= minAltitude then
                local vehicleClass = GetVehicleClass(vehicle)

                if Config.AircraftClasses[vehicleClass] then
                    local speed = GetEntitySpeed(vehicle) * 3.6
                    local heading = GetEntityHeading(vehicle)
                    local vehicleModel = GetEntityModel(vehicle)
                    local displayName = GetDisplayNameFromVehicleModel(vehicleModel)
                    local plate = (GetVehicleNumberPlateText(vehicle) or ''):gsub('^%s+', ''):gsub('%s+$', '')

                    local netId = nil
                    if NetworkGetEntityIsNetworked(vehicle) then
                        netId = NetworkGetNetworkIdFromEntity(vehicle)
                    else
                        netId = 'local_' .. vehicle
                    end

                    local transponderOn = true
                    local driver = GetPedInVehicleSeat(vehicle, -1)
                    if driver ~= 0 and driver == PlayerPedId() then
                        transponderOn = myTransponderOn
                    elseif driver ~= 0 and IsPedAPlayer(driver) then
                        transponderOn = true -- El servidor lo sobreescribira
                    else
                        transponderOn = Config.Transponder.npcDefaultOn
                    end

                    aircraftList[#aircraftList + 1] = {
                        netId = netId,
                        x = vehCoords.x,
                        y = vehCoords.y,
                        z = vehCoords.z,
                        speed = math.floor(speed),
                        heading = math.floor(heading),
                        altitude = math.floor(vehCoords.z),
                        model = displayName or _L('unknown'),
                        plate = plate,
                        vehicleClass = vehicleClass,
                        transponderOn = transponderOn,
                        source = GetPlayerServerId(PlayerId()),
                    }

                    if #aircraftList >= Config.MaxBlips then break end
                end
            end
        end
    end

    TriggerServerEvent('yc-radar:scanResult', radarId, aircraftList)
end)

-- Eventos del servidor
RegisterNetEvent('yc-radar:accessDenied', function(reason)
    notify(reason or _L('notify_access_denied'), 'error')
end)

local function openRadarNUI(radarId, radarConfig)
    if isRadarOpen then return end

    isRadarOpen = true
    currentRadarId = radarId
    currentRadarConfig = radarConfig
    lastNuiUpdateTime = 0
    lastAircraftHash = ''
    cachedAircraftData = nil

    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'openRadar',
        radarId = radarId,
        label = radarConfig.label,
        radius = radarConfig.radius,
        minAltitude = radarConfig.minAltitude,
        centerX = radarConfig.center.x,
        centerY = radarConfig.center.y,
        ui = radarConfig.ui,
        locale = buildLocaleTable(),
    })

    notify(string.format(_L('notify_radar_activated'), radarConfig.label or radarId), 'success')
end

RegisterNetEvent('yc-radar:openConfirmed', function(radarId, radarConfig)
    openRadarNUI(radarId, radarConfig)
end)

RegisterNetEvent('yc-radar:forceOpen', function(radarId, radarConfig)
    openRadarNUI(radarId, radarConfig)
end)

RegisterNetEvent('yc-radar:updateRadarData', function(radarId, aircraftData)
    if not isRadarOpen or currentRadarId ~= radarId then return end

    cachedAircraftData = aircraftData

    local now = GetGameTimer()
    if now - lastNuiUpdateTime < Config.UIRefreshInterval then return end

    local newHash = hashAircraftData(aircraftData)
    if newHash == lastAircraftHash then return end

    lastNuiUpdateTime = now
    lastAircraftHash = newHash
    SendNUIMessage({ action = 'updateAircraft', aircraft = aircraftData })
end)

-- Enviar datos cacheados que se perdieron por el throttle
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(Config.UIRefreshInterval)
        if isRadarOpen and cachedAircraftData then
            local now = GetGameTimer()
            if now - lastNuiUpdateTime >= Config.UIRefreshInterval then
                local newHash = hashAircraftData(cachedAircraftData)
                if newHash ~= lastAircraftHash then
                    lastNuiUpdateTime = now
                    lastAircraftHash = newHash
                    SendNUIMessage({ action = 'updateAircraft', aircraft = cachedAircraftData })
                end
            end
        end
    end
end)

-- NUI Callbacks
RegisterNUICallback('closeRadar', function(data, cb)
    if isRadarOpen and currentRadarId then
        TriggerServerEvent('yc-radar:closeRadar', currentRadarId)
    end
    isRadarOpen = false
    currentRadarId = nil
    currentRadarConfig = nil
    cachedAircraftData = nil
    SetNuiFocus(false, false)
    cb({ ok = true })
end)

-- Transponder
local function isPlayerPilotingAircraft()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 then return false, nil end
    if GetPedInVehicleSeat(vehicle, -1) ~= ped then return false, nil end
    if not Config.AircraftClasses[GetVehicleClass(vehicle)] then return false, nil end
    return true, vehicle
end

RegisterCommand(Config.Transponder.commandName or 'transponder', function(source, args)
    local isPiloting, vehicle = isPlayerPilotingAircraft()
    if not isPiloting then
        notify(_L('notify_not_in_aircraft'), 'error')
        return
    end

    if args[1] then
        local arg = string.lower(args[1])
        if arg == 'on' then
            myTransponderOn = true
        elseif arg == 'off' then
            myTransponderOn = false
        else
            notify(_L('notify_transponder_usage'), 'error')
            return
        end
    else
        myTransponderOn = not myTransponderOn
    end

    local netId = nil
    if NetworkGetEntityIsNetworked(vehicle) then
        netId = NetworkGetNetworkIdFromEntity(vehicle)
    end
    TriggerServerEvent('yc-radar:transponderToggle', netId, myTransponderOn)

    if myTransponderOn then
        notify(_L('notify_transponder_on'), 'success')
    else
        notify(_L('notify_transponder_off'), 'error')
    end
end, false)

RegisterKeyMapping(
    Config.Transponder.commandName or 'transponder',
    'Transponder ON/OFF',
    'keyboard',
    Config.Transponder.defaultKey or 'Y'
)

-- Auto-reset transponder al subir a nueva aeronave
local lastPilotedVehicle = 0

Citizen.CreateThread(function()
    while true do
        Citizen.Wait(1000)
        local isPiloting, vehicle = isPlayerPilotingAircraft()
        if isPiloting and vehicle ~= lastPilotedVehicle then
            lastPilotedVehicle = vehicle
            myTransponderOn = true
            local netId = nil
            if NetworkGetEntityIsNetworked(vehicle) then
                netId = NetworkGetNetworkIdFromEntity(vehicle)
            end
            TriggerServerEvent('yc-radar:transponderToggle', netId, true)
        elseif not isPiloting then
            lastPilotedVehicle = 0
        end
    end
end)

-- Exports
exports('isRadarOpen', function() return isRadarOpen end)
exports('getCurrentRadarId', function() return currentRadarId end)

exports('closeRadar', function()
    if isRadarOpen and currentRadarId then
        TriggerServerEvent('yc-radar:closeRadar', currentRadarId)
        SendNUIMessage({ action = 'closeRadar' })
        isRadarOpen = false
        currentRadarId = nil
        currentRadarConfig = nil
        cachedAircraftData = nil
        SetNuiFocus(false, false)
        return true
    end
    return false
end)

exports('isTransponderOn', function() return myTransponderOn end)

-- Acceso global para pilot_hud.lua (comparten estado Lua)
function GetLocalTransponderState()
    return myTransponderOn
end

exports('setTransponder', function(state)
    if type(state) ~= 'boolean' then return false end
    myTransponderOn = state
    local isPiloting, vehicle = isPlayerPilotingAircraft()
    if isPiloting and vehicle then
        local netId = nil
        if NetworkGetEntityIsNetworked(vehicle) then
            netId = NetworkGetNetworkIdFromEntity(vehicle)
        end
        TriggerServerEvent('yc-radar:transponderToggle', netId, myTransponderOn)
    end
    return true
end)
