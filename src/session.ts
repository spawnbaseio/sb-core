// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { diagnostic } from "./diagnostic.js";
import { z } from "zod";
import { Http, HttpError } from "./http.js";
import { base, paths } from "./types.js";

const BEAT_MIN = 30_000;
const BEAT_MAX = 300_000;
const RETRY = 60_000;
const RETRY_MAX = 900_000;
const ENDPOINT_MAX = 255;
const RESOURCE_MAX = 128;

const reply = z.object({
  message: z.string().optional(),
  token: z.string().optional(),
  sessionToken: z.string().optional(),
  beatIn: z.number().optional().catch(undefined),
});

function cap(text: string, limit: number): string {
  let kept = "";
  for (const character of text) {
    if (kept.length + character.length > limit) break;
    kept += character;
  }
  return kept;
}

function hasStatus(error: unknown, ...codes: number[]): error is HttpError {
  return error instanceof HttpError && codes.includes(error.status);
}

function refused(error: unknown): boolean {
  return hasStatus(error, 401, 403) && ["unauthorized", "forbidden"].includes(error.code);
}

export class Session {
  private p = paths("v1");
  private token: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private opening: Promise<void> | null = null;
  private closed = false;
  private reported = false;
  private booted = false;
  private failures = 0;
  private retryAfter = 0;
  private interval = BEAT_MAX;
  private endpoint: string;
  private resource: string;
  constructor(
    private root: string,
    private key: string,
    endpoint: string,
    resource = "spawnbase",
  ) {
    this.endpoint = cap(endpoint, ENDPOINT_MAX);
    this.resource = cap(resource, RESOURCE_MAX);
  }
  private http(): Http {
    return new Http(this.root || base, this.token ?? this.key);
  }
  open(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("session_closed"));
    if (this.opening) return this.opening;
    if (this.reported) return Promise.resolve();
    this.opening = this.http()
      .post(this.p.report, {
        sdkType: "fivem",
        endpoint: this.endpoint,
        resourceName: this.resource,
        ...(this.booted ? {} : { boot: true }),
      })
      .then(async (raw) => {
        const out = reply.parse(raw);
        this.reported = true;
        this.booted = true;
        this.token = out.token ?? out.sessionToken ?? null;
        this.pace(out.beatIn);
        this.failures = 0;
        if (!this.closed && !this.timer) this.arm();
      })
      .catch((error: unknown) => {
        if (refused(error)) this.closed = true;
        this.fail(error);
        if (!this.closed && !this.timer) this.arm();
        throw error;
      })
      .finally(() => {
        this.opening = null;
      });
    return this.opening;
  }
  private arm(): void {
    this.timer = setTimeout(
      () => {
        this.timer = null;
        const event = this.reported ? "heartbeat_failed" : "session_failed";
        void this.renew()
          .catch(() => diagnostic(event))
          .finally(() => {
            if (!this.closed && !this.timer) this.arm();
          });
      },
      this.failures ? this.backoff() : Math.max(BEAT_MIN, this.interval * (1 - Math.random() * 0.1)),
    );
    this.timer.unref?.();
  }
  private fail(error: unknown): void {
    this.failures++;
    this.retryAfter = error instanceof HttpError ? error.retryAfter : 0;
  }
  private pace(beatIn: number | undefined): void {
    this.interval = Math.min(BEAT_MAX, Math.max(BEAT_MIN, beatIn ?? BEAT_MAX));
  }
  private backoff(): number {
    const ceiling = this.reported ? this.interval : RETRY_MAX;
    const wait = Math.max(
      Math.min(this.retryAfter, ceiling),
      Math.min(BEAT_MAX, RETRY * 2 ** (this.failures - 1)),
    );
    const jittered = wait * (1 + Math.random() * 0.2);
    return jittered <= ceiling ? jittered : ceiling * (1 - Math.random() * 0.1);
  }
  private async renew(): Promise<void> {
    if (!this.reported) return this.open();
    try {
      await this.beat();
      this.failures = 0;
    } catch (error) {
      if (this.closed) return;
      if (hasStatus(error, 401, 403, 404)) return this.reopen();
      this.fail(error);
      throw error;
    }
  }
  private reopen(): Promise<void> {
    this.reported = false;
    this.token = null;
    return this.open();
  }
  async beat(): Promise<void> {
    if (this.closed) throw new Error("session_closed");
    const out = reply.parse(await this.http().post(this.p.beat));
    if (out.beatIn !== undefined) this.pace(out.beatIn);
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.opening?.catch(() => {});
    if (this.reported)
      await this.http()
        .post(this.p.kill, { endpoint: this.endpoint, resourceName: this.resource })
        .catch((error: unknown) => {
          if (!hasStatus(error, 401, 403)) throw error;
        });
    this.token = null;
  }
}
