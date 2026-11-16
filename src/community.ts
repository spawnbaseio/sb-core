import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type Eligibility = { policyId: string; accountId: string; revision: number; eligible: boolean };
export type Flow = { id: string; token: string; url: string; expiresAt: number };
export type Status = {
  status: string;
  eligible: boolean | number;
  discordId?: string;
  revision?: number;
  expiresAt?: number | null;
};
export type Completion = { rulesVersion?: number; challengeToken?: string };

export class CommunityError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommunityError";
  }
}

export class Community {
  private readonly base: string;
  constructor(
    private readonly key: string,
    base = "https://api.spawnbase.io",
    private readonly send: typeof fetch = fetch,
  ) {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("Use an HTTPS API URL");
    if (!/^sbc_[A-Za-z0-9_-]{43}$/.test(key)) throw new Error("Use a community server key");
    this.base = url.href.replace(/\/$/, "") + "/api/v1/community";
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.send(this.base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const result = (await response.json()) as {
      status?: string;
      data?: T;
      error?: { code?: string; message?: string };
    };
    if (!response.ok || result.status !== "ok")
      throw new CommunityError(
        response.status,
        result.error?.code ?? "request",
        result.error?.message ?? "Community request failed",
      );
    return result.data as T;
  }

  sendMessage(id: string, idempotencyKey: string) {
    return this.request<{ id: string; state: string }>(`/messages/${encodeURIComponent(id)}/send`, {
      idempotencyKey,
    });
  }
  createFlow(input: Eligibility & { returnUrl?: string }) {
    return this.request<Flow>("/verification/flows", input);
  }
  linkAccount(token: string, input: Eligibility & { discordId?: string }) {
    return this.request<{
      status: string;
      url: string;
      discordId: string | null;
      discordName: string | null;
    }>(`/verification/flows/${encodeURIComponent(token)}/account`, input);
  }
  flowState(token: string) {
    return this.request<{
      id: string;
      discordReady: boolean;
      discordId: string | null;
      discordName: string | null;
      websiteReady: boolean;
      complete: boolean;
      siteKey: string;
      expiresAt: number;
      policy: {
        name: string;
        rules: string;
        rulesVersion: number;
        checks: { rules: boolean; challenge: boolean; website: boolean };
      };
    }>(`/verification/flows/${encodeURIComponent(token)}/state`);
  }
  finishFlow(token: string, input: Completion) {
    return this.request(`/verification/flows/${encodeURIComponent(token)}/finish`, input);
  }
  eligibility(input: Eligibility) {
    return this.request<{ status: string; revision: number }>("/verification/eligibility", input);
  }
  unlink(policyId: string, accountId: string) {
    return this.request("/verification/unlink", { policyId, accountId });
  }
  status(policyId: string, accountId: string) {
    return this.request<Status>(`/verification/status?${new URLSearchParams({ policyId, accountId })}`);
  }
}

const envelope = z.object({
  id: z.uuid(),
  type: z.string().min(1),
  createdAt: z.number().int(),
  data: z.unknown(),
  serverId: z.string().optional(),
  subject: z.object({ type: z.string(), id: z.string() }).optional(),
  cursor: z.string().optional(),
});
export type CommunityEvent = z.infer<typeof envelope>;

export async function verifyEvent(
  raw: string,
  headers: Headers | Record<string, string>,
  secret: string,
  claim: (id: string, expiresAt: number) => boolean | Promise<boolean>,
  now = Date.now(),
): Promise<CommunityEvent> {
  const values = new Headers(headers);
  const timestamp = values.get("X-Spawnbase-Timestamp") ?? "";
  const signatures = [
    values.get("X-Spawnbase-Signature"),
    values.get("X-Spawnbase-Signature-Previous"),
  ].filter((value): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000 || !signatures.length)
    throw new Error("Webhook signature is invalid or expired");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  const matches = signatures.map((value) => timingSafeEqual(expected, Buffer.from(value, "hex")));
  if (!matches.some(Boolean)) throw new Error("Webhook signature is invalid");
  const event = envelope.parse(JSON.parse(raw));
  if (values.get("X-Spawnbase-Event") !== event.id) throw new Error("Webhook event does not match");
  if (!(await claim(event.id, now + 86400000))) throw new Error("Webhook event was already received");
  return event;
}
