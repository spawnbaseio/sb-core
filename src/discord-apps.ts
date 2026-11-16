// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { keyed, type Actor, type Call, type List, type Page } from "./discord-base.js";

export type FormState = "open" | "paused" | "removed";

export type ApplicationState = "pending" | "accepted" | "denied";

export type Question = { label: string; long: boolean; optional: boolean };

export type Roles = { add: string[]; remove: string[] };

export type Form = {
  id: string;
  serverId: string;
  name: string;
  description: string;
  button: string;
  channelId: string;
  reviewChannelId: string;
  questions: Question[];
  reviewerRoles: string[];
  pingRoles: string[];
  rules: { roles: string[]; blocked: string[]; joinedDays: number; cooldownDays: number };
  accept: Roles;
  deny: Roles;
  messages: { done?: string; accepted?: string; denied?: string };
  showAnswers: boolean;
  state: FormState;
  version: number;
  sync: "pending" | "ready" | "failed";
  error: string | null;
  waiting: number;
  url: string | null;
  createdAt: string;
};

export type FormDraft = Omit<
  Form,
  "id" | "serverId" | "state" | "version" | "sync" | "error" | "waiting" | "url" | "createdAt"
>;

export type NewForm = { serverId: string; form: FormDraft; idempotencyKey?: string };

export type FormEdit = { version: number; form: FormDraft };

export type FormPause = { version: number; paused: boolean };

export type Decision = { state: "accepted" | "denied"; reason?: string };

export type Application = {
  id: string;
  serverId: string;
  formId: string;
  formName: string;
  applicantId: string;
  applicantName: string | null;
  state: ApplicationState;
  decider: Actor | null;
  decidedAt: string | null;
  review: "pending" | "ready" | "failed";
  roleResult: string;
  dmResult: string;
  error: string | null;
  submittedAt: string;
};

export type ApplicationDetail = Application & {
  answers: { label: string; text: string }[];
  reason: string | null;
  messageUrl: string | null;
};

export type ApplicationQuery = {
  serverId?: string;
  formId?: string;
  state?: ApplicationState;
  q?: string;
  since?: string | Date;
  cursor?: string;
  limit?: number;
};

export function applications(call: Call) {
  return {
    forms: Object.assign(
      async (query: { serverId?: string } = {}): Promise<List<Form>> => {
        const result = await call("/applications/forms", query);
        return { data: result.data as Form[], pagination: result.pagination as Page };
      },
      {
        create: async (input: NewForm): Promise<Form> => {
          keyed(input.idempotencyKey);
          const result = await call("/applications/forms", {}, { body: input });
          return result.data as Form;
        },
        edit: async (id: string, input: FormEdit): Promise<Form> => {
          const result = await call(
            `/applications/forms/${encodeURIComponent(id)}`,
            {},
            { body: input, method: "PATCH" },
          );
          return result.data as Form;
        },
        pause: async (id: string, input: FormPause): Promise<Form> => {
          const result = await call(
            `/applications/forms/${encodeURIComponent(id)}/pause`,
            {},
            { body: input },
          );
          return result.data as Form;
        },
        post: async (id: string): Promise<Form> => {
          const result = await call(`/applications/forms/${encodeURIComponent(id)}/post`, {}, {});
          return result.data as Form;
        },
        delete: async (id: string): Promise<void> => {
          await call(`/applications/forms/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
        },
      },
    ),
    form: async (id: string): Promise<Form> => {
      const result = await call(`/applications/forms/${encodeURIComponent(id)}`);
      return result.data as Form;
    },
    list: async (query: ApplicationQuery = {}): Promise<List<Application>> => {
      const result = await call("/applications", query);
      return { data: result.data as Application[], pagination: result.pagination as Page };
    },
    get: async (id: string): Promise<ApplicationDetail> => {
      const result = await call(`/applications/${encodeURIComponent(id)}`);
      return result.data as ApplicationDetail;
    },
    decide: async (id: string, input: Decision): Promise<ApplicationDetail> => {
      const result = await call(`/applications/${encodeURIComponent(id)}/decision`, {}, { body: input });
      return result.data as ApplicationDetail;
    },
    retry: async (id: string): Promise<ApplicationDetail> => {
      const result = await call(`/applications/${encodeURIComponent(id)}/retry`, {}, {});
      return result.data as ApplicationDetail;
    },
    delete: async (id: string): Promise<void> => {
      await call(`/applications/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
    },
  };
}
