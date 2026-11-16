// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Spawnbase

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (pkg.license !== "GPL-3.0-only") throw new Error("SDK license must be GPL-3.0-only");
const output = await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/server.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  write: false,
  legalComments: "inline",
  banner: {
    js: "// SPDX-License-Identifier: GPL-3.0-only\n// Copyright (C) 2026 Spawnbase\n// Bundled dependencies retain their licenses; see THIRD_PARTY_NOTICES.",
  },
});
const bundle = output.outputFiles[0].contents;
const target = join(root, "resource/spawnbase/server/server.js");
if (process.argv.includes("--check")) {
  if (!Buffer.from(bundle).equals(await readFile(target))) throw new Error("Resource bundle is stale");
  process.exit(0);
}
async function put(path, bytes) {
  const current = await readFile(path).catch(() => null);
  if (!current || !Buffer.from(bytes).equals(current)) await writeFile(path, bytes);
}
await mkdir(dirname(target), { recursive: true });
await put(target, bundle);
for (const resource of ["spawnbase", "sb-bridge"])
  for (const name of ["LICENSE", "NOTICE"])
    await put(join(root, "resource", resource, name), await readFile(join(root, name)));
const notices = await readFile(join(root, "THIRD_PARTY_NOTICES"));
const dependency = await readFile(join(root, "node_modules/zod/LICENSE"));
if (!notices.includes(dependency)) throw new Error("Zod license notice is incomplete");
await put(join(root, "resource/spawnbase/THIRD_PARTY_NOTICES"), notices);
const names = [
  "spawnbase/fxmanifest.lua",
  "spawnbase/config.json",
  "spawnbase/client/client.lua",
  "spawnbase/server/server.js",
  "spawnbase/LICENSE",
  "spawnbase/NOTICE",
  "spawnbase/THIRD_PARTY_NOTICES",
  "sb-bridge/fxmanifest.lua",
  "sb-bridge/client/client.lua",
  "sb-bridge/server/server.lua",
  "sb-bridge/LICENSE",
  "sb-bridge/NOTICE",
];
const entries = [];
const captureFiles = [
  "fxmanifest.lua",
  "client.js",
  "ui/index.html",
  "ui/app.js",
  "ui/capture.js",
  "ui/frame.js",
  "LICENSE",
  "NOTICE",
];
for (const name of captureFiles) {
  const bytes = await readFile(join(root, "sb-screenshot", name));
  entries.push([`sb-screenshot/${name}`, bytes]);
  entries.push([`source/sdk/sb-screenshot/${name}`, bytes]);
}
for (const name of names) {
  const bytes = await readFile(join(root, "resource", name));
  if (name.endsWith("fxmanifest.lua") && !bytes.toString().includes(`version '${pkg.version}'`))
    throw new Error("Manifest version mismatch");
  entries.push([name, bytes]);
}
const source = [
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "integrations/frameworks/players.lua",
  "integrations/ox_lib/ox.lua",
  "integrations/sharex/spawnbase.sxcu",
  "scripts/pack.mjs",
  "scripts/check.mjs",
];
const bundled = "resource/spawnbase/server/server.js";
async function sources(dir) {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await sources(path);
    else if (path !== bundled && /\.(ts|js|mjs|lua|json|sxcu)$/.test(entry.name)) source.push(path);
  }
}
for (const dir of ["src", "resource"]) await sources(dir);
for (const path of source) entries.push([`source/sdk/${path}`, await readFile(join(root, path))]);
entries.push([
  "release.json",
  Buffer.from(
    JSON.stringify({
      version: pkg.version,
      license: pkg.license,
      copyright: "Copyright (C) 2026 Spawnbase",
      source: {
        directory: "source/sdk",
        lockfile: "package-lock.json",
        build: ["npm ci --ignore-scripts", "npm run pack"],
      },
      thirdParty: [{ name: "zod", license: "MIT", notice: "spawnbase/THIRD_PARTY_NOTICES" }],
    }),
  ),
]);

// Stored ZIP entries have fixed timestamps, ordering and checksums.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const [name, bytes] of entries.sort(([a], [b]) => a.localeCompare(b, "en"))) {
  const filename = Buffer.from(name),
    crc = crc32(bytes);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(bytes.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(filename.length, 26);
  local.push(header, filename, bytes);
  const index = Buffer.alloc(46);
  index.writeUInt32LE(0x02014b50);
  index.writeUInt16LE(20, 4);
  index.writeUInt16LE(20, 6);
  index.writeUInt16LE(33, 14);
  index.writeUInt32LE(crc, 16);
  index.writeUInt32LE(bytes.length, 20);
  index.writeUInt32LE(bytes.length, 24);
  index.writeUInt16LE(filename.length, 28);
  index.writeUInt32LE(offset, 42);
  central.push(index, filename);
  offset += header.length + filename.length + bytes.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, directory, end]);
await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/build-lock.json"), await readFile(join(root, "package-lock.json")));
const filename = `spawnbase-${pkg.version}.zip`;
await writeFile(join(root, "dist", filename), zip);
await writeFile(
  join(root, "dist", `${filename}.sha256`),
  `${createHash("sha256").update(zip).digest("hex")}  ${filename}\n`,
);
console.log(`Built ${filename} with corresponding source.`);
