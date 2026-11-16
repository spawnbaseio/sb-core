// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { create, parse } from "./index.js";
import { diagnostic } from "./diagnostic.js";
import { fileBytes, metadata } from "./media.js";
import { HttpError, origin } from "./http.js";
import { z } from "zod";
import type { File, Level, Meta, Player, Up } from "./types.js";

interface Fx {
  exports: ((name: string, fn: (...args: never[]) => unknown) => void) &
    Record<string, Record<string, (...args: never[]) => unknown>>;
  on: (name: string, fn: (...args: never[]) => void) => void;
  onNet: (name: string, fn: (...args: never[]) => void) => void;
  emitNet: (name: string, target: number, ...args: unknown[]) => void;
  GetConvar: (name: string, fallback: string) => string;
  GetCurrentResourceName: () => string;
  GetInvokingResource: () => string | null;
  LoadResourceFile: (resource: string, file: string) => string | null;
  GetPlayerIdentifierByType: (source: string, type: string) => string | null;
  GetResourceState: (name: string) => string;
  GetPlayerName: (source: number) => string | null;
  IsPlayerAceAllowed: (source: string, permission: string) => boolean;
  RegisterCommand: (name: string, fn: (source: number, args: string[]) => void, restricted: boolean) => void;
  source: number;
}
const fx = globalThis as unknown as Fx;
const self = fx.GetCurrentResourceName();
const convar = (name: string) => fx.GetConvar(`SPAWNBASE_${name}`, "");
const serverId = z
  .string()
  .max(128)
  .regex(/^[a-zA-Z0-9_.:-]*$/)
  .parse(convar("SERVER_ID"));
const apiUrl = origin(convar("API_URL") || "https://api.spawnbase.io");
const appUrl = origin(convar("APP_URL") || "https://app.spawnbase.io");
// Cfx serializes an empty Lua table as an empty array.
const table = <T>(value: T): T => (Array.isArray(value) && value.length === 0 ? {} : value) as T;
const cfg = parse(JSON.parse(fx.LoadResourceFile(self, "config.json") ?? "{}") as unknown);
const sdk = create({
  apiUrl,
  mediaKey: convar("MEDIA_API_KEY"),
  logsKey: convar("LOGS_API_KEY"),
  resource: self,
  serverId: convar("SERVER_ID") || undefined,
});
sdk.logs.tune({
  level: cfg.logs.level,
  size: cfg.logs.batch.size,
  flushMs: cfg.logs.batch.flushMs,
  bytes: cfg.logs.batch.bytes,
  cloud: cfg.logs.enableCloudLogging && !!convar("LOGS_API_KEY"),
  echo: cfg.logs.console,
});

function serverName() {
  const name = convar("SERVER_ID") || fx.GetConvar("sv_projectName", "") || fx.GetConvar("sv_hostname", "");
  return name.replace(/\^[0-9*_~=rn]/g, "").trim() || self;
}
const session = sdk.session?.(serverName()) ?? null;
void session?.open().catch(() => diagnostic("session_failed"));

