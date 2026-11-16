// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

export type Actor = { type: "user" | "key" | "discord"; name: string };

export type Page = { limit: number; next: string | null; hasMore: boolean };

export type List<T> = { data: T[]; pagination: Page };

export function time(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class DiscordError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly oldest?: string,
  ) {
    super(message);
    this.name = "DiscordError";
  }
}

export type Reply = {
  status?: string;
  data?: unknown;
  listed?: boolean;
  pagination?: Page;
  meta?: unknown;
  error?: { code?: string; message?: string; oldest?: string };
};

export type Call = (
  path: string,
  query?: Record<string, unknown>,
  write?: { body?: unknown; method?: "POST" | "PUT" | "PATCH" | "DELETE" },
) => Promise<Reply>;

export type Bytes = (path: string) => Promise<Uint8Array>;

export function keyed(value: string | undefined): void {
  if (value !== undefined && !/^[A-Za-z0-9._:-]{1,100}$/.test(value))
    throw new Error("Send an idempotencyKey of 1 to 100 letters, digits, . _ : or -");
}
