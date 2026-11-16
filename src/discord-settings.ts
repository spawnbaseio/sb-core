// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";

export type Post = { channelId: string | null; enabled: boolean; error: string | null };

export type PostSet = { channelId: string; enabled: boolean };

export type AlertBody = {
  name: string;
  channelId: string;
  kind: Alert["kind"];
  enabled?: boolean;
  dataset?: string | null;
  resource?: string | null;
  level?: Alert["level"];
  path?: string;
  threshold?: number;
  windowMinutes?: number;
  cooldownMinutes?: number;
  quiet?: boolean;
  quietStart?: number;
  quietEnd?: number;
  timezone?: string;
  digestHour?: number | null;
  message?: Record<string, unknown>;
};

export type NewAlert = { serverId: string; alert: AlertBody };

export type AlertEdit = {
  version?: number;
  alert?: AlertBody;
  enabled?: boolean;
  message?: Record<string, unknown> | null;
};

export type Server = { id: string; name: string; mode: "managed" | "selfhost"; enabled: boolean };

export type ServerDetail = Server & {
  status: Post;
  restarts: Post;
  branding: { name: string; image: string; footer: string; color?: number } | null;
  brandingPending: boolean;
  brandingError: string | null;
  delivery: Record<string, number>;
  failures: { alertId: string; code: string | null; at: string }[];
};

export type Channel = { id: string; name: string; kind: "category" | "text"; category: string | null };

export type Role = { id: string; name: string; color: number; position: number; staff: boolean };

export type Alert = {
  id: string;
  serverId: string;
  version: number;
  name: string;
  kind: "logs" | "media" | "usage" | "migration";
  enabled: boolean;
  channelId: string;
  dataset: string | null;
  resource: string | null;
  level: "warn" | "error" | "fatal";
  path: string;
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  quiet: boolean;
  quietStart: number;
  quietEnd: number;
  timezone: string;
  digestHour: number | null;
  message: Record<string, unknown> | null;
};

export type AutomodRule = {
  id: string;
  serverId: string;
  kind: "invites" | "links" | "mentions" | "spam" | "words" | "preset";
  config: Record<string, unknown>;
  sync: "pending" | "ready" | "failed" | "deleting" | "delete_failed";
  error: string | null;
  drift?: "missing" | "edited" | null;
  updatedAt: string;
};

export type AutomodList = List<AutomodRule> & {
  meta: { pro: boolean; servers: { id: string; logChannel: boolean; stale: boolean }[] };
};

export type AutomodKind = AutomodRule["kind"];

export type AutomodConfig = {
  message?: string;
  alert?: boolean;
  timeout?: number;
  exemptRoles?: string[];
  exemptChannels?: string[];
  limit?: number;
  words?: string[];
  allow?: string[];
  presets?: number[];
};

export type Picked<T> = { data: T[]; listed: boolean };

export function servers(call: Call) {
  return {
    list: async (): Promise<Server[]> => {
      const result = await call("/servers");
      return result.data as Server[];
    },
    get: async (id: string): Promise<ServerDetail> => {
      const result = await call(`/servers/${encodeURIComponent(id)}`);
      return result.data as ServerDetail;
    },
    channels: async (id: string): Promise<Picked<Channel>> => {
      const result = await call(`/servers/${encodeURIComponent(id)}/channels`);
      return { data: result.data as Channel[], listed: result.listed === true };
    },
    roles: async (id: string): Promise<Picked<Role>> => {
      const result = await call(`/servers/${encodeURIComponent(id)}/roles`);
      return { data: result.data as Role[], listed: result.listed === true };
    },
    status: async (id: string, input: PostSet): Promise<Post> => {
      const result = await call(
        `/servers/${encodeURIComponent(id)}/status`,
        {},
        { body: input, method: "PUT" },
      );
      return result.data as Post;
    },
    restarts: async (id: string, input: PostSet): Promise<Post> => {
      const result = await call(
        `/servers/${encodeURIComponent(id)}/restarts`,
        {},
        { body: input, method: "PUT" },
      );
      return result.data as Post;
    },
  };
}

export function alerts(call: Call) {
  return {
    list: async (query: { serverId?: string } = {}): Promise<List<Alert>> => {
      const result = await call("/alerts", query);
      return { data: result.data as Alert[], pagination: result.pagination as Page };
    },
    create: async (input: NewAlert): Promise<Alert> => {
      const result = await call("/alerts", {}, { body: input });
      return result.data as Alert;
    },
    edit: async (id: string, input: AlertEdit): Promise<Alert> => {
      const result = await call(`/alerts/${encodeURIComponent(id)}`, {}, { body: input, method: "PATCH" });
      return result.data as Alert;
    },
    delete: async (id: string): Promise<void> => {
      await call(`/alerts/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
  };
}

export function automod(call: Call) {
  return {
    list: async (query: { serverId?: string; drift?: boolean } = {}): Promise<AutomodList> => {
      const result = await call("/automod", {
        serverId: query.serverId,
        drift: query.drift ? "true" : undefined,
      });
      return {
        data: result.data as AutomodRule[],
        pagination: result.pagination as Page,
        meta: (result.meta as AutomodList["meta"]) ?? { pro: false, servers: [] },
      };
    },
    set: async (serverId: string, kind: AutomodKind, config: AutomodConfig = {}): Promise<AutomodRule> => {
      const result = await call(
        `/automod/${encodeURIComponent(serverId)}/${encodeURIComponent(kind)}`,
        {},
        { body: config, method: "PUT" },
      );
      return result.data as AutomodRule;
    },
    delete: async (serverId: string, kind: AutomodKind): Promise<void> => {
      await call(
        `/automod/${encodeURIComponent(serverId)}/${encodeURIComponent(kind)}`,
        {},
        { method: "DELETE" },
      );
    },
  };
}
