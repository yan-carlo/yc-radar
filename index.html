-- yc-radar | client/pilot_hud.lua

if not Config.PilotHUD or not Config.PilotHUD.enabled then return end

local hudActive = false

Citizen.CreateThread(function()
    local cfg = Config.PilotHUD

    while true do
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)

        if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped then
            local vehicleClass = GetVehicleClass(vehicle)

            if Config.AircraftClasses[vehicleClass] then
                if not hudActive then
                    hudActive = true
                    SendNUIMessage({
                        action = 'showPilotHUD',
                        config = {
                            speedUnit    = cfg.speedUnit or 'kmh',
                            altitudeUnit = cfg.altitudeUnit or 'm',
                            color        = cfg.color or '#00ff41',
                            opacity      = cfg.opacity or 0.88,
                            width        = cfg.width or 280,
                            compassHeight = cfg.compassHeight or 50,
                            position     = cfg.position or { bottom = 2.5, right = 2.0 },
                        },
                    })
                end

                local coords = GetEntityCoords(vehicle)
                local heading = GetEntityHeading(vehicle)
                -- GTA V heading: counter-clockwise (0=N, 90=W). Convertir a brujula real (0=N, 90=E)
                local compassHeading = (360.0 - heading) % 360.0

                local transponderOn = true
                if GetLocalTransponderState then
                    transponderOn = GetLocalTransponderState()
                end

                SendNUIMessage({
                    action = 'updatePilotHUD',
                    heading = compassHeading,
                    altitude = coords.z,
                    speed = GetEntitySpeed(vehicle),
                    transponderOn = transponderOn,
                })

                Citizen.Wait(50)
            else
                if hudActive then
                    hudActive = false
                    SendNUIMessage({ action = 'hidePilotHUD' })
                end
                Citizen.Wait(1000)
            end
        else
            if hudActive then
                hudActive = false
                SendNUIMessage({ action = 'hidePilotHUD' })
            end
            Citizen.Wait(1000)
        end
    end
end)
