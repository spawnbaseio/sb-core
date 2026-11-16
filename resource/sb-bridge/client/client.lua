-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

local function takeImage(...)
    return exports.spawnbase:takeImage(...)
end

exports('takeImage', takeImage)
AddEventHandler('__cfx_export_fmsdk_takeImage', function(set)
    set(takeImage)
end)
