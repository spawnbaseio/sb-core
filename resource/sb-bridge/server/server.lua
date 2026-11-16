-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

local function expose(name, fn)
    exports(name, fn)
    AddEventHandler(('__cfx_export_fmsdk_%s'):format(name), function(set)
        set(fn)
    end)
end

for _, name in ipairs({ 'takeServerImage', 'uploadImage', 'uploadFile', 'requestPresignedUrl' }) do
    local method = name
    expose(method, function(...)
        return exports.spawnbase[method](nil, ...)
    end)
end

local function log(dataset, level, message, metadata)
    return exports.spawnbase:Log(dataset, level, message, metadata, { _internal_RESOURCE = GetInvokingResource() })
end
expose('Log', log)
expose('LogMessage', function(level, message, metadata)
    return log('default', level, message, metadata)
end)
for _, name in ipairs({ 'Info', 'Warn', 'Error', 'Debug' }) do
    local level = name:lower()
    expose(name, function(dataset, message, metadata)
        return log(dataset, level, message, metadata)
    end)
end
