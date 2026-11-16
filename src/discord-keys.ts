// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";

export type ServerKey = {
  id: string;
  name: string;
  installId: string;
  policies: string[];
  messages: string[];
  scopes: string[];
  expiresAt: number;
  revokedAt: number | null;
  webhookUrl: string;
  callbackUrls: string[];
  createdAt: number;
};

export type ServerKeyNew = {
  name: string;
  installId: string;
  scopes: ("messages:send" | "verification:read" | "verification:write" | "flows:write")[];
  policies?: string[];
  messages?: string[];
  webhookUrl?: string;
  callbackUrls?: string[];
  expiresDays?: number;
};

export type ServerKeyMade = { id: string; key: string; webhookSecret: string };

export function serverKeys(call: Call) {
  return {
    list: async (): Promise<List<ServerKey>> => {
      const result = await call("/server-keys");
      return { data: result.data as ServerKey[], pagination: result.pagination as Page };
    },
    create: async (input: ServerKeyNew): Promise<ServerKeyMade> => {
      const result = await call("/server-keys", {}, { body: input });
      return result.data as ServerKeyMade;
    },
    revoke: async (id: string): Promise<void> => {
      await call(`/server-keys/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
  };
}
