// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

export class HttpError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(code);
  }
  get retryable(): boolean {
    return (
      ["network", "timeout"].includes(this.code) ||
      (this.status === 429 && this.code !== "quota_exceeded") ||
      [500, 502, 503, 504].includes(this.status)
    );
  }
}

export function origin(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
  )
    throw new HttpError("invalid_origin");
  return url.origin;
}

export class Http {
  private root: string;
  constructor(
    root: string,
    private key?: string,
    private timeout = 10000,
  ) {
    this.root = root ? origin(root) : "";
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new HttpError("invalid_timeout");
  }
  post<T = unknown>(
    path: string,
    body?: unknown,
    raw = false,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    if (raw) throw new HttpError("unsupported_response");
    return this.send<T>("POST", this.root + path, body, headers, signal);
  }
  get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return this.send<T>("GET", this.root + path, undefined, {}, signal);
  }
  push<T = unknown>(url: string, body: BodyInit, type?: string, signal?: AbortSignal): Promise<T> {
    const target = new URL(url);
    origin(target.origin);
    if (target.username || target.password || target.hash) throw new HttpError("invalid_url");
    return new Http("", undefined, this.timeout).send<T>(
      "POST",
      url,
      body,
      type ? { "Content-Type": type } : {},
      signal,
    );
  }
  private async send<T>(
    method: string,
    url: string,
    body: unknown,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, this.timeout);
    try {
      const isForm = body instanceof FormData;
      const res = await fetch(url, {
        method,
        redirect: "error",
        signal: controller.signal,
        body: body === undefined || isForm || typeof body === "string" ? body : JSON.stringify(body),
        headers: {
          ...(this.key ? { Authorization: this.key } : {}),
          ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
      });
      return await parse<T>(res);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export async function parse<T = unknown>(res: Response): Promise<T> {
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (reader) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536) throw new HttpError("response_too_large", res.status);
      chunks.push(next.value);
    }
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const error = data && typeof data === "object" && "error" in data ? data.error : undefined;
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[a-z_]{1,64}$/.test(error.code)
        ? error.code
        : `http_${res.status}`;
    const retry = res.headers.get("retry-after");
    const wait =
      retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
    throw new HttpError(code, res.status, Number.isFinite(wait) ? Math.max(0, wait) : 0);
  }
  return data as T;
}

export function form(
  data: Buffer | Uint8Array | string,
  opts: {
    fileName?: string;
    path?: string;
    metadata?: Record<string, unknown>;
    visibility?: "private" | "public";
  } = {},
): FormData {
  const fd = new FormData();
  const blob = typeof data === "string" ? new Blob([data]) : new Blob([data as BlobPart]);
  fd.append("file", blob, opts.fileName ?? "file");
  fd.append("visibility", opts.visibility ?? "private");
  if (opts.fileName) fd.append("filename", opts.fileName);
  if (opts.path) fd.append("path", opts.path);
  if (opts.metadata) fd.append("metadata", JSON.stringify(opts.metadata));
  return fd;
}
