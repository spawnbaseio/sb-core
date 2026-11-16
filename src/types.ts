// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

/** Log levels the SDK emits. The logging API also accepts `fatal` from other clients. */
export type Level = "error" | "warn" | "info" | "debug";

/** Media kinds a presigned URL can be minted for. */
export type Kind = "image" | "audio" | "video";

/** Free-form metadata attached to uploads and log entries. */
export type Meta = Record<string, unknown>;

export interface Player {
  license?: string;
  license2?: string;
  discord?: string;
  steam?: string;
  fivem?: string;
  live?: string;
  xbl?: string;
  ip?: string;
  citizenid?: string;
  identifier?: string;
}

export interface LogMeta extends Meta {
  correlationId?: string;
  playerSource?: number | string;
  targetSource?: number | string;
  _playerIdentifiers?: Player;
  _targetIdentifiers?: Player;
}

export interface Event {
  eventId: string;
  occurredAt: string;
  sessionId: string;
  serverId?: string;
  sequence: number;
}

/** Options for {@link create}. */
export interface Opts {
  /** API base URL. Defaults to the Spawnbase API origin. */
  apiUrl?: string;
  /** Media API token (server-side only). */
  mediaKey?: string;
  /** Logs API token (server-side only). */
  logsKey?: string;
  /** Resource name sent with log entries. */
  resource?: string;
  serverId?: string;
  /** Only the v1 API is supported. */
  version?: "v1";
}

/** A stored file, as returned by the media API. */
export interface File {
  visibility?: "private" | "public";
  contentUrl?: string;
  id: string;
  url: string;
  originalUrl?: string;
}

/** Upload options shared by direct and presigned uploads. */
export interface Up {
  visibility?: "private" | "public";
  metadata?: Meta;
  fileName?: string;
  type?: Kind;
  path?: string;
}

/** One log entry on the wire. The dataset travels in a header. */
export interface Entry {
  level: Level;
  message: string;
  metadata: Meta;
  resource: string;
  timestamp?: string;
  /** Client-supplied id; the API dedupes on (team, traceId), which is
   * what makes SDK retries safe. Server generates one when absent. */
  traceId?: string;
}

/** Supported API paths. SDK sessions are optional bookkeeping only. */
export const paths = (v: string = "v1") => {
  if (v !== "v1") throw new Error("unsupported_version");
  return {
    file: `/api/${v}/file`,
    base64: `/api/${v}/file/base64`,
    presign: `/api/${v}/file/presigned-url`,
    logs: `/api/${v}/logs`,
    report: "/api/sdk/report",
    beat: "/api/sdk/heartbeat",
    kill: "/api/sdk/invalidate",
  };
};

/** The path set produced by {@link paths}. */
export type Paths = ReturnType<typeof paths>;

/** Default API origin. Override it with {@link Opts.apiUrl}. */
export const base = "https://api.spawnbase.io";
