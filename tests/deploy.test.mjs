import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { deploy } from '../scripts/deploy.mjs';

test('deployment copies only build artifacts and preserves settings, activation and notes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-bridge-deploy-'));
  try {
    const config = path.join(root, '.obsidian'), plugin = path.join(config, 'plugins', 'issue-bridge');
    await fs.mkdir(plugin, { recursive: true });
    await fs.writeFile(path.join(plugin, 'data.json'), '{"keep":true}');
    await fs.writeFile(path.join(config, 'community-plugins.json'), '["other-plugin"]');
    await fs.writeFile(path.join(root, 'note.md'), 'Keep note');
    const target = await deploy({ root });
    assert.equal(target, plugin);
    assert.equal(await fs.readFile(path.join(plugin, 'data.json'), 'utf8'), '{"keep":true}');
    assert.equal(await fs.readFile(path.join(config, 'community-plugins.json'), 'utf8'), '["other-plugin"]');
    assert.equal(await fs.readFile(path.join(root, 'note.md'), 'utf8'), 'Keep note');
    assert.deepEqual((await fs.readdir(plugin)).sort(), ['data.json', 'main.js', 'manifest.json', 'styles.css']);
    assert.match(await fs.readFile(path.join(plugin, 'main.js'), 'utf8'), /Copyright \(c\) 2026 wandermyz/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('deployment rejects missing target and escaping config path', async () => {
  await assert.rejects(deploy({}), /OBSIDIAN_VAULT/);
  await assert.rejects(deploy({ root: '.', configName: '../other' }), /relative directory/);
});
