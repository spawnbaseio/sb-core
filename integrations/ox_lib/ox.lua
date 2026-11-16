-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

local function log(source, event, message, ...)
    local meta = { action = event }
    if source and source > 0 then meta.playerSource = source end
    local extra = { ... }
    if #extra > 0 then meta.args = extra end
    exports.spawnbase:Log('default', 'info', ('%s: %s'):format(event, message), meta)
end

return log
