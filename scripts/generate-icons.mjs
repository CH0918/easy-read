import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/icons', { recursive: true });
await Promise.all(
  [16, 32, 48, 128].map((size) =>
    sharp('public/logo.svg').resize(size, size).png().toFile(`public/icons/${size}.png`),
  ),
);
console.log('Generated Chrome icons from public/logo.svg');
