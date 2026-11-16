// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";

export type Branding = { name?: string; image?: string; footer?: string; color?: number; upload?: string };

export type BrandingState = {
  branding: { name: string; image: string; footer: string; color?: number } | null;
  brandingPending: boolean;
  brandingError: string | null;
};

export type Credential = { token: string; expiresAt: string };

export type Filter = {
  id: string;
  name: string;
  dataset?: string;
  resource?: string;
  level: "warn" | "error" | "fatal";
  minutes: number;
};

export type NewFilter = {
  name: string;
  dataset?: string;
  resource?: string;
  level?: Filter["level"];
  minutes?: number;
};

export type Install =
  { mode: "managed" } | { mode: "managed" | "selfhost"; guildId: string; applicationId: string };

export type InstallLink = { url: string; expiresAt: string };

export function admin(call: Call) {
  const base = (id: string) => `/servers/${encodeURIComponent(id)}`;
  return {
    delete: async (id: string): Promise<void> => {
      await call(base(id), {}, { method: "DELETE" });
    },
    branding: async (id: string, input: Branding): Promise<BrandingState> => {
      const result = await call(`${base(id)}/branding`, {}, { body: input, method: "PUT" });
      return result.data as BrandingState;
    },
    credentials: {
      rotate: async (id: string): Promise<Credential> => {
        const result = await call(`${base(id)}/credentials`, {}, {});
        return result.data as Credential;
      },
      revoke: async (id: string): Promise<void> => {
        await call(`${base(id)}/credentials`, {}, { method: "DELETE" });
      },
    },
    filters: {
      list: async (): Promise<List<Filter>> => {
        const result = await call("/filters");
        return { data: result.data as Filter[], pagination: result.pagination as Page };
      },
      create: async (input: NewFilter): Promise<Filter> => {
        const result = await call("/filters", {}, { body: input });
        return result.data as Filter;
      },
      delete: async (id: string): Promise<void> => {
        await call(`/filters/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
      },
    },
    install: async (input: Install): Promise<InstallLink> => {
      const result = await call("/servers/install", {}, { body: input });
      return result.data as InstallLink;
    },
  };
}
