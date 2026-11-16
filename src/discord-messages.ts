// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Call, List, Page } from "./discord-base.js";

export type ButtonStyle = "primary" | "secondary" | "success" | "danger";

export type Button =
  | { kind: "link"; label: string; url: string }
  | { kind: "verify"; label: string; policyId: string; style?: ButtonStyle }
  | { kind: "role"; label: string; roleId: string; style?: ButtonStyle };

export type Payload = {
  content?: string;
  embeds?: Record<string, unknown>[];
  buttons?: Button[];
  mentions?: { everyone?: boolean; users?: string[]; roles?: string[] };
};

export type DraftBody = {
  name: string;
  channelId: string;
  payload: Payload;
  trigger?: "manual" | "welcome";
};

export type NewDraft = { serverId: string; draft: DraftBody };

export type DraftEdit = { version: number; draft: DraftBody };

export type Schedule = {
  timezone: string;
  local: string;
  offsetMinutes: number;
  repeat: "once" | "daily" | "weekly";
};

export type Publish = { version: number };

export type Timing = Schedule & { version: number };

export type Pause = { paused: boolean };

export type MessageRetry = { confirmed?: boolean };

export type Message = {
  id: string;
  serverId: string;
  name: string;
  channelId: string;
  payload: Record<string, unknown>;
  trigger: string;
  version: number;
  publishedVersion: number | null;
  state: string;
  dueAt: string | null;
  schedule: Record<string, unknown> | null;
  paused: boolean;
  messageId: string | null;
  url: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageQuery = {
  serverId?: string;
  since?: string | Date;
  cursor?: string;
  limit?: number;
};

export type Preview = { occurrences: string[] };

export function messages(call: Call) {
  return {
    previewSchedule: async (input: Schedule): Promise<Preview> => {
      const result = await call("/messages/preview-schedule", {}, { body: input });
      return result.data as Preview;
    },
    list: async (query: MessageQuery = {}): Promise<List<Message>> => {
      const result = await call("/messages", query);
      return { data: result.data as Message[], pagination: result.pagination as Page };
    },
    create: async (input: NewDraft): Promise<Message> => {
      const result = await call("/messages", {}, { body: input });
      return result.data as Message;
    },
    edit: async (id: string, input: DraftEdit): Promise<Message> => {
      const result = await call(`/messages/${encodeURIComponent(id)}`, {}, { body: input, method: "PATCH" });
      return result.data as Message;
    },
    archive: async (id: string): Promise<void> => {
      await call(`/messages/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
    publish: async (id: string, input: Publish): Promise<Message> => {
      const result = await call(`/messages/${encodeURIComponent(id)}/publish`, {}, { body: input });
      return result.data as Message;
    },
    schedule: async (id: string, input: Timing): Promise<Message> => {
      const result = await call(`/messages/${encodeURIComponent(id)}/schedule`, {}, { body: input });
      return result.data as Message;
    },
    pause: async (id: string, input: Pause): Promise<Message> => {
      const result = await call(`/messages/${encodeURIComponent(id)}/pause`, {}, { body: input });
      return result.data as Message;
    },
    cancel: async (id: string): Promise<Message> => {
      const result = await call(`/messages/${encodeURIComponent(id)}/cancel`, {}, {});
      return result.data as Message;
    },
    retry: async (id: string, input: MessageRetry = {}): Promise<Message> => {
      const result = await call(`/messages/${encodeURIComponent(id)}/retry`, {}, { body: input });
      return result.data as Message;
    },
    unpublish: async (id: string, input: Publish): Promise<Message> => {
      const result = await call(
        `/messages/${encodeURIComponent(id)}/live`,
        {},
        { body: input, method: "DELETE" },
      );
      return result.data as Message;
    },
  };
}
