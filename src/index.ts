// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { Http } from "./http.js";
import { Logs } from "./logs.js";
import { Media } from "./media.js";
import { Session } from "./session.js";
import { base, paths, type Opts } from "./types.js";

export * from "./types.js";
export { parse, defaults, type Config } from "./config.js";
export { HttpError } from "./http.js";

/**
 * Creates a client for media, logs and sessions that share one API origin.
 * Keys belong on a server. Use {@link Media.presign} for uploads from a game client.
 * `session` is `null` when no key is set.
 *
 * @example
 * const sdk = create({ mediaKey: "sb_media_key", logsKey: "sb_logs_key" });
 * const file = await sdk.media.upload(bytes, { fileName: "a.jpg" });
 * sdk.logs.info("economy", "Purchase", { playerSource: 1 });
 * await sdk.logs.close();
 */
export function create(opts: Opts = {}) {
  const root = opts.apiUrl ?? base;
  const p = paths(opts.version ?? "v1");
  const media = new Media(new Http(root, opts.mediaKey), p);
  const logs = new Logs(new Http(root, opts.logsKey), opts.resource, p.logs, opts.serverId);
  const key = opts.mediaKey || opts.logsKey;
  const session = key ? (endpoint: string) => new Session(root, key, endpoint, opts.resource) : null;
  return { media, logs, session };
}
