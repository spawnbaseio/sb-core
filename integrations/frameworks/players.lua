-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

local players = {}

local function kind()
    if GetResourceState('qbx_core') == 'started' then return 'qbox' end
    if GetResourceState('qb-core') == 'started' then return 'qbcore' end
    if GetResourceState('es_extended') == 'started' then return 'esx' end
    return 'standalone'
end

function players.kind()
    return kind()
end

-- Returns { citizenid|identifier, name, job } or {} when unknown.
function players.who(src)
    if type(src) ~= 'number' or src < 1 or src % 1 ~= 0 or not GetPlayerName(src) then return {} end
    local out = {}
    local k = kind()
    local ok, res = pcall(function()
        if k == 'qbox' then
            local data = exports.qbx_core:GetPlayer(src).PlayerData
            out.citizenid = data.citizenid
            out.job = data.job and data.job.name
        elseif k == 'qbcore' then
            local data = exports['qb-core']:GetCoreObject().Functions.GetPlayer(src).PlayerData
            out.citizenid = data.citizenid
            out.job = data.job and data.job.name
        elseif k == 'esx' then
            local player = exports.es_extended:getSharedObject().GetPlayerFromId(src)
            if not player then return end
            out.identifier = player.identifier
            out.job = player.job and player.job.name
        end
    end)
    if not ok then return {} end
    out.name = GetPlayerName(src)
    return out
end

-- Log with the player folded into metadata.
function players.log(dataset, level, message, src, meta)
    meta = meta or {}
    if src then
        meta.playerSource = src
        meta.player = players.who(src)
    end
    return exports.spawnbase:Log(dataset, level, message, meta)
end

return players
