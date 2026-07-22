/**
 * Install git hooks locally. Skip in Docker/CI/production installs
 * where husky is not present (`npm ci --omit=dev`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skip =
  process.env.HUSKY === "0" ||
  process.env.CI === "true" ||
  process.env.NODE_ENV === "production" ||
  !existsSync(".git");

if (skip) process.exit(0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const huskyBin = path.join(root, "node_modules", "husky", "bin.js");

if (!existsSync(huskyBin)) process.exit(0);

const result = spawnSync(process.execPath, [huskyBin], {
  stdio: "inherit",
  cwd: root,
});
process.exit(result.status ?? 0);