function identity(src: number): Player {
  const out: Player = {};
  for (const type of ["license", "license2", "discord", "steam", "fivem", "live", "xbl", "ip"] as const) {
    if (cfg.logs.excludedPlayerIdentifiers.includes(type)) continue;
    const value = fx.GetPlayerIdentifierByType(String(src), type);
    if (value) out[type] = value.slice(value.indexOf(":") + 1);
  }
  try {
    if (cfg.logs.excludeInDepthMetadata) return out;
    if (fx.GetResourceState("qbx_core") === "started") {
      const get = fx.exports["qbx_core"]?.GetPlayer as
        ((id: number) => { PlayerData?: { citizenid?: string } } | undefined) | undefined;
      const player = get?.(src);
      if (typeof player?.PlayerData?.citizenid === "string") out.citizenid = player.PlayerData.citizenid;
    } else if (fx.GetResourceState("qb-core") === "started") {
      const core = fx.exports["qb-core"]?.GetCoreObject?.() as
        | { Functions?: { GetPlayer(id: number): { PlayerData?: { citizenid?: string } } | undefined } }
        | undefined;
      const player = core?.Functions?.GetPlayer?.(src);
      if (typeof player?.PlayerData?.citizenid === "string") out.citizenid = player.PlayerData.citizenid;
    } else if (fx.GetResourceState("es_extended") === "started") {
      const core = fx.exports["es_extended"]?.getSharedObject?.() as
        { GetPlayerFromId(id: number): { identifier?: string } | undefined } | undefined;
      const player = core?.GetPlayerFromId?.(src);
      if (typeof player?.identifier === "string") out.identifier = player.identifier;
    }
  } catch {
    if (!enrichmentWarned) diagnostic("enrichment_failed");
    enrichmentWarned = true;
  }
  return out;
}
let enrichmentWarned = false;
sdk.logs.enrich = (meta) => {
  const out: Meta = { ...meta, ...(serverId ? { serverId } : {}) };
  if (!cfg.logs.appendPlayerIdentifiers) return out;
  try {
    for (const [key, field] of [
      ["playerSource", "_playerIdentifiers"],
      ["targetSource", "_targetIdentifiers"],
    ] as const) {
      const src = Number(meta[key]);
      if (Number.isInteger(src) && src > 0) out[field] = identity(src);
    }
    return out;
  } catch {
    if (!enrichmentWarned) diagnostic("enrichment_failed");
    enrichmentWarned = true;
    return out;
  }
};

type Wait = {
  src: number;
  url?: string;
  signal: AbortSignal;
  verifying: boolean;
  finish: (file?: File) => void;
};
const waits = new Map<string, Wait>();
const cooldown = new Map<number, number>();
const connections = new Map<number, object>();
let stopped = false;
const captureOptions = z
  .object({
    filename: z.string().max(255).optional(),
    path: z.string().max(255).optional(),
    retentionExempt: z.literal(false).optional(),
  })
  .strict();

function named(filename?: string) {
  return filename ? `${filename.replace(/\.(png|jpe?g|webp)$/i, "")}.${cfg.logs.capture.encoding}` : undefined;
}

function take(
  src: number,
  meta: Meta = {},
  timeout = cfg.logs.capture.timeoutMs,
  options: unknown = {},
): Promise<File | null> {
  const upload = captureOptions.parse(table(options) ?? {});
  if (
    stopped ||
    !Number.isInteger(src) ||
    src < 1 ||
    !fx.GetPlayerName(src) ||
    fx.GetResourceState("sb-screenshot") !== "started" ||
    waits.size >= 4 ||
    [...waits.values()].some((w) => w.src === src) ||
    !Number.isInteger(timeout) ||
    timeout < 1000 ||
    timeout > 30000
  )
    return Promise.resolve(null);
  const id = crypto.randomUUID();
  const deadline = Date.now() + timeout;
  const controller = new AbortController();
  const trusted = {
    ...metadata(table(meta), 4096),
    ...(serverId ? { serverId } : {}),
    playerSource: src,
    captureId: id,
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => wait.finish(), timeout);
    const wait: Wait = {
      src,
      signal: controller.signal,
      verifying: false,
      finish: (file) => {
        if (waits.get(id) !== wait) return;
        clearTimeout(timer);
        waits.delete(id);
        controller.abort();
        if (wait.url && !file) fx.emitNet("spawnbase:cancel", src, id);
        resolve(file ?? null);
      },
    };
    waits.set(id, wait);
    void sdk.media
      .presign(
        "image",
        Math.ceil(deadline / 1000),
        {
          visibility: cfg.media.visibility,
          metadata: trusted,
          maxBytes: fileBytes,
          filename: named(upload.filename),
          path: upload.path,
        },
        controller.signal,
      )
      .then((url) => {
        if (waits.get(id) !== wait) return;
        wait.url = url;
        fx.emitNet("spawnbase:capture", src, id, url, {
          ...cfg.logs.capture,
          timeoutMs: Math.max(1, deadline - Date.now()),
          maxBytes: fileBytes,
        });
      })
      .catch(() => {
        diagnostic("capture_presign_failed");
        wait.finish();
      });
  });
}

