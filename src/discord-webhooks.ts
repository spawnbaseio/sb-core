// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";

export type HookView = {
  id: string;
  name: string;
  url: string;
  types: string[];
  installs: string[] | null;
  enabled: boolean;
  disabledReason: string | null;
  failingSince: number | null;
  rotatedAt: number | null;
  createdAt: number;
  last: { state: string; at: number; code: string | null } | null;
};

export type HookSecret = HookView & { secret: string };

export type HookNew = { name: string; url: string; types: string[]; installs?: string[] | null };

export type HookEdit = {
  name?: string;
  url?: string;
  types?: string[];
  installs?: string[] | null;
  enabled?: boolean;
};

export type HookReplay = { cursor?: string; since?: number | Date };

export type HookQuery = { cursor?: string; limit?: number };

export type HookDelivery = {
  id: string;
  type: string | null;
  serverId: string | null;
  at: number | null;
  state: "pending" | "sent" | "failed" | "skipped" | "expired";
  attempts: number;
  code: string | null;
  error: string | null;
  createdAt: number;
  from: string;
};

export type Replayed = { queued: number; hasMore: boolean; next: string | null };

export function webhooks(call: Call) {
  return {
    list: async (): Promise<List<HookView>> => {
      const result = await call("/webhooks");
      return { data: result.data as HookView[], pagination: result.pagination as Page };
    },
    get: async (id: string): Promise<HookView> => {
      const result = await call(`/webhooks/${encodeURIComponent(id)}`);
      return result.data as HookView;
    },
    create: async (input: HookNew): Promise<HookSecret> => {
      const result = await call("/webhooks", {}, { body: input });
      return result.data as HookSecret;
    },
    edit: async (id: string, input: HookEdit): Promise<HookView> => {
      const result = await call(`/webhooks/${encodeURIComponent(id)}`, {}, { body: input, method: "PATCH" });
      return result.data as HookView;
    },
    delete: async (id: string): Promise<void> => {
      await call(`/webhooks/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
    rotate: async (id: string): Promise<HookSecret> => {
      const result = await call(`/webhooks/${encodeURIComponent(id)}/rotate`, {}, {});
      return result.data as HookSecret;
    },
    deliveries: async (id: string, query: HookQuery = {}): Promise<List<HookDelivery>> => {
      const result = await call(`/webhooks/${encodeURIComponent(id)}/deliveries`, query);
      return { data: result.data as HookDelivery[], pagination: result.pagination as Page };
    },
    replay: async (id: string, input: HookReplay): Promise<Replayed> => {
      const body = {
        cursor: input.cursor,
        since: input.since instanceof Date ? input.since.getTime() : input.since,
      };
      const result = await call(`/webhooks/${encodeURIComponent(id)}/replay`, {}, { body });
      return result.data as Replayed;
    },
  };
}
