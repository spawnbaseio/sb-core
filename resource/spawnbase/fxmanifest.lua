-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 Spawnbase

fx_version 'cerulean'
game 'gta5'

author 'Spawnbase'
description 'Spawnbase media + logging SDK for FiveM'
version '0.3.0'
license 'GPL-3.0-only'
node_version '22'

-- Start sb-screenshot before using capture exports.

files { 'config.json' }

client_script 'client/client.lua'
server_script 'server/server.js'
