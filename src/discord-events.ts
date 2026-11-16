// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { verifyEvent as verify } from "./community.js";
import type { Call, List, Page } from "./discord-base.js";
import type { CaseKind, CaseSource, CaseState } from "./discord-cases.js";

export type EventType =
  | "case.created"
  | "case.finished"
  | "case.undone"
  | "application.submitted"
  | "application.decided"
  | "application.failed"
  | "giveaway.created"
  | "giveaway.ended"
  | "giveaway.rerolled"
  | "ticket.opened"
  | "ticket.closed"
  | "ticket.reopened"
  | "message.sent"
  | "message.failed"
  | "post.failed"
  | "server.disconnected";

type Applicant = { applicantId: string; formId: string };

type Requester = { requesterId: string; panelId: string };

type Body = {
  "case.created": { memberId: string; kind: CaseKind; state: CaseState; source: CaseSource };
  "case.finished": { memberId: string; kind: CaseKind; state: "done" | "failed"; error: string | null };
  "case.undone": { memberId: string; kind: CaseKind; revertsId: string };
  "application.submitted": Applicant;
  "application.decided": Applicant & { state: "accepted" | "denied" };
  "application.failed": Applicant & { step: "roles" | "dm" };
  "giveaway.created": Record<string, never>;
  "giveaway.ended": { winners: number };
  "giveaway.rerolled": { round: number };
  "ticket.opened": Requester;
  "ticket.closed": Requester;
  "ticket.reopened": Requester;
  "message.sent": Record<string, never>;
  "message.failed": { error: string };
  "post.failed": { kind: "panel" | "form" };
  "server.disconnected": Record<string, never>;
};

type Subject = {
  "case.created": "case";
  "case.finished": "case";
  "case.undone": "case";
  "application.submitted": "application";
  "application.decided": "application";
  "application.failed": "application";
  "giveaway.created": "giveaway";
  "giveaway.ended": "giveaway";
  "giveaway.rerolled": "giveaway";
  "ticket.opened": "ticket";
  "ticket.closed": "ticket";
  "ticket.reopened": "ticket";
  "message.sent": "message";
  "message.failed": "message";
  "post.failed": "form" | "panel";
  "server.disconnected": "server";
};

export type Event = {
  [T in EventType]: {
    id: string;
    cursor: string;
    type: T;
    createdAt: string;
    serverId: string;
    subject: { type: Subject[T]; id: string };
    data: Body[T];
  };
}[EventType];

export type Delivery = Event extends infer E
  ? E extends unknown
    ? Omit<E, "createdAt"> & { createdAt: number }
    : never
  : never;

export async function verifyEvent(
  raw: string,
  headers: Headers | Record<string, string>,
  secret: string,
  claim: (id: string, expiresAt: number) => boolean | Promise<boolean>,
  now = Date.now(),
): Promise<Delivery> {
  const found = await verify(raw, headers, secret, claim, now);
  if (!found.serverId || !found.subject || !found.cursor)
    throw new Error("Webhook event is not a Discord event");
  return found as unknown as Delivery;
}

export type EventQuery = {
  serverId?: string;
  memberId?: string;
  type?: EventType | EventType[];
  since?: string | Date;
  cursor?: string;
  limit?: number;
};

export function events(call: Call) {
  return {
    list: async ({ type, ...rest }: EventQuery = {}): Promise<List<Event>> => {
      const result = await call("/events", {
        ...rest,
        type: Array.isArray(type) ? type.join(",") : type,
      });
      return { data: result.data as Event[], pagination: result.pagination as Page };
    },
  };
}
