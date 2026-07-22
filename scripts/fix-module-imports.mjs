import fs from "fs";
import path from "path";

const srcRoot = path.resolve("src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function toRootPrefix(fileAbs) {
  const rel = path.relative(srcRoot, path.dirname(fileAbs));
  const depth = rel.split(path.sep).filter(Boolean).length;
  return "../".repeat(depth);
}

const folders = ["modules", "integrations"]
  .map((d) => path.join(srcRoot, d))
  .filter((d) => fs.existsSync(d));

const files = folders.flatMap((d) => walk(d));
let updated = 0;

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  const toRoot = toRootPrefix(file);

  src = src.replace(/from\s+["'](\.\.\/[^"']+)["']/g, (full, rel) => {
    if (rel.includes("/modules/") || rel.includes("/integrations/") || rel.includes("/common/")) {
      return full;
    }
    const markers = ["models/", "utils/", "middleware/", "services/", "validation/", "config/", "controllers/"];
    for (const marker of markers) {
      const idx = rel.indexOf(marker);
      if (idx >= 0 && (rel.startsWith("../") || rel.startsWith("../../"))) {
        const rest = rel.slice(idx);
        return `from '${toRoot}${rest}'`;
      }
    }
    return full;
  });

  // Customer module local imports
  if (file.includes(`${path.sep}customer${path.sep}`)) {
    src = src.replace(/from\s+["'][^"']*models\/Customer\.js["']/g, "from './model.js'");
    src = src.replace(/from\s+["'][^"']*validation\/customerProfile\.js["']/g, "from './validation.js'");
  }

  // Auth module local model
  if (file.includes(`${path.sep}auth${path.sep}`)) {
    src = src.replace(/from\s+["'][^"']*models\/Admin\.js["']/g, "from './model.js'");
  }

  if (src !== orig) {
    fs.writeFileSync(file, src);
    updated += 1;
    console.log("updated", path.relative(srcRoot, file));
  }
}

console.log(`Done. Updated ${updated}/${files.length} files.`);
