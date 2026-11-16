// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call } from "./discord-base.js";

export type RoleLink = {
  id: string;
  installId: string;
  guildId: string;
  guildName: string | null;
  discordRole: string;
  label: string | null;
  role: string;
  createdAt: number;
};

export type RoleLinks = {
  mappings: RoleLink[];
  installs: { id: string; guildId: string; guildName: string | null; mode: "managed" | "selfhost" }[];
  grantable: string[];
};

export type RoleLinkNew = { installId: string; role: string; label?: string; access: string };

export type RoleLinkEdit = { access: string };

export function rolemaps(call: Call) {
  return {
    list: async (): Promise<RoleLinks> => {
      const result = await call("/rolemaps");
      return result.data as RoleLinks;
    },
    create: async (input: RoleLinkNew): Promise<{ id: string }> => {
      const result = await call("/rolemaps", {}, { body: input });
      return result.data as { id: string };
    },
    edit: async (id: string, input: RoleLinkEdit): Promise<void> => {
      await call(`/rolemaps/${encodeURIComponent(id)}`, {}, { body: input, method: "PATCH" });
    },
    delete: async (id: string): Promise<void> => {
      await call(`/rolemaps/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
  };
}
