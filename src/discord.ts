// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { DiscordError, type Bytes, type Call, type Reply } from "./discord-base.js";
import { cases } from "./discord-cases.js";
import { applications } from "./discord-apps.js";
import { giveaways } from "./discord-giveaways.js";
import { panels, tickets } from "./discord-tickets.js";
import { messages } from "./discord-messages.js";
import { alerts, automod, servers } from "./discord-settings.js";
import { events } from "./discord-events.js";
import { moderation, security, verification } from "./discord-admin.js";
import { admin } from "./discord-server.js";
import { grants } from "./discord-grants.js";
import { webhooks } from "./discord-webhooks.js";
import { ticketImport } from "./discord-import.js";
import { invites } from "./discord-invites.js";
import { serverKeys } from "./discord-keys.js";
import { rolemaps } from "./discord-roles.js";

export { DiscordError } from "./discord-base.js";
export type { Actor, List, Page } from "./discord-base.js";
export { verifyEvent } from "./discord-events.js";
export type * from "./discord-cases.js";
export type * from "./discord-apps.js";
export type * from "./discord-giveaways.js";
export type * from "./discord-tickets.js";
export type * from "./discord-messages.js";
export type * from "./discord-settings.js";
export type * from "./discord-events.js";
export type * from "./discord-admin.js";
export type * from "./discord-server.js";
export type * from "./discord-grants.js";
export type * from "./discord-webhooks.js";
export type * from "./discord-import.js";
export type * from "./discord-invites.js";
export type * from "./discord-keys.js";
export type * from "./discord-roles.js";

export class Discord {
  private readonly base: string;

  constructor(
    private readonly key: string,
    base = "https://api.spawnbase.io",
    private readonly send: typeof fetch = fetch,
  ) {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("Use an HTTPS API URL");
    if (!/^sb_[A-Za-z0-9_-]{16,128}$/.test(key)) throw new Error("Use an API key");
    this.base = url.href.replace(/\/$/, "") + "/api/v1/discord";
  }

  private async request(
    path: string,
    query: Record<string, unknown> = {},
    write?: { body?: unknown; method?: "POST" | "PUT" | "PATCH" | "DELETE" },
  ): Promise<Reply> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value === undefined) continue;
      params.set(name, value instanceof Date ? value.toISOString() : String(value));
    }
    const text = params.toString();
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}` };
    if (write?.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await this.send(this.base + path + (text ? `?${text}` : ""), {
      method: write ? (write.method ?? "POST") : "GET",
      headers,
      ...(write?.body !== undefined ? { body: JSON.stringify(write.body) } : {}),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const result = (await response.json().catch(() => ({}))) as Reply;
    if (!response.ok || result.status !== "ok")
      throw new DiscordError(
        response.status,
        result.error?.code ?? "request",
        result.error?.message ?? "Discord request failed",
        result.error?.oldest,
      );
    return result;
  }

  private readonly call: Call = (path, query, write) => this.request(path, query, write);

  private readonly bytes: Bytes = async (path) => {
    const response = await this.send(this.base + path, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.key}` },
      signal: AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as Reply;
      throw new DiscordError(
        response.status,
        result.error?.code ?? "request",
        result.error?.message ?? "Discord request failed",
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  readonly cases = cases(this.call);
  readonly servers = { ...servers(this.call), ...admin(this.call) };
  readonly applications = applications(this.call);
  readonly giveaways = giveaways(this.call);
  readonly panels = panels(this.call);
  readonly tickets = tickets(this.call, this.bytes);
  readonly messages = messages(this.call);
  readonly alerts = alerts(this.call);
  readonly automod = automod(this.call);
  readonly events = events(this.call);
  readonly moderation = moderation(this.call);
  readonly security = security(this.call);
  readonly verification = verification(this.call);
  readonly webhooks = webhooks(this.call);
  readonly rolemaps = rolemaps(this.call);
  readonly invites = invites(this.call);
  readonly grants = grants(this.call);
  readonly serverKeys = serverKeys(this.call);
  readonly ticketImport = ticketImport(this.call);
}
