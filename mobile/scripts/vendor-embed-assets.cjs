/**
 * Copies repo-root `bg/` and `fonts/` (siblings of `mobile/`) into `mobile/assets/`
 * so Metro can bundle them without leaving the `mobile/` project root.
 *
 * Run: `cd mobile && npm run vendor:assets`
 * (Also runs automatically before `expo start` / `expo export` via package.json.)
 */
const fs = require("fs");
const path = require("path");

const mobileRoot = path.join(__dirname, "..");
const embedRoot = path.join(mobileRoot, "..");
const bgSrc = path.join(embedRoot, "bg");
const fontSrc = path.join(embedRoot, "fonts");
const bgDest = path.join(mobileRoot, "assets", "bg");
const fontDest = path.join(mobileRoot, "assets", "fonts");

function copyImages() {
  if (!fs.existsSync(bgSrc)) {
    console.error("vendor-embed-assets: missing folder:", bgSrc);
    process.exit(1);
  }
  fs.mkdirSync(bgDest, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(bgSrc)) {
    if (!/\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
    fs.copyFileSync(path.join(bgSrc, f), path.join(bgDest, f));
    n += 1;
  }
  if (n === 0) {
    console.error("vendor-embed-assets: no images found in", bgSrc);
    process.exit(1);
  }
  console.log(`vendor-embed-assets: copied ${n} image(s) -> assets/bg/`);
}

function copyFonts() {
  if (!fs.existsSync(fontSrc)) {
    console.error("vendor-embed-assets: missing folder:", fontSrc);
    process.exit(1);
  }
  fs.mkdirSync(fontDest, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(fontSrc)) {
    if (!/\.(otf|ttf)$/i.test(f)) continue;
    const destName = /junegull/i.test(f) ? "junegull-rg.otf" : f.replace(/\s+/g, "-");
    fs.copyFileSync(path.join(fontSrc, f), path.join(fontDest, destName));
    n += 1;
  }
  if (n === 0) {
    console.error("vendor-embed-assets: add at least one .otf/.ttf under fonts/ (e.g. junegull rg.otf)");
    process.exit(1);
  }
  console.log(`vendor-embed-assets: copied ${n} font file(s) -> assets/fonts/`);
}

copyImages();
copyFonts();
