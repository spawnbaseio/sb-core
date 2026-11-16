// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { z } from "zod";
import { Http, HttpError, form } from "./http.js";
import { paths, type File, type Kind, type Meta, type Paths, type Up } from "./types.js";

export const directBytes = 10 * 1024 * 1024;
export const fileBytes = directBytes - 1024 * 1024;

const fileReply = z.object({
  status: z.literal("ok"),
  data: z.object({
    id: z.string().min(1),
    url: z.string().url(),
    originalUrl: z.string().url().optional(),
    contentUrl: z.string().url().optional(),
    visibility: z.enum(["private", "public"]).optional(),
  }),
});
const bindSchema = z.object({
  visibility: z.enum(["private", "public"]).default("private"),
  filename: z.string().max(255).optional(),
  path: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  maxBytes: z.number().int().min(1).max(fileBytes).default(fileBytes),
});
const options = z.object({
  visibility: z.enum(["private", "public"]).default("private"),
  fileName: z.string().max(255).optional(),
  path: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function metadata(value: unknown, max = 32768): Meta {
  const parsed = z.record(z.string(), z.unknown()).parse(value);
  const json = JSON.stringify(parsed);
  if (Buffer.byteLength(json) > max) throw new HttpError("metadata_too_large");
  return JSON.parse(json) as Meta;
}

export class Media {
  private active = 0;
  constructor(
    private http: Http,
    private p: Paths = paths("v1"),
  ) {}
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= 4) throw new HttpError("media_busy");
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
    }
  }
  async upload(data: Buffer | Uint8Array | string, opts: Up = {}): Promise<File> {
    const size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    if (!size || size > fileBytes) throw new HttpError("file_too_large");
    const valid = options.parse(opts);
    if (valid.metadata) valid.metadata = metadata(valid.metadata);
    return this.run(async () => fileReply.parse(await this.http.post(this.p.file, form(data, valid))).data);
  }
  async upload64(input: string, opts: Up = {}): Promise<File> {
    if (typeof input !== "string" || input.length > directBytes) throw new HttpError("file_too_large");
    const b64 = input.replace(/^data:[^,]*;base64,/, "");
    if (!b64.length || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64))
      throw new HttpError("invalid_base64");
    const valid = options.parse(opts);
    if (valid.metadata) valid.metadata = metadata(valid.metadata);
    const body = {
      base64: b64,
      filename: valid.fileName,
      path: valid.path,
      visibility: valid.visibility,
      metadata: valid.metadata ? JSON.stringify(valid.metadata) : undefined,
    };
    if (Buffer.byteLength(JSON.stringify(body)) > directBytes) throw new HttpError("file_too_large");
    return this.run(async () => fileReply.parse(await this.http.post(this.p.base64, body)).data);
  }
  async presign(
    type: Kind,
    expiresAt?: number,
    bind?: {
      visibility?: "private" | "public";
      filename?: string;
      path?: string;
      metadata?: Meta;
      maxBytes?: number;
    },
    signal?: AbortSignal,
  ): Promise<string> {
    const kind = z.enum(["image", "audio", "video"]).parse(type);
    const valid = bindSchema.parse(bind ?? {});
    if (valid.metadata) valid.metadata = metadata(valid.metadata);
    if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() / 1000))
      throw new HttpError("invalid_expiry");
    return this.run(async () => {
      const reply = z
        .object({ status: z.literal("ok"), data: z.object({ presignedUrl: z.string().url() }) })
        .parse(await this.http.post(this.p.presign, { expiresAt, kind, ...valid }, false, {}, signal));
      return reply.data.presignedUrl;
    });
  }
  async send(url: string, data: Buffer | Uint8Array | string, opts: Up = {}): Promise<File> {
    const size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    if (!size || size > fileBytes) throw new HttpError("file_too_large");
    const valid = options.parse(opts);
    if (valid.metadata) valid.metadata = metadata(valid.metadata);
    return this.run(async () => fileReply.parse(await this.http.push(url, form(data, valid))).data);
  }
  async result(url: string, signal?: AbortSignal): Promise<File> {
    // A completed grant returns its existing file before parsing the body.
    // An incomplete grant fails closed; never trust a client's claimed URL.
    return this.run(
      async () => fileReply.parse(await this.http.push(url, new FormData(), undefined, signal)).data,
    );
  }
}
