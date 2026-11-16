-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

local pending = nil
local seq = 0
local stopped = false
local captures = {}

RegisterNetEvent('spawnbase:capture', function(id, url, options)
    if source ~= 65535 or stopped or type(id) ~= 'string' or type(url) ~= 'string' then return end
    if captures[id] then return end
    local request = {}
    captures[id] = request
    local function done(success)
        if captures[id] ~= request then return end
        captures[id] = nil
        if stopped then return end
        TriggerServerEvent('spawnbase:done', id, success == true)
    end
    local ok = pcall(function()
        request.id = exports['sb-screenshot']:capture(url, options, function(response)
            done(type(response) == 'table' and response.status == 'ok')
        end)
    end)
    if not ok then done(false) end
end)

RegisterNetEvent('spawnbase:cancel', function(id)
    if source ~= 65535 or type(id) ~= 'string' then return end
    local request = captures[id]
    if not request then return end
    captures[id] = nil
    if request.id then exports['sb-screenshot']:cancel(request.id) end
end)

RegisterNetEvent('spawnbase:give', function(id, file)
    if source ~= 65535 or not pending or pending.id ~= id then return end
    local request = pending
    pending = nil
    request.promise:resolve(file and { status = 'ok', data = file } or nil)
end)

exports('takeImage', function(metadata, options)
    if stopped or pending then return nil end
    seq = seq + 1
    local request = { id = ('%s_%s'):format(GetGameTimer(), seq), promise = promise.new() }
    pending = request
    TriggerServerEvent('spawnbase:want', request.id, metadata, options)
    SetTimeout(30000, function()
        if pending ~= request then return end
        pending = nil
        request.promise:resolve(nil)
    end)
    return Citizen.Await(request.promise)
end)

AddEventHandler('onClientResourceStop', function(name)
    if name == 'sb-screenshot' then
        for id in pairs(captures) do
            captures[id] = nil
            TriggerServerEvent('spawnbase:done', id, false)
        end
        return
    end
    if name ~= GetCurrentResourceName() then return end
    stopped = true
    captures = {}
    if pending then pending.promise:resolve(nil) end
    pending = nil
end)
