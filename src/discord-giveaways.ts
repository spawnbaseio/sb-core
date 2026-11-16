// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { keyed, time, type Call, type List, type Page } from "./discord-base.js";

export type GiveawayState = "active" | "drawing" | "ended" | "cancelled" | "failed";

export type Giveaway = {
  id: string;
  serverId: string;
  channelId: string;
  prize: string;
  winners: number;
  endsAt: string;
  rules: { roles: string[]; joinedDays: number };
  state: GiveawayState;
  round: number;
  entries: number;
  picked: { memberId: string; round: number }[];
  messageId: string | null;
  url: string | null;
  error: string | null;
  createdAt: string;
  endedAt: string | null;
};

export type GiveawayQuery = {
  serverId?: string;
  state?: GiveawayState;
  since?: string | Date;
  cursor?: string;
  limit?: number;
};

export type GiveawayTerms = {
  prize: string;
  winners: number;
  endsAt: string | Date;
  rules?: { roles?: string[]; joinedDays?: number };
};

export type NewGiveaway = {
  serverId: string;
  giveaway: GiveawayTerms & { channelId: string };
  idempotencyKey?: string;
};

export type GiveawayEdit = { version: number; giveaway: GiveawayTerms };

export type Reroll = { count?: number };

export function giveaways(call: Call) {
  return {
    list: async (query: GiveawayQuery = {}): Promise<List<Giveaway>> => {
      const result = await call("/giveaways", query);
      return { data: result.data as Giveaway[], pagination: result.pagination as Page };
    },
    get: async (id: string): Promise<Giveaway> => {
      const result = await call(`/giveaways/${encodeURIComponent(id)}`);
      return result.data as Giveaway;
    },
    create: async (input: NewGiveaway): Promise<Giveaway> => {
      keyed(input.idempotencyKey);
      const result = await call(
        "/giveaways",
        {},
        { body: { ...input, giveaway: { ...input.giveaway, endsAt: time(input.giveaway.endsAt) } } },
      );
      return result.data as Giveaway;
    },
    edit: async (id: string, input: GiveawayEdit): Promise<Giveaway> => {
      const result = await call(
        `/giveaways/${encodeURIComponent(id)}`,
        {},
        {
          body: { ...input, giveaway: { ...input.giveaway, endsAt: time(input.giveaway.endsAt) } },
          method: "PATCH",
        },
      );
      return result.data as Giveaway;
    },
    end: async (id: string): Promise<Giveaway> => {
      const result = await call(`/giveaways/${encodeURIComponent(id)}/end`, {}, {});
      return result.data as Giveaway;
    },
    cancel: async (id: string): Promise<Giveaway> => {
      const result = await call(`/giveaways/${encodeURIComponent(id)}/cancel`, {}, {});
      return result.data as Giveaway;
    },
    reroll: async (id: string, input: Reroll = {}): Promise<Giveaway> => {
      const result = await call(`/giveaways/${encodeURIComponent(id)}/reroll`, {}, { body: input });
      return result.data as Giveaway;
    },
  };
}
