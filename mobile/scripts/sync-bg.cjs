/**
 * Copies `animals_kingdom/bg/*` into `mobile/assets/bg/` so Metro bundles the same art you edit at repo root.
 * Run from repo: `cd mobile && npm run sync:bg`
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const srcDir = path.join(root, "bg");
const destDir = path.join(__dirname, "..", "assets", "bg");

if (!fs.existsSync(srcDir)) {
  console.error("Missing folder:", srcDir);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(srcDir)) {
  if (!/\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
  fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
  n += 1;
}
console.log(`sync-bg: copied ${n} file(s) to assets/bg/`);
