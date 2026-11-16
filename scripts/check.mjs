// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { readdir } from "node:fs/promises";
const names = await readdir(process.argv[2] ?? new URL("..", import.meta.url));
if (names.some((name) => name !== "README.md" && /\.(md|mdx|markdown|mdown)$/i.test(name)))
  throw new Error("Local Markdown notes cannot be included in SDK packages");
