// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { keyed, type Actor, type Call, type List, type Page } from "./discord-base.js";

export type CaseKind = "warn" | "timeout" | "untimeout" | "kick" | "ban" | "unban";

export type CaseState = "pending" | "done" | "failed";

export type CaseSource = "dashboard" | "discord" | "external" | "automod" | "auto";

export type Case = {
  id: string;
  number: number;
  serverId: string;
  guildId: string;
  memberId: string;
  memberName: string | null;
  kind: CaseKind;
  reason: string;
  duration: number | null;
  actor: Actor;
  source: CaseSource;
  state: CaseState;
  error: string | null;
  notice: string | null;
  reverts: string | null;
  reverted: boolean;
  createdAt: string;
};

export type CaseQuery = {
  serverId?: string;
  memberId?: string;
  kind?: CaseKind;
  state?: CaseState;
  since?: string | Date;
  cursor?: string;
  limit?: number;
};

export type NewCase = {
  serverId: string;
  memberId: string;
  kind: "warn" | "timeout" | "kick" | "ban";
  reason?: string;
  duration?: number;
  idempotencyKey?: string;
};

export type Queued = { id: string; number: number; state: "pending"; dm?: boolean };

export function cases(call: Call) {
  return {
    list: async (query: CaseQuery = {}): Promise<List<Case>> => {
      const result = await call("/cases", query);
      return { data: result.data as Case[], pagination: result.pagination as Page };
    },
    get: async (id: string): Promise<Case> => {
      const result = await call(`/cases/${encodeURIComponent(id)}`);
      return result.data as Case;
    },
    create: async (input: NewCase): Promise<Queued> => {
      keyed(input.idempotencyKey);
      const result = await call("/cases", {}, { body: input });
      return result.data as Queued;
    },
    undo: async (id: string): Promise<Queued> => {
      const result = await call(`/cases/${encodeURIComponent(id)}/undo`, {}, {});
      return result.data as Queued;
    },
    retry: async (id: string): Promise<Queued> => {
      const result = await call(`/cases/${encodeURIComponent(id)}/retry`, {}, {});
      return result.data as Queued;
    },
  };
}
