import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const tag = process.env.RELEASE_TAG;
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
if (!tag || !/^\d+\.\d+\.\d+$/.test(tag) || tag !== manifest.version || tag !== pkg.version || versions[tag] !== manifest.minAppVersion) {
  throw new Error('Release tag, package, manifest and supported app version must match.');
}
await readFile(`docs/releases/${tag}.md`, 'utf8');
let checksums = '';
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  const data = await readFile(`dist/${file}`);
  if (!data.length) throw new Error(`Empty release artifact: ${file}`);
  checksums += `${createHash('sha256').update(data).digest('hex')}  ${file}\n`;
}
await writeFile('dist/SHA256SUMS', checksums);
console.log(`Validated Issue Bridge ${tag} release artifacts.`);
