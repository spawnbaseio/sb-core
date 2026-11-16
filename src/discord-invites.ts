// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";

export type Invite = {
  id: string;
  kind: "user" | "role";
  target: string | null;
  label: string | null;
  access: string;
  seats: number;
  used: number;
  guild: string;
  inviter: { id: string; name: string | null };
  expiresAt: number;
  createdAt: number;
};

export type InviteNew = {
  installId: string;
  user?: string;
  role?: string;
  label?: string;
  access: string;
  seats?: number;
};

export type InviteMember = { id: string; name: string; username: string; avatar: string };

export type InviteLink = { id: string; url: string };

export function invites(call: Call) {
  return {
    list: async (): Promise<List<Invite>> => {
      const result = await call("/invites");
      return { data: result.data as Invite[], pagination: result.pagination as Page };
    },
    members: async (serverId: string, q: string): Promise<{ data: InviteMember[]; listed: boolean }> => {
      const result = await call(`/servers/${encodeURIComponent(serverId)}/invite-members`, { q });
      return { data: result.data as InviteMember[], listed: result.listed === true };
    },
    create: async (input: InviteNew): Promise<InviteLink> => {
      const result = await call("/invites", {}, { body: input });
      return result.data as InviteLink;
    },
    link: async (id: string): Promise<{ url: string }> => {
      const result = await call(`/invites/${encodeURIComponent(id)}/link`, {}, {});
      return result.data as { url: string };
    },
    revoke: async (id: string): Promise<void> => {
      await call(`/invites/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
  };
}
