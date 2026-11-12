import { build } from 'esbuild';
import { mkdir, readFile, copyFile, readdir } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
if (manifest.id !== 'issue-bridge' || manifest.version !== pkg.version || versions[pkg.version] !== manifest.minAppVersion) throw new Error('Inconsistent plugin identity/version.');
await mkdir('dist', { recursive: true });
const thirdPartyLicense = await readFile('vendor/github-enterprise-sync/LICENSE', 'utf8');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let runtimeLicenses = '';
for (const [directory, dependency] of Object.entries(lock.packages)) {
  if (!directory || dependency.dev) continue;
  const licenseFile = (await readdir(directory)).find(name => /^(license|copying)([.-]|$)/i.test(name));
  if (!licenseFile) throw new Error(`Missing bundled dependency license: ${directory}`);
  runtimeLicenses += `\n${directory} ${dependency.version}\n${await readFile(directory + '/' + licenseFile, 'utf8')}\n`;
}
await build({ entryPoints: ['src/main.ts'], outfile: 'dist/main.js', bundle: true,
  external: ['obsidian'], platform: 'browser', format: 'cjs', target: 'es2022',
  banner: { js: '/* Issue Bridge. Auth adapted from wandermyz/obsidian-github-sync; see THIRD_PARTY_NOTICES.md.\n' + thirdPartyLicense + '\nBundled runtime dependencies:\n' + runtimeLicenses + '\n*/' } });
for (const name of ['manifest.json', 'styles.css']) await copyFile(name, `dist/${name}`);
console.log(`Built ${manifest.name} ${manifest.version}.`);
