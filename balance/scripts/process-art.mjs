// Converts the OpenArt PNGs in art-src/ (git-ignored originals) into web-sized WebP files.
import sharp from "sharp";
import fs from "node:fs";
const dir = "public/art";
const sizes = { hero: 2000, sponsor: 1000, "empty-clear": 900 };
for (const f of fs.readdirSync("art-src")) {
  if (!f.endsWith(".png")) continue;
  const name = f.replace(/\.png$/, "");
  const width = sizes[name] ?? (name.startsWith("card-") ? 1000 : 512);
  await sharp(`art-src/${f}`).resize({ width }).webp({ quality: 84 }).toFile(`${dir}/${name}.webp`);
}
console.log(fs.readdirSync(dir).filter((f) => f.endsWith(".webp")).join(" "));
