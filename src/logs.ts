// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { diagnostic } from "./diagnostic.js";
import { Http, HttpError } from "./http.js";
import { paths, type Event, type Level, type LogMeta } from "./types.js";

const levels: Level[] = ["error", "warn", "info", "debug"];
type Item = { dataset: string; json: string; bytes: number; at: number };

export function trace(ms: number): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = Math.max(0, Math.floor(ms));
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class Logs {
  private queue: Item[] = [];
  private active: Promise<void> | null = null;
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private stopped = false;
  private count = 0;
  private bytes = 0;
  private sent = 0;
  private dropped = 0;
  private queued = 0;
  private queuedBytes = 0;
  private requests = 0;
  private requestBytes = 0;
  private retries = 0;
  private failed = 0;
  private filtered = 0;
  private rejected = 0;
  private lastError: string | null = null;
  private sessionId = crypto.randomUUID();
  private floor: Level = "info";
  private dataset: string | null = null;
  private size = 100;
  private flushMs = 2000;
  private maxBytes = 96 * 1024;
  cloud = true;
  echo = false;
  enrich: ((meta: LogMeta) => LogMeta) | null = null;
  constructor(
    private http: Http,
    private resource = "spawnbase",
    private path = paths("v1").logs,
    private serverId?: string,
  ) {
    if (serverId !== undefined && !/^[a-zA-Z0-9_.:-]{1,128}$/.test(serverId))
      throw new Error("invalid_server_id");
  }

  tune(opts: {
    levels?: Level[];
    level?: Level;
    size?: number;
    flushMs?: number;
    bytes?: number;
    cloud?: boolean;
    echo?: boolean;
  }): void {
    if (opts.levels && JSON.stringify(opts.levels) !== JSON.stringify(levels))
      throw new Error("invalid_levels");
    if (opts.level && !levels.includes(opts.level)) throw new Error("invalid_level");
    for (const [value, min, max] of [
      [opts.size, 1, 1000],
      [opts.flushMs, 1, 30000],
      [opts.bytes, 256, 96 * 1024],
    ]) {
      if (value !== undefined && (!Number.isInteger(value) || value < min! || value > max!))
        throw new Error("invalid_batch");
    }
    if (opts.level) this.floor = opts.level;
    if (opts.size !== undefined) this.size = opts.size;
    if (opts.flushMs !== undefined) this.flushMs = opts.flushMs;
    if (opts.bytes !== undefined) this.maxBytes = opts.bytes;
    if (opts.cloud !== undefined) this.cloud = opts.cloud;
    if (opts.echo !== undefined) this.echo = opts.echo;
  }
  log(
    dataset: string,
    level: Level,
    message: string,
    metadata: LogMeta = {},
    resource = this.resource,
  ): boolean {
    return this.record(dataset, level, message, metadata, resource) !== null;
  }
  record(
    dataset: string,
    level: Level,
    message: string,
    metadata: LogMeta = {},
    resource = this.resource,
  ): { traceId: string; timestamp: string } | null {
    if (this.closed || !levels.includes(level)) return this.drop();
    if (!this.cloud || levels.indexOf(level) > levels.indexOf(this.floor)) {
      this.filtered++;
      return null;
    }
    try {
      const at = Date.now();
      if (
        !/^[a-z0-9_-]{1,64}$/.test(dataset) ||
        typeof message !== "string" ||
        !message.trim() ||
        message.length > 16384 ||
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata) ||
        typeof resource !== "string" ||
        resource.length < 1 ||
        resource.length > 128
      )
        return this.drop();
      const meta = this.enrich ? this.enrich({ ...metadata }) : metadata;
      const encoded = JSON.stringify(meta);
      if (Buffer.byteLength(encoded) > 32768) return this.drop();
      const snapshot: unknown = JSON.parse(encoded);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return this.drop();
      if (
        "correlationId" in snapshot &&
        (typeof snapshot.correlationId !== "string" || snapshot.correlationId.length > 128)
      )
        return this.drop();
      const event: Event = {
        eventId: trace(at),
        occurredAt: new Date(at).toISOString(),
        sessionId: this.sessionId,
        serverId: this.serverId,
        sequence: this.queued + 1,
      };
      const enriched = { ...snapshot, _spawnbase: event };
      if (Buffer.byteLength(JSON.stringify(enriched)) > 32768) return this.drop();
      const json = JSON.stringify({
        level,
        message,
        metadata: enriched,
        resource,
        traceId: event.eventId,
        timestamp: event.occurredAt,
      });
      const bytes = Buffer.byteLength(json) + 1;
      if (
        bytes + 1 > this.maxBytes ||
        this.count >= 2000 ||
        this.bytes + bytes > 2 * 1024 * 1024 ||
        (!this.queue.some((i) => i.dataset === dataset) &&
          this.dataset !== dataset &&
          new Set([...this.queue.map((i) => i.dataset), ...(this.dataset ? [this.dataset] : [])]).size >= 16)
      )
        return this.drop();
      this.queue.push({ dataset, json, bytes, at });
      this.count++;
      this.bytes += bytes;
      this.queued++;
      this.queuedBytes += bytes - 1;
      if (this.echo) diagnostic("log_queued");
      if (this.queue.length >= this.size || this.bytes >= this.maxBytes) void this.flush();
      else if (!this.timer) {
        this.timer = setTimeout(() => void this.flush(), this.flushMs);
        this.timer.unref?.();
      }
      return { traceId: event.eventId, timestamp: event.occurredAt };
    } catch {
      return this.drop();
    }
  }
  private drop(): null {
    this.dropped++;
    this.rejected++;
    return null;
  }
  info(dataset: string, message: string, metadata?: LogMeta): boolean {
    return this.log(dataset, "info", message, metadata);
  }
  warn(dataset: string, message: string, metadata?: LogMeta): boolean {
    return this.log(dataset, "warn", message, metadata);
  }
  error(dataset: string, message: string, metadata?: LogMeta): boolean {
    return this.log(dataset, "error", message, metadata);
  }
  debug(dataset: string, message: string, metadata?: LogMeta): boolean {
    return this.log(dataset, "debug", message, metadata);
  }
  status() {
    return {
      pending: this.count,
      bytes: this.bytes,
      sent: this.sent,
      dropped: this.dropped,
      queued: this.queued,
      queuedBytes: this.queuedBytes,
      requests: this.requests,
      requestBytes: this.requestBytes,
      retries: this.retries,
      failed: this.failed,
      filtered: this.filtered,
      rejected: this.rejected,
      closed: this.closed,
      lastError: this.lastError,
    };
  }
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.active) return this.active;
    if (!this.queue.length) return Promise.resolve();
    this.active = this.drain().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  private async drain(): Promise<void> {
    while (this.queue.length && !this.stopped) {
      const batch: Item[] = [];
      const dataset = this.queue[0]!.dataset;
      this.dataset = dataset;
      let bytes = 2;
      for (let i = 0; i < this.queue.length && batch.length < this.size;) {
        const item = this.queue[i]!;
        if (item.dataset !== dataset) {
          i++;
          continue;
        }
        if (bytes + item.bytes > this.maxBytes) break;
        this.queue.splice(i, 1);
        batch.push(item);
        bytes += item.bytes;
      }
      if (!batch.length) {
        const item = this.queue.shift()!;
        this.count--;
        this.bytes -= item.bytes;
        this.dropped++;
        this.failed++;
        continue;
      }
      const body = `[${batch.map((i) => i.json).join(",")}]`;
      let delivered = false;
      for (let attempt = 0; attempt < 3 && !this.stopped && Date.now() - batch[0]!.at < 30000; attempt++) {
        try {
          this.requests++;
          this.requestBytes += Buffer.byteLength(body);
          if (attempt) this.retries++;
          const response = await this.http.post<{ status?: unknown } | null>(
            this.path,
            body,
            false,
            { "X-Spawnbase-Dataset": dataset },
            this.controller.signal,
          );
          if (!response || response.status !== "ok") throw new HttpError("invalid_ack");
          delivered = true;
          break;
        } catch (err) {
          this.lastError = err instanceof HttpError ? err.code : "delivery_failed";
          if (!(err instanceof HttpError) || !err.retryable || attempt === 2) break;
          const delay = Math.max(err.retryAfter, Math.floor(Math.random() * 500 * 2 ** attempt));
          if (Date.now() + delay - batch[0]!.at >= 30000) break;
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              this.controller.signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, delay);
            this.controller.signal.addEventListener("abort", finish, { once: true });
            if (this.controller.signal.aborted) finish();
          });
        }
      }
      if (delivered) {
        this.sent += batch.length;
        this.lastError = null;
      } else {
        this.dropped += batch.length;
        this.failed += batch.length;
        diagnostic("logs_dropped", batch.length);
      }
      this.count -= batch.length;
      this.bytes -= batch.reduce((n, i) => n + i.bytes, 0);
      this.dataset = null;
    }
  }
  async close(timeoutMs = 3000): Promise<void> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
      throw new Error("invalid_timeout");
    this.closed = true;
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([
      this.flush(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer!);
    if (this.count) {
      this.stopped = true;
      this.controller.abort();
      for (const item of this.queue) {
        this.count--;
        this.bytes -= item.bytes;
        this.dropped++;
        this.failed++;
      }
      this.queue = [];
      await this.active;
    }
  }
}
