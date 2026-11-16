# Spawnbase SDK

Logs, file uploads and player screenshots for FiveM servers, sent to your [Spawnbase](https://spawnbase.io) team. The resource is built on a small Node.js client that lives in `src/` and also works on its own.

Full documentation is at [docs.spawnbase.io/sdks/fivem](https://docs.spawnbase.io/sdks/fivem/).

## Install

You need an FXServer build with Node.js 22 and a Logs key, a Media key, or both. Create keys in the dashboard under Team, API keys.

1. Download the ZIP from the [latest release](https://github.com/spawnbaseio/sb-core/releases/latest).
2. Copy `spawnbase` and `sb-screenshot` into your server's `resources` folder.
3. Add the keys to `server.cfg` with `set`, not `setr`, so they never reach players:

```text
set SPAWNBASE_LOGS_API_KEY "sb_logs_key"
set SPAWNBASE_MEDIA_API_KEY "sb_media_key"
set SPAWNBASE_SERVER_ID "roleplay-1"
ensure sb-screenshot
ensure spawnbase
```

4. Run `spawnbase_check` in the server console. It sends a test event and prints a link to it in the dashboard. `spawnbase_check media` uploads a small private test image as well.

`sb-screenshot` is only needed for screenshots. Logs and uploads work without it.

## Logs

```lua
exports.spawnbase:Info('economy', 'Purchase', { playerSource = source, item = 'water' })
```

The first argument is the dataset, which is how events are grouped in the dashboard. `Warn`, `Error` and `Debug` take the same arguments. They return `true` once the event is queued.

Events are batched in memory and sent every two seconds. If the queue fills up or the resource stops first, events are dropped, so do not treat a `true` as proof of delivery. `status()` returns the counters, `flush()` sends what is waiting, and `close(timeout)` flushes and stops.

`Record` takes a level as well and returns the event's id, which is useful when you want to refer to it later:

```lua
local event = exports.spawnbase:Record('economy', 'info', 'Purchase', { correlationId = 'order-42' })
if event then print(event.traceId) end
```

## Screenshots

```lua
local ok, result = pcall(function()
    return exports.spawnbase:takeServerImage(source, { correlationId = 'report-42' }, {}, 10000)
end)
if ok then
    exports.spawnbase:Info('moderation', 'Report captured', {
        playerSource = source,
        correlationId = 'report-42',
        fileId = result.data.id,
    })
end
```

The arguments are the player, metadata to store with the file, upload options (`filename`, `path`) and a timeout in milliseconds. The call throws if the capture fails.

Your key stays on the server. The server asks the API for a short-lived upload link, the player's client captures the game view and uploads to that link, and the server confirms the file before returning it. Screenshots are private WebP images, scaled down to 1920 by 1080. Only one capture runs per player, and four across the server.

To let a client script request its own capture with `exports.spawnbase:takeImage(metadata, options)`, set `SPAWNBASE_CLIENT_CAPTURE` to `1` and grant the `spawnbase.capture` ACE.

## Uploads

```lua
local result = exports.spawnbase:uploadImage(base64, { fileName = 'evidence.png' })
print(result.data.id)
```

`uploadFile` is the same call under another name. `requestPresignedUrl(kind)` returns an upload link for `image`, `audio` or `video`.

## Settings

| Convar                     | Meaning                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `SPAWNBASE_LOGS_API_KEY`   | Key for logs. Without it nothing is sent.                              |
| `SPAWNBASE_MEDIA_API_KEY`  | Key for uploads and screenshots.                                       |
| `SPAWNBASE_SERVER_ID`      | Optional server name: up to 128 letters, digits, `.`, `_`, `:` or `-`. |
| `SPAWNBASE_API_URL`        | Optional API origin. Defaults to `https://api.spawnbase.io`.           |
| `SPAWNBASE_CLIENT_CAPTURE` | Set to `1` to let client scripts request a capture.                    |

Everything else is in `spawnbase/config.json`: log level, batch size, screenshot format and size, and the optional join, leave and chat events.

Player identifiers are not attached unless you set `logs.appendPlayerIdentifiers`. To add the ESX `identifier` or the QBCore and Qbox `citizenid`, also set `logs.excludeInDepthMetadata` to `false`. IP addresses stay out unless you remove `ip` from `logs.excludedPlayerIdentifiers`.

Restart `spawnbase` after changing keys or `config.json`.

## Moving from fmsdk

The ZIP also contains `sb-bridge`. Start it after `spawnbase` and scripts that call `exports.fmsdk` keep working without changes. It covers the log exports, `takeServerImage`, `takeImage`, `uploadImage`, `uploadFile` and `requestPresignedUrl`.

## Node.js

```ts
import { create } from "@spawnbase/sdk";

const sdk = create({ logsKey: "sb_logs_key", mediaKey: "sb_media_key" });
sdk.logs.info("economy", "Purchase", { item: "water" });
await sdk.logs.close();
```

`@spawnbase/sdk/community` and `@spawnbase/sdk/discord` are clients for the Community and Discord APIs. The package is not on npm yet, so build it here with `npm ci` and `npm run build` and depend on the folder.

## Building

```text
npm ci
npm run pack
```

This writes `dist/spawnbase-<version>.zip` and its SHA-256.

## License

GPL-3.0-only. See `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES`.
