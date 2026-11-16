// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call } from "./discord-base.js";

export type ImportBot = "tickettool" | "other" | "ticketsbot";

export type ImportJob = {
  id: string;
  state: string;
  reason: string | null;
  bot: string | null;
  channels: string[];
  author: string | null;
  expires: number | null;
  stats: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  queuedAt: number | null;
  imported: number;
};

export type ImportStatus = {
  job: ImportJob | null;
  imported: number;
  wait: number | null;
  usage: { tickets: number; bytes: number; cap: number };
  bots: string[];
};

export type ImportDetect = { bot: Exclude<ImportBot, "ticketsbot">; channel?: string; fresh?: boolean };

export type ImportStart =
  | { bot: Exclude<ImportBot, "ticketsbot">; channels: string[]; author?: string }
  | { bot: "ticketsbot"; token: string };

export type ImportCheck = { bot: "ticketsbot"; token: string };

export type ImportChecked = { tickets: number; days: number; run: number; queue: number; relogin: boolean };

export type Switch = Record<string, unknown> & { drafts: unknown[]; live: number; adopted: number };

export type Drafts = { author?: string; fresh?: boolean };

export type Adopt = { channels: string[]; panel?: string };

function fresh(value: boolean | undefined) {
  return value ? "1" : undefined;
}

export function ticketImport(call: Call) {
  const root = (serverId: string) => `/servers/${encodeURIComponent(serverId)}/ticket-import`;
  const job = (serverId: string, id: string) => `${root(serverId)}/jobs/${encodeURIComponent(id)}`;
  return {
    status: async (serverId: string): Promise<ImportStatus> => {
      const result = await call(root(serverId));
      return result.data as ImportStatus;
    },
    detect: async (serverId: string, query: ImportDetect): Promise<Record<string, unknown>[]> => {
      const result = await call(`${root(serverId)}/detect`, {
        bot: query.bot,
        channel: query.channel,
        fresh: fresh(query.fresh),
      });
      return (result.data as { channels: Record<string, unknown>[] }).channels;
    },
    check: async (serverId: string, input: ImportCheck): Promise<ImportChecked> => {
      const result = await call(`${root(serverId)}/check`, {}, { body: input });
      return result.data as ImportChecked;
    },
    start: async (serverId: string, input: ImportStart): Promise<{ id: string }> => {
      const result = await call(root(serverId), {}, { body: input });
      return result.data as { id: string };
    },
    catchup: async (serverId: string, input: { token?: string } = {}): Promise<{ id: string }> => {
      const result = await call(`${root(serverId)}/catchup`, {}, { body: input });
      return result.data as { id: string };
    },
    job: async (serverId: string, id: string): Promise<ImportJob> => {
      const result = await call(job(serverId, id));
      return result.data as ImportJob;
    },
    login: async (serverId: string, id: string, input: { token: string }): Promise<{ id: string }> => {
      const result = await call(`${job(serverId, id)}/login`, {}, { body: input });
      return result.data as { id: string };
    },
    resume: async (serverId: string, id: string): Promise<void> => {
      await call(`${job(serverId, id)}/resume`, {}, {});
    },
    cancel: async (serverId: string, id: string): Promise<void> => {
      await call(`${job(serverId, id)}/cancel`, {}, {});
    },
    remove: async (serverId: string): Promise<void> => {
      await call(`${root(serverId)}/tickets`, {}, { method: "DELETE" });
    },
    switch: async (serverId: string): Promise<Switch> => {
      const result = await call(`${root(serverId)}/switch`);
      return result.data as Switch;
    },
    drafts: async (serverId: string, input: Drafts = {}): Promise<Record<string, unknown>> => {
      const result = await call(`${root(serverId)}/drafts`, {}, { body: input });
      return result.data as Record<string, unknown>;
    },
    post: async (
      serverId: string,
      panel: string,
      input: { deleteOld?: boolean } = {},
    ): Promise<Record<string, unknown>> => {
      const result = await call(
        `${root(serverId)}/panels/${encodeURIComponent(panel)}/post`,
        {},
        { body: input },
      );
      return result.data as Record<string, unknown>;
    },
    adoptable: async (
      serverId: string,
      query: { fresh?: boolean } = {},
    ): Promise<Record<string, unknown>[]> => {
      const result = await call(`${root(serverId)}/adopt`, { fresh: fresh(query.fresh) });
      return (result.data as { channels: Record<string, unknown>[] }).channels;
    },
    adopt: async (serverId: string, input: Adopt): Promise<Record<string, unknown>> => {
      const result = await call(`${root(serverId)}/adopt`, {}, { body: input });
      return result.data as Record<string, unknown>;
    },
  };
}
