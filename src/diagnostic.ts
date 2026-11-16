// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { z } from "zod";

const events = z.enum([
  "config_invalid",
  "log_queued",
  "enrichment_failed",
  "image_failed",
  "file_failed",
  "presign_failed",
  "capture_presign_failed",
  "session_failed",
  "flush_failed",
  "session_close_failed",
  "heartbeat_failed",
  "logs_dropped",
]);

export function diagnostic(event: z.infer<typeof events>, count?: number): void {
  const code = events.safeParse(event);
  const line = JSON.stringify({
    event: code.success ? code.data : "diagnostic_invalid",
    ...(typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? { count } : {}),
  });
  if (event === "log_queued") console.log(line);
  else console.error(line);
}