fx.onNet("spawnbase:done", (id: unknown, success: unknown) => {
  if (typeof id !== "string") return;
  const wait = waits.get(id);
  if (!wait || wait.src !== Number(fx.source) || wait.verifying || !wait.url) return;
  if (success !== true) {
    wait.finish();
    return;
  }
  wait.verifying = true;
  void sdk.media
    .result(wait.url, wait.signal)
    .then((file) => wait.finish(file))
    .catch(() => wait.finish());
});

fx.onNet("spawnbase:want", (request: unknown, meta: unknown, options: unknown) => {
  const src = Number(fx.source);
  if (
    typeof request !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(request) ||
    !Number.isInteger(src) ||
    src < 1 ||
    !fx.GetPlayerName(src)
  )
    return;
  if (
    convar("CLIENT_CAPTURE") !== "1" ||
    !fx.IsPlayerAceAllowed(String(src), "spawnbase.capture") ||
    (cooldown.get(src) ?? 0) > Date.now()
  ) {
    fx.emitNet("spawnbase:give", src, request, null);
    return;
  }
  cooldown.set(src, Date.now() + 10000);
  let connection = connections.get(src);
  if (!connection) {
    connection = {};
    connections.set(src, connection);
  }
  const give = (file: File | null) => {
    if (connections.get(src) === connection && !stopped && fx.GetPlayerName(src))
      fx.emitNet("spawnbase:give", src, request, file);
  };
  try {
    void take(src, metadata(table(meta) ?? {}, 4096), cfg.logs.capture.timeoutMs, options)
      .then(give)
      .catch(() => give(null));
  } catch {
    give(null);
  }
});
fx.on("playerDropped", () => {
  const src = Number(fx.source);
  cooldown.delete(src);
  connections.delete(src);
  for (const wait of waits.values()) if (wait.src === src) wait.finish();
});

const api = {
  takeServerImage: async (src: number | string, meta?: Meta, options?: unknown, timeout?: number) => {
    const file = await take(Number(src), meta ?? {}, timeout ?? cfg.logs.capture.timeoutMs, options);
    if (!file) throw new HttpError("capture_failed");
    return { status: "ok", data: file };
  },
  uploadImage: async (data: string | Uint8Array | ArrayBuffer, opts: Up = {}) => {
    if (opts && "retentionExempt" in opts && opts.retentionExempt !== false)
      throw new HttpError("unsupported_options");
    const options = { visibility: cfg.media.visibility, ...(opts ?? {}) };
    if (options.metadata) options.metadata = table(options.metadata);
    const file = await (typeof data === "string"
      ? sdk.media.upload64(data, options)
      : sdk.media.upload(data instanceof ArrayBuffer ? new Uint8Array(data) : data, options));
    return { status: "ok", data: file };
  },
  uploadFile: async (data: string | Uint8Array | ArrayBuffer, opts: Up = {}) => api.uploadImage(data, opts),
  requestPresignedUrl: (kind: "image" | "audio" | "video", opts: Pick<Up, "visibility"> = {}) =>
    sdk.media.presign(kind, undefined, { visibility: opts?.visibility ?? cfg.media.visibility }),
  flush: async () => {
    await sdk.logs.flush();
    return sdk.logs.status();
  },
  close: async (timeout?: number) => {
    await sdk.logs.close(timeout);
    return sdk.logs.status();
  },
};
for (const [name, fn] of Object.entries(api))
  fx.exports(name, async (...args: never[]) => {
    try {
      return await (fn as (...values: never[]) => Promise<unknown>)(...args);
    } catch (err) {
      diagnostic("file_failed");
      throw new Error(err instanceof HttpError ? err.code : "operation_failed");
    }
  });
