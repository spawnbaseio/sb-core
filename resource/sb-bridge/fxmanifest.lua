-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

fx_version 'cerulean'
game 'gta5'

author 'Spawnbase'
description 'Forwards legacy export names to the spawnbase resource'
version '0.3.0'
license 'GPL-3.0-only'

-- Limited compatibility adapter. Start spawnbase before this resource.
-- Retention exemptions are not supported.
dependency 'spawnbase'
provide 'fmsdk'

client_script 'client/client.lua'
server_script 'server/server.lua'
