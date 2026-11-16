// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";
import type { Case } from "./discord-cases.js";

export type ModerationSettings = {
  enabled: boolean;
  logChannelId: string | null;
  dmMember: boolean;
  warnLimit: number;
  warnDays: number;
  warnTimeout: number;
  capture: boolean;
  lockdownScope: "public" | "picked";
  lockdownChannels: string[];
};

export type Lockdown = {
  id: string;
  installId: string;
  state: "locking" | "locked" | "restoring" | "restored" | "failed";
  channels: number;
  skipped: number;
  leaky: number;
  stale: boolean;
  actorName: string | null;
  error: string | null;
  updatedAt: number;
};

export type Moderation = {
  serverId: string;
  settings: ModerationSettings;
  auditError: string | null;
  lockdown: Lockdown | null;
  missing: string[] | null;
  extras: string[];
};

export type Member = { cases: Case[]; linked: string | null; verified: boolean };

export type Offer = "release" | "verify" | "restore" | "unstrip";

export type SecurityConfig = {
  log: { enabled?: boolean; channelId?: string | null; events?: Record<string, boolean> };
  gate: {
    enabled?: boolean;
    minDays?: number;
    action?: "flag" | "quarantine" | "kick";
    roleId?: string | null;
  };
  alert: { channelId?: string | null; roleId?: string | null };
  verify: { enabled?: boolean; minutes?: number; policyId?: string | null };
  raid: { enabled?: boolean; joins?: number; seconds?: number; lockdown?: boolean; invites?: boolean };
  nuke: { enabled?: boolean; limit?: number; seconds?: number; roleId?: string | null; allow?: string[] };
};

export type SecurityEvent = {
  id: string;
  kind: string;
  memberId: string;
  action: string;
  state: string;
  error: string | null;
  at: number;
  missed: number;
  offer: Offer | null;
};

export type Security = {
  serverId: string;
  name: string;
  guildId: string;
  mode: "managed" | "selfhost";
  config: SecurityConfig;
  version: number;
  log: { skipped: number; failure: { error: string; at: number } | null; missing: string[] };
  alert: { failure: { error: string; at: number } | null; suggested: string | null };
  gate: { missing: string[] };
  verify: { missing: string[] };
  raid: { missing: string[] };
  nuke: { missing: string[] };
  policies: unknown[];
  events: SecurityEvent[];
};

export type PolicyConfig = {
  name: string;
  description?: string;
  rules?: string;
  rulesVersion?: number;
  checks: { rules: boolean; challenge: boolean; website: boolean };
  roles: string[];
  mode?: "once" | "sync";
  removeOnRevoke?: boolean;
  expiresMinutes?: number | null;
  websiteUrl?: string;
  enabled?: boolean;
};

export type Policy = {
  id: string;
  serverId: string;
  config: PolicyConfig;
  version: number;
  enabled: boolean;
  postChannelId: string | null;
};

export type PolicyList = List<Policy> & {
  meta: { servers: { id: string; name: string; mode: "managed" | "selfhost" }[] };
};

export type PolicySaved = { id: string; serverId: string; version: number; enabled: boolean };

export type PolicyMember = {
  discordId: string;
  status: string;
  eligible: boolean;
  expiresAt: string | null;
  updatedAt: string;
};

export function moderation(call: Call) {
  const base = (serverId: string) => `/servers/${encodeURIComponent(serverId)}`;
  return {
    get: async (serverId: string): Promise<Moderation> => {
      const result = await call(`${base(serverId)}/moderation`);
      return result.data as Moderation;
    },
    set: async (serverId: string, settings: Partial<ModerationSettings>): Promise<ModerationSettings> => {
      const result = await call(`${base(serverId)}/moderation`, {}, { body: settings, method: "PUT" });
      return result.data as ModerationSettings;
    },
    lockdown: async (serverId: string): Promise<Lockdown | null> => {
      const result = await call(`${base(serverId)}/lockdown`, {}, {});
      return result.data as Lockdown | null;
    },
    restore: async (serverId: string): Promise<Lockdown | null> => {
      const result = await call(`${base(serverId)}/lockdown`, {}, { method: "DELETE" });
      return result.data as Lockdown | null;
    },
    member: async (serverId: string, memberId: string): Promise<Member> => {
      const result = await call(`${base(serverId)}/members/${encodeURIComponent(memberId)}`);
      return result.data as Member;
    },
  };
}

export function security(call: Call) {
  const base = (serverId: string) => `/servers/${encodeURIComponent(serverId)}/security`;
  return {
    get: async (serverId: string): Promise<Security> => {
      const result = await call(base(serverId));
      return result.data as Security;
    },
    set: async (
      serverId: string,
      input: { version: number; config: Partial<SecurityConfig> },
    ): Promise<{ serverId: string; version: number }> => {
      const result = await call(base(serverId), {}, { body: input, method: "PUT" });
      return result.data as { serverId: string; version: number };
    },
    offer: async (serverId: string, eventId: string, offer: Offer): Promise<void> => {
      await call(
        `${base(serverId)}/events/${encodeURIComponent(eventId)}/${encodeURIComponent(offer)}`,
        {},
        {},
      );
    },
  };
}

export function verification(call: Call) {
  const policy = (id: string) => `/verification/policies/${encodeURIComponent(id)}`;
  return {
    policies: {
      list: async (): Promise<PolicyList> => {
        const result = await call("/verification/policies");
        return {
          data: result.data as Policy[],
          pagination: result.pagination as Page,
          meta: (result.meta as PolicyList["meta"]) ?? { servers: [] },
        };
      },
      create: async (input: { serverId: string; config: PolicyConfig }): Promise<PolicySaved> => {
        const result = await call("/verification/policies", {}, { body: input });
        return result.data as PolicySaved;
      },
      edit: async (id: string, input: { version: number; config: PolicyConfig }): Promise<PolicySaved> => {
        const result = await call(policy(id), {}, { body: input, method: "PATCH" });
        return result.data as PolicySaved;
      },
      delete: async (id: string): Promise<void> => {
        await call(policy(id), {}, { method: "DELETE" });
      },
      members: async (id: string): Promise<List<PolicyMember>> => {
        const result = await call(`${policy(id)}/members`);
        return { data: result.data as PolicyMember[], pagination: result.pagination as Page };
      },
      forget: async (id: string, discordId: string): Promise<void> => {
        await call(`${policy(id)}/members/${encodeURIComponent(discordId)}`, {}, { method: "DELETE" });
      },
    },
    bans: async (serverId: string): Promise<{ serverId: string; banAccess: boolean }> => {
      const result = await call(`/servers/${encodeURIComponent(serverId)}/verification`);
      return result.data as { serverId: string; banAccess: boolean };
    },
  };
}
