import { copyFile, mkdir } from 'node:fs/promises';
const ids = ['gomoku', 'farkle', 'onecard', 'bridge', 'ledger'];
for (const id of ids) {
  const directory = new URL(`../public/rulebooks/${id}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await copyFile(new URL(`../src/features/manual/rulebooks/${id}.md`, import.meta.url), new URL('v1.md', directory));
}
