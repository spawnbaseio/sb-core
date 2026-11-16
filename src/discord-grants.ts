// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call } from "./discord-base.js";

export type GrantMember = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  permissions: string[];
};

export type Grants = { permissions: string[]; members: GrantMember[] };

export type GrantSet = { permissions: string[] };

export function grants(call: Call) {
  return {
    list: async (): Promise<Grants> => {
      const result = await call("/grants");
      return result.data as Grants;
    },
    set: async (userId: string, input: GrantSet): Promise<void> => {
      await call(`/grants/${encodeURIComponent(userId)}`, {}, { body: input, method: "PATCH" });
    },
  };
}
