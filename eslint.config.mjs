// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["dist/**", "resource/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["sb-screenshot/**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        Blob: "readonly",
        FormData: "readonly",
        TextDecoder: "readonly",
        Response: "readonly",
        fetch: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setImmediate: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        GetCurrentResourceName: "readonly",
        GetInvokingResource: "readonly",
        GetGameTimer: "readonly",
        GetParentResourceName: "readonly",
        RegisterNuiCallbackType: "readonly",
        SendNuiMessage: "readonly",
        on: "readonly",
        exports: "readonly",
      },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", Buffer: "readonly", URL: "readonly" },
    },
  },
);
