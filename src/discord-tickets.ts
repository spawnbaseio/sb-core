// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import type { Bytes, Call, List, Page } from "./discord-base.js";

export type Panel = {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
  state: "pending" | "ready" | "failed";
  version: number;
  config: Record<string, unknown>;
};

export type PanelSet = { version: number; enabled: boolean };

export type PanelBody = Record<string, unknown> & {
  name: string;
  description: string;
  channelId: string;
  categoryId: string;
  staffRoleId: string;
  questions: (string | { label: string; long?: boolean; optional?: boolean })[];
};

export type PanelNew = { serverId: string; panel: PanelBody };

export type PanelEdit = { version: number; panel: PanelBody };

export type PanelRetry = { version: number };

export type TicketStatus = "open" | "waiting" | "closed" | "deleted";

export type Ticket = {
  id: string;
  number: number | null;
  serverId: string;
  panelId: string;
  name: string;
  status: "open" | "closed" | "deleted";
  waiting: boolean;
  imported: boolean;
  summary: string | null;
  match: string | null;
  requesterId: string;
  requesterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  channelId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type TicketDetail = Ticket & {
  participants: string[];
  closedBy: string | null;
  closeReason: string | null;
  intake: { question: string; answer: string }[];
  history: number;
  capture: Record<string, unknown>;
  events: TicketEntry[];
  next: string | null;
};

export type TicketEntry = TranscriptEvent & { visibility: "public" | "staff" };

export type TicketMeta = {
  counts: Record<string, number>;
  imported: number;
  capture: Record<string, Record<string, unknown>>;
};

export type TicketList = List<Ticket> & { meta: TicketMeta };

export type TicketQuery = {
  serverId?: string;
  status?: TicketStatus;
  panelId?: string;
  requesterId?: string;
  assigneeId?: string;
  unassigned?: true;
  imported?: true;
  q?: string;
  since?: string | Date;
  cursor?: string;
  limit?: number;
};

export type TranscriptMessage = {
  id: string;
  author: { id: string; name: string; bot: boolean };
  content: string | null;
  sentAt: string;
  editedAt: string | null;
  replyTo: string | null;
  embeds: {
    title: string;
    description: string;
    fields: { name: string; value: string; inline: boolean }[];
    footer: string;
  }[];
  attachments: {
    id: string;
    name: string;
    mime: string;
    size: number;
    status: "pending" | "ready" | "failed" | "unsupported" | "quota" | "unavailable";
  }[];
  deleted: boolean;
};

export type TranscriptEvent = {
  id: string;
  kind: string;
  actorId: string;
  text: string;
  at: string;
  message: TranscriptMessage | null;
};

export type TranscriptQuery = { cursor?: string; limit?: number };

export function panels(call: Call) {
  return {
    list: async (query: { serverId?: string } = {}): Promise<List<Panel>> => {
      const result = await call("/ticket-panels", query);
      return { data: result.data as Panel[], pagination: result.pagination as Page };
    },
    create: async (input: PanelNew): Promise<Panel> => {
      const result = await call("/ticket-panels", {}, { body: input });
      return result.data as Panel;
    },
    edit: async (id: string, input: PanelEdit): Promise<Panel> => {
      const result = await call(
        `/ticket-panels/${encodeURIComponent(id)}`,
        {},
        { body: input, method: "PATCH" },
      );
      return result.data as Panel;
    },
    set: async (id: string, input: PanelSet): Promise<Panel> => {
      const result = await call(
        `/ticket-panels/${encodeURIComponent(id)}`,
        {},
        { body: input, method: "PATCH" },
      );
      return result.data as Panel;
    },
    retry: async (id: string, input: PanelRetry): Promise<Panel> => {
      const result = await call(`/ticket-panels/${encodeURIComponent(id)}/retry`, {}, { body: input });
      return result.data as Panel;
    },
  };
}

export function tickets(call: Call, bytes: Bytes) {
  return {
    list: async (query: TicketQuery = {}): Promise<TicketList> => {
      const result = await call("/tickets", query);
      return {
        data: result.data as Ticket[],
        pagination: result.pagination as Page,
        meta: result.meta as TicketMeta,
      };
    },
    get: async (id: string): Promise<TicketDetail> => {
      const result = await call(`/tickets/${encodeURIComponent(id)}`);
      return result.data as TicketDetail;
    },
    delete: async (id: string): Promise<void> => {
      await call(`/tickets/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
    attachment: (id: string, file: string): Promise<Uint8Array> =>
      bytes(`/tickets/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file)}`),
    transcript: async (id: string, query: TranscriptQuery = {}): Promise<List<TranscriptEvent>> => {
      const result = await call(`/tickets/${encodeURIComponent(id)}/transcript`, query);
      return { data: result.data as TranscriptEvent[], pagination: result.pagination as Page };
    },
  };
}
