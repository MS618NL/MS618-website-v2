/**
 * One-shot optimizer for the Fibonacci longread imagery.
 * The sourced originals (Wikimedia/NASA) are huge (the galaxy is ~15 MB). This caps
 * width and recompresses so the page stays fast. SVGs are skipped (already tiny/vector).
 * Run: node scripts/optimize-fibonacci-images.mjs
 */
import sharp from 'sharp';
import { readdirSync, statSync, renameSync } from 'node:fs';
import { join, extname } from 'node:path';

const dir = process.argv[2] || './public/images/fibonacci';
const MAXW = 1600;

const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));

let savedTotal = 0;
for (const f of files) {
  const full = join(dir, f);
  const tmp = join(dir, `__tmp_${f}`);
  const ext = extname(f).toLowerCase();
  const before = statSync(full).size;

  const meta = await sharp(full).metadata();
  let pipeline = sharp(full).rotate();
  if (meta.width && meta.width > MAXW) pipeline = pipeline.resize({ width: MAXW });
  pipeline =
    ext === '.png'
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.jpeg({ quality: 80, mozjpeg: true });

  await pipeline.toFile(tmp);
  renameSync(tmp, full);

  const after = statSync(full).size;
  savedTotal += before - after;
  console.log(
    `${f}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB` +
      (meta.width ? `  (${meta.width}px${meta.width > MAXW ? ` -> ${MAXW}px` : ''})` : ''),
  );
}
console.log(`\nTotal saved: ${(savedTotal / 1024 / 1024).toFixed(1)} MB`);
