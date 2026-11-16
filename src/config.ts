// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { z } from "zod";

const slot = z.object({
  enabled: z.boolean().default(false),
  dataset: z.string().default("default"),
});
const disabled = z.object({
  enabled: z.literal(false).default(false),
  dataset: z.string().default("default"),
});

const schema = z.object({
  media: z.object({ visibility: z.enum(["private", "public"]).default("private") }).prefault({}),
  logs: z
    .object({
      level: z.enum(["error", "warn", "info", "debug"]).default("info"),
      levels: z
        .array(z.enum(["error", "warn", "info", "debug"]))
        .refine((values) => values.join(",") === "error,warn,info,debug")
        .default(["error", "warn", "info", "debug"]),
      console: z.boolean().default(false),
      enableCloudLogging: z.boolean().default(true),
      appendPlayerIdentifiers: z.boolean().default(false),
      excludedPlayerIdentifiers: z.array(z.string()).default(["ip"]),
      excludeInDepthMetadata: z.boolean().default(true),
      batch: z
        .object({
          size: z.number().int().min(1).max(1000).default(100),
          flushMs: z.number().int().min(1).max(30000).default(2000),
          bytes: z
            .number()
            .int()
            .min(256)
            .max(96 * 1024)
            .default(96 * 1024),
        })
        .prefault({}),
      capture: z
        .object({
          timeoutMs: z.number().int().min(1000).max(30000).default(10000),
          encoding: z.enum(["png", "jpg", "webp"]).default("webp"),
          quality: z.number().min(0).max(1).default(0.9),
          maxWidth: z.number().int().min(1).max(3840).default(1920),
          maxHeight: z.number().int().min(1).max(2160).default(1080),
        })
        .prefault({}),
      playerEvents: slot.default({ enabled: false, dataset: "player_events" }),
      chatEvents: slot.default({ enabled: false, dataset: "chat" }),
      baseEvents: disabled.default({ enabled: false, dataset: "base_events" }),
      txAdminEvents: disabled.default({ enabled: false, dataset: "txadmin" }),
      oxInventoryEvents: disabled.default({ enabled: false, dataset: "ox_inventory" }),
    })
    .prefault({}),
});

/** Resource configuration with every field present. */
export type Config = z.infer<typeof schema>;

/** The configuration used when `config.json` sets nothing. */
export const defaults: Config = schema.parse({});

/** Reads a `config.json` object and fills in defaults. Unknown keys are ignored and invalid values throw. */
export function parse(raw: unknown): Config {
  return schema.parse(raw ?? {});
}
