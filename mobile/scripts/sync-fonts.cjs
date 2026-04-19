/**
 * Copies repo-root `fonts/junegull rg.otf` → `mobile/assets/fonts/junegull-rg.otf` (Metro `require` path).
 * Run from repo: `cd mobile && npm run sync:fonts`
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const src = path.join(root, "fonts", "junegull rg.otf");
const destDir = path.join(__dirname, "..", "assets", "fonts");
const dest = path.join(destDir, "junegull-rg.otf");

if (!fs.existsSync(src)) {
  console.error("Missing font file:", src);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("sync-fonts: copied to", path.relative(path.join(__dirname, ".."), dest));