const levels: Level[] = ["error", "warn", "info", "debug"];
function log(
  dataset: string,
  level: Level,
  message: string,
  meta?: Meta,
  internal?: { _internal_RESOURCE?: string },
) {
  const resource =
    typeof internal?._internal_RESOURCE === "string"
      ? internal._internal_RESOURCE
      : fx.GetInvokingResource() || self;
  return sdk.logs.log(dataset, level, message, table(meta) ?? undefined, resource);
}
fx.exports("Log", log);
fx.exports("Record", (dataset: string, level: Level, message: string, meta?: Meta) =>
  sdk.logs.record(dataset, level, message, table(meta), fx.GetInvokingResource() || self),
);
for (const level of levels)
  fx.exports(level[0]!.toUpperCase() + level.slice(1), (dataset: string, message: string, meta?: Meta) =>
    log(dataset, level, message, meta),
  );
fx.exports("LogMessage", (level: Level, message: string, meta?: Meta) =>
  log("default", level, message, meta),
);
fx.exports("status", () => sdk.logs.status());
let checking = false;
fx.RegisterCommand(
  "spawnbase_check",
  (source, args) => {
    if (source !== 0 || checking || stopped) return;
    checking = true;
    const check = create({
      apiUrl,
      logsKey: convar("LOGS_API_KEY"),
      mediaKey: convar("MEDIA_API_KEY"),
      resource: self,
    });
    check.logs.enrich = sdk.logs.enrich;
    void (async () => {
      if (!convar("LOGS_API_KEY") || !cfg.logs.enableCloudLogging) {
        console.log(
          JSON.stringify({
            check: "logs",
            state: "disabled",
            reason: "Set SPAWNBASE_LOGS_API_KEY and enable cloud logging",
          }),
        );
      } else {
        const reference = check.logs.record("default", "info", "Spawnbase connection check", {
          event: "setup.check",
        });
        await check.logs.close();
        const status = check.logs.status();
        console.log(
          JSON.stringify({
            check: "logs",
            state: status.sent === 1 ? "accepted" : "failed",
            code: status.lastError,
            ...reference,
            ...(reference ? { dashboard: `${appUrl}/logs/${encodeURIComponent(reference.traceId)}` } : {}),
            next: "Open the dashboard link to confirm the event is searchable",
          }),
        );
      }
      if (args[0] === "media") {
        if (!convar("MEDIA_API_KEY")) {
          console.log(
            JSON.stringify({ check: "media", state: "disabled", reason: "Set SPAWNBASE_MEDIA_API_KEY" }),
          );
          return;
        }
        try {
          const file = await check.media.upload64(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            {
              fileName: "connection-check.png",
              visibility: "private",
              metadata: { event: "setup.check", ...(serverId ? { serverId } : {}) },
            },
          );
          console.log(
            JSON.stringify({
              check: "media",
              state: "stored",
              fileId: file.id,
              dashboard: `${appUrl}/storage/${encodeURIComponent(file.id)}`,
            }),
          );
        } catch (error) {
          console.log(
            JSON.stringify({
              check: "media",
              state: "failed",
              code: error instanceof HttpError ? error.code : "upload_failed",
            }),
          );
        }
      }
    })()
      .finally(() => {
        checking = false;
      })
      .catch(() => diagnostic("file_failed"));
  },
  true,
);
if (cfg.logs.playerEvents.enabled) {
  fx.on("playerConnecting", () =>
    sdk.logs.info(cfg.logs.playerEvents.dataset, "Player connecting", { playerSource: Number(fx.source) }),
  );
  fx.on("playerDropped", () =>
    sdk.logs.info(cfg.logs.playerEvents.dataset, "Player disconnected", { playerSource: Number(fx.source) }),
  );
}
if (cfg.logs.chatEvents.enabled)
  fx.on("chatMessage", (src: number, _author: string, text: string) =>
    sdk.logs.info(cfg.logs.chatEvents.dataset, text, { playerSource: src }),
  );
fx.on("onResourceStop", (name: string) => {
  if (name === "sb-screenshot") {
    for (const wait of waits.values()) wait.finish();
    return;
  }
  if (name !== self) return;
  stopped = true;
  for (const wait of waits.values()) wait.finish();
  cooldown.clear();
  connections.clear();
  void sdk.logs.close().catch(() => diagnostic("flush_failed"));
  void session?.close().catch(() => diagnostic("session_close_failed"));
});
