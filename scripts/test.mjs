import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/core.test.ts'], outfile: 'dist/tests.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', alias: { obsidian: './tests/obsidian.ts' } });
const result = spawnSync(process.execPath, ['--test', 'dist/tests.cjs', 'tests/deploy.test.mjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
