import { cp, mkdir, rm, access } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output);
const entries = [
  'index.html', 'products.html', 'branches.html', 'prescription.html',
  'privacy.html', 'landing.html', '404.html', 'robots.txt', 'sitemap.xml',
  '_worker.js', 'assets', 'ibrheam', 'omar', 'workspace',
];
for (const entry of entries) {
  await cp(new URL(entry, import.meta.url), new URL(entry, output), { recursive: true });
}
await access(new URL('index.html', output));
