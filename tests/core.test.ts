import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, END, createTaskId, duplicateRepos, normalizeRepo, repositoryFromProperty, renderTasks, taskIds, updateBlock, newIssueNumbers, safeTitle } from '../src/sync/core';
import { decorateIssueLinks, registerTaskIcons, taskIconOffset, TaskIcons } from '../src/sync/icons';
import { parseHTML } from 'linkedom';
import { GitHubClient, ApiError, type Issue } from '../src/github/client';
import { pollForToken, requestDeviceCode, refreshAccessToken, pause, type Http } from '../src/github/auth';
import { Session } from '../src/github/session';
import IssueBridge from '../src/main';
import { cleanSettings, IssueBridgeSettings } from '../src/settings';
import { readLocalState } from '../src/localState';
import type { MarkdownPostProcessor, Plugin, Setting as ObsidianSetting, SettingGroup } from 'obsidian';
import { ISSUE_BRIDGE_APP } from '../src/github/app';
import { TFile, MarkdownView, Notice, Setting, settingsHost } from './obsidian';
import { previewPath, previewHtml } from '../src/preview/markdown';
import { PreviewCache } from '../src/preview/cache';
import { RepositoryPreview } from '../src/preview/block';
const fixture: Issue[] = [{ number: 2, title: 'Keep context', state: 'open', createdAt: '2026-11-01T10:00:00Z' }, { number: 1, title: 'Done', state: 'closed', createdAt: '2026-10-01T10:00:00Z' }];
const issue = (number: number, state = 'open') => ({ number, title: `Issue ${number}`, state, created_at: '2026-11-01T10:00:00Z', assignees: [{ login: 'tester' }] });
const ok = (json: unknown) => ({ status: 200, json });

test('new Tasks IDs have six base-36 characters and retry collisions or short candidates', () =>
{
  const used = new Set(['4fzzzx']);
  const values = [0, 0.123456789, 0.234567891];
  let calls = 0;
  const generated = createTaskId(used, () => values[calls++]);
  assert.match(generated, /^[a-z\d]{6}$/);
  assert.notEqual(generated, '4fzzzx'); assert.equal(calls, 3); assert.ok(used.has(generated));
  assert.throws(() => createTaskId(used, () => 0.123456789), /Could not generate/);
  assert.deepEqual(taskIds('🆔 abc_def (id:: XyZ-12) [id:: a1b2c3] 🆔\uFE0F abc789'), ['abc_def', 'XyZ-12', 'a1b2c3', 'abc789']);
});

test('legacy imported lines migrate to plain titles with number-only links, retaining metadata and long IDs', () =>
{
  const oldId = '0123456789abcdef0123456789abcdef';
  const old = `${START}\n- [ ] [#2 Keep context](https://github.com/o/r/issues/2) 🆔 ${oldId} ➕ 2026-11-01 ⏳ 2026-12-01 ⛔ other_id\n${END}`;
  const options = { respectTasks: true, format: 'emoji' as const };
  const next = updateBlock(old, 0, 'o/r', [fixture[0]], options);
  assert.ok(next.includes('- [ ] Keep context [#2](https://github.com/o/r/issues/2)'));
  assert.ok(next.includes(`🆔 ${oldId}`)); assert.ok(next.includes('⏳ 2026-12-01 ⛔ other_id'));
  assert.equal(updateBlock(next, 0, 'o/r', [fixture[0]], options), next);
  assert.equal(taskIconOffset('- [ ] Keep context [#2](https://github.com/o/r/issues/2) 🆔 abc123'), 6);
  assert.equal(taskIconOffset('- [ ] [#2 Keep context](https://github.com/o/r/issues/2)'), 6);
  assert.equal(taskIconOffset('A normal paragraph [#2](https://github.com/o/r/issues/2)'), null);
});

test('number-only links follow escaped plain titles and precede all Tasks metadata', () =>
{
  const result = renderTasks('o/r', [{ ...fixture[0], title: 'Title [brackets] **bold** 📅 2099-01-01' }], '\n', { respectTasks: true, format: 'emoji' });
  assert.match(result, /^- \[ \] Title \\\[brackets\\\] \\\*\\\*bold\\\*\\\* &#128197; 2099-01-01 \[#2\]\(https:\/\/github\.com\/o\/r\/issues\/2\) 🆔 [a-z\d]{6} ➕ 2026-11-01$/);
});

async function withTaskDom(html: string, run: (root: HTMLElement) => void | Promise<void>): Promise<void>
{
  const dom = parseHTML(`<html><body>${html}</body></html>`);
  const originalSpan = Object.getOwnPropertyDescriptor(globalThis, 'createSpan');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  // Linkedom has no adoptNode; our helper already creates nodes in this document.
  Object.defineProperty(dom.document, 'adoptNode', { value: (node: Node) => node });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'createSpan', { configurable: true, value: (options: { cls: string; attr: Record<string, string> }) =>
  {
    const span = dom.document.createElement('span'); span.className = options.cls;
    for (const [key, value] of Object.entries(options.attr)) span.setAttribute(key, value);
    return span;
  } });
  try { await run(dom.document.body as unknown as HTMLElement); }
  finally {
    if (originalSpan) Object.defineProperty(globalThis, 'createSpan', originalSpan);
    else Reflect.deleteProperty(globalThis, 'createSpan');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('Octocat starts native and Tasks descriptions, stays outside links and is not duplicated', async () =>
{
  await withTaskDom(`<ul>
    <li class="task-list-item" id="native"><input type="checkbox">Plain title <a href="https://github.com/o/r/issues/2">#2</a> 🆔 abc123</li>
    <li class="task-list-item" id="query"><input type="checkbox"><span class="tasks-list-text"><span class="task-description">Query title <a href="https://github.com/o/r/issues/3">#3</a></span></span></li>
    <li class="task-list-item" id="other"><input type="checkbox">Other <a href="https://example.org/o/r/issues/4">#4</a></li>
    </ul><p><a href="https://github.com/o/r/issues/2">#2</a></p>`, root =>
  {
    decorateIssueLinks(root); decorateIssueLinks(root);
    assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 2);
    const native = root.querySelector('#native')!;
    assert.equal((native.childNodes[1] as HTMLElement).className, 'issue-bridge-github-icon');
    assert.ok(native.childNodes[2].textContent?.startsWith('Plain title'));
    const query = root.querySelector('#query .task-description')!;
    assert.equal((query.firstChild as HTMLElement).className, 'issue-bridge-github-icon');
    assert.ok(query.childNodes[1].textContent?.startsWith('Query title'));
    assert.equal(root.querySelectorAll('a .issue-bridge-github-icon').length, 0);
    assert.equal(root.querySelector('#other .issue-bridge-github-icon'), null);
  });
});

test('Octocat reuses a wrapped icon and removes existing duplicates from the same task', async () =>
{
  for (const extra of ['', '<span class="issue-bridge-github-icon"></span>']) {
    await withTaskDom(`<ul><li class="task-list-item"><input type="checkbox"><span class="tasks-list-text"><span class="task-description">${extra}<p><span class="issue-bridge-github-icon"></span>Plain title <a href="https://github.com/o/r/issues/1">#1</a></p></span></span></li></ul>`, root =>
    {
      const original = root.querySelector('.issue-bridge-github-icon');
      decorateIssueLinks(root); decorateIssueLinks(root);
      assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 1);
      assert.equal(root.querySelector('.task-description')!.firstChild, original);
      assert.ok(root.textContent?.includes('Plain title #1'));
      assert.equal(root.querySelector('a')!.textContent, '#1');
    });
  }
});

test('parent tasks and subtasks each retain their own Octocat across overlapping render roots', async () =>
{
  await withTaskDom(`<ul><li class="task-list-item" id="parent"><input type="checkbox">Parent <a href="https://github.com/o/r/issues/1">#1</a> and <a href="https://github.com/o/r/issues/3">#3</a><ul><li class="task-list-item" id="child"><input type="checkbox"><span class="issue-bridge-github-icon"></span>Child <a href="https://github.com/o/r/issues/2">#2</a></li></ul></li></ul>`, root =>
  {
    const childIcon = root.querySelector('#child .issue-bridge-github-icon');
    const parent = root.querySelector<HTMLElement>('#parent')!;
    decorateIssueLinks(root); decorateIssueLinks(parent); decorateIssueLinks(root);
    assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 2);
    assert.equal(root.querySelector('#child .issue-bridge-github-icon'), childIcon);
    assert.equal(Array.from(parent.querySelectorAll('.issue-bridge-github-icon')).filter(icon => icon.closest('li') === parent).length, 1);
    assert.equal(parent.querySelector('input')!.nextSibling, parent.querySelector('.issue-bridge-github-icon'));
  });
});

test('Octocat stays singular when Tasks asynchronously wraps already decorated content', async () =>
{
  await withTaskDom('<ul><li class="task-list-item"><span class="task-description">Title <a href="https://github.com/o/r/issues/1">#1</a> 🆔 abc123</span></li></ul>', async root =>
  {
    const component = new TaskIcons(root); component.onload();
    try {
      const description = root.querySelector('.task-description')!;
      description.innerHTML = `<p>${description.innerHTML}</p>`;
      await settle();
      assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 1);
      assert.equal((description.firstChild as HTMLElement).className, 'issue-bridge-github-icon');
      assert.ok(description.textContent?.includes('Title #1 🆔 abc123'));
      const stable = root.innerHTML;
      await settle(); assert.equal(root.innerHTML, stable);
    } finally { component.onunload(); }
  });
});

test('Octocat decorates asynchronously rendered Tasks and disconnects its observer on unload', async () =>
{
  await withTaskDom('<div id="results"></div>', async root =>
  {
    const component = new TaskIcons(root); component.onload();
    root.querySelector('#results')!.innerHTML = '<li class="task-list-item">Late title <a href="https://github.com/o/r/issues/9">#9</a></li>';
    await settle();
    assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 1);
    component.onunload();
    root.querySelector('#results')!.innerHTML = '<li class="task-list-item">After unload <a href="https://github.com/o/r/issues/10">#10</a></li>';
    await settle();
    assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 0);
  });
});

test('plugin cleanup disconnects render observers even while their note remains open', async () =>
{
  await withTaskDom('<div id="results"></div>', async root =>
  {
    let cleanup: (() => void) | undefined;
    let processor: MarkdownPostProcessor | undefined;
    const plugin = {
      register: (callback: () => void) =>
      {
        cleanup = callback;
      },
      registerMarkdownPostProcessor: (callback: MarkdownPostProcessor) =>
      {
        processor = callback;
      }
    };
    registerTaskIcons(plugin as unknown as Plugin);
    await processor!(root, { addChild: (child: TaskIcons) => child.onload() } as unknown as Parameters<MarkdownPostProcessor>[1]);
    cleanup!();
    root.querySelector('#results')!.innerHTML = '<li class="task-list-item">After disable <a href="https://github.com/o/r/issues/10">#10</a></li>';
    await settle();
    assert.equal(root.querySelectorAll('.issue-bridge-github-icon').length, 0);
  });
});

test('stored state validates unknown data while retaining the credential reference and valid entries', () =>
{
  for (const input of [null, [], 42, 'bad', { secretId: 42 }]) {
    assert.match(readLocalState(input).secretId, /^issue-bridge-[a-f\d-]+$/);
    assert.equal(cleanSettings(input).repositoryProperty, 'github_repo');
  }
  const state = readLocalState({
    secretId: 'issue-bridge-deadbeef',
    snapshots: { valid: [1, 2], bad: ['1'], invalid: [-1], other: null },
    unread: [null, 'bad', { repo: 'o/r', number: 1, path: 'note.md' }, { repo: 'https://evil.test', number: 2, path: 'note.md' }],
    lastSync: Infinity, summary: false
  });
  assert.equal(state.secretId, 'issue-bridge-deadbeef');
  assert.deepEqual(state.snapshots, { valid: [1, 2] });
  assert.deepEqual(state.unread, [{ repo: 'o/r', number: 1, path: 'note.md' }]);
  assert.equal(state.lastSync, 0); assert.equal(typeof state.summary, 'string');
  const proto = readLocalState(JSON.parse('{"secretId":"issue-bridge-deadbeef","snapshots":{"__proto__":[1]}}'));
  assert.equal(Object.getPrototypeOf(proto.snapshots), Object.prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(proto.snapshots, '__proto__')?.value, [1]);
});

test('marker scanning preserves exact boundaries with LF, CRLF and unterminated final lines', () =>
{
  for (const eol of ['\n', '\r\n']) {
    for (const ending of ['', eol]) {
      const source = ['Before', START, 'old', END, 'After'].join(eol) + ending;
      const next = updateBlock(source, 0, 'o/r', fixture);
      assert.ok(next.startsWith(`Before${eol}${START}${eol}`));
      assert.ok(next.endsWith(`${END}${eol}After${ending}`));
      assert.equal(updateBlock(next, 0, 'o/r', fixture), next);
    }
  }
});

test('preview paths reject every ASCII control character without a control-character regexp', () =>
{
  for (let code = 0; code < 32; code++) {
    assert.throws(() => previewPath(`docs/a${String.fromCharCode(code)}b.md`));
  }
});

test('authorization waits use window timers and clear the timer on cancellation', async () =>
{
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let cleared = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout,
    clearTimeout: (timer: ReturnType<typeof setTimeout>) =>
    {
      cleared++; clearTimeout(timer);
    }
  } });
  try {
    await pause(0, new AbortController().signal);
    const abort = new AbortController();
    const pending = pause(60_000, abort.signal);
    abort.abort();
    await assert.rejects(pending, /cancelled/);
    assert.equal(cleared, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('repository properties accept scalars and select the first valid repository from mixed URL lists', () =>
{
  assert.equal(repositoryFromProperty('https://github.com/O/R'), 'o/r');
  assert.equal(repositoryFromProperty(['https://example.org', null, 'https://github.com/o', 'https://github.com/O/First', 'https://github.com/o/second']), 'o/first');
  for (const value of [null, {}, [], ['https://github.com/o/r/issues', 'https://evil.test/o/r']]) assert.equal(repositoryFromProperty(value), null);
  assert.equal(cleanSettings({ repositoryProperty: ' urls ' }).repositoryProperty, 'urls');
  assert.equal(cleanSettings({ repositoryProperty: ' ' }).repositoryProperty, 'github_repo');
  assert.equal(cleanSettings(null).respectTasks, true);
  assert.equal(cleanSettings({ respectTasks: false }).respectTasks, false);
});

test('Tasks metadata keeps IDs and local planning across issue updates and format changes', () =>
{
  const options = { respectTasks: true, format: 'emoji' as const, globalFilter: '#task' };
  const first = updateBlock('Manual task\n', 0, 'o/r', fixture, options);
  const ids = [...first.matchAll(/🆔 ([a-z\d]+)/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, 2);
  assert.ok(first.includes('➕ 2026-10-01'));
  assert.ok(first.includes('#task'));
  assert.equal(updateBlock(first, 0, 'o/r', fixture, options), first);
  const planned = first.replace('➕ 2026-11-01', '➕ 2026-11-01 ⏳ 2026-12-01 📅 2026-12-02 ⏫ ⛔ dependency #local');
  const changed = updateBlock(planned, 0, 'o/r', [{ ...fixture[0], title: 'Renamed', state: 'closed' }], options);
  assert.ok(changed.includes('- [x] Renamed [#2]'));
  assert.ok(changed.includes(`🆔 ${ids[1]}`));
  assert.ok(changed.includes('⏳ 2026-12-01 📅 2026-12-02 ⏫ ⛔ dependency #local'));
  assert.ok(changed.startsWith('Manual task\n'));
  const dv = updateBlock(changed, 0, 'o/r', [fixture[0]], { ...options, format: 'dataview' });
  assert.ok(dv.includes(`[id:: ${ids[1]}] [created:: 2026-11-01]`));
  assert.equal(updateBlock(dv, 0, 'o/r', [fixture[0]], { ...options, format: 'dataview' }), dv);
  assert.ok(updateBlock(dv, 0, 'o/r', [fixture[0]], { respectTasks: false, format: 'emoji' }).includes(`[id:: ${ids[1]}]`));
});

test('plain tasks omit generated metadata and duplicate managed issue lines are rejected', () =>
{
  const plain = updateBlock('', 0, 'o/r', fixture);
  assert.ok(!plain.includes('🆔')); assert.ok(!plain.includes('➕'));
  const line = renderTasks('o/r', [fixture[0]]);
  assert.throws(() => updateBlock(`${START}\n${line}\n${line}\n${END}`, 0, 'o/r', fixture), /Duplicate imported/);
});

test('fresh or blank settings use our public GitHub App identity and retain custom identities', () => {
  assert.equal(cleanSettings(null).clientId, ISSUE_BRIDGE_APP.clientId);
  assert.equal(cleanSettings({ clientId: '' }).clientId, ISSUE_BRIDGE_APP.clientId);
  assert.equal(cleanSettings({ clientId: ' IvCustom ' }).clientId, 'IvCustom');
  assert.equal(cleanSettings({ intervalMinutes: -1 }).intervalMinutes, 1);
  assert.equal(cleanSettings({ intervalMinutes: Infinity }).intervalMinutes, 5);
});

test('repository normalization rejects credentials, arbitrary hosts and subpaths', () => {
  assert.equal(normalizeRepo('https://github.com/Owner/Repo.git/'), 'owner/repo');
  for (const value of [undefined, ['https://github.com/o/r'], 'https://evil.test/o/r', 'http://github.com/o/r', 'https://user@github.com/o/r', 'https://github.com/o/r/issues', 'https://github.com/o/r?q=x', 'https://github.com/o/r#x']) assert.throws(() => normalizeRepo(value));
});
test('task renderer handles state and escapes hostile Markdown and Tasks metadata', () => {
  const result = renderTasks('owner/repo', [{ number: 1, title: 'A](https://evil.test)\n- [ ] 📅 2030-01-01 <!-- issue-bridge:end --> <script>', state: 'closed', createdAt: '2026-11-01T10:00:00Z' }]);
  assert.equal(result.split('\n').length, 1);
  assert.ok(result.startsWith('- [x] A\\]'));
  assert.ok(!result.includes('📅')); assert.ok(!result.includes('<script>')); assert.ok(!result.includes(END));
  assert.ok(result.endsWith('](https://github.com/owner/repo/issues/1)'));
});
test('ordinary issue titles keep Unicode and punctuation readable in Live Preview', () =>
{
  assert.equal(safeTitle('[Test] Grüße: open, close — 👍'), '\\[Test\\] Grüße: open, close — 👍');
  assert.equal(safeTitle('[due:: 2099-01-01] 📅 2099-01-01'), '\\[due&#58;&#58; 2099-01-01\\] &#128197; 2099-01-01');
});
test('managed update preserves YAML, surrounding bytes and CRLF; repeated update is identical', () => {
  const yaml = '---\r\nid: keep\r\ncontexts: ["[[A]]"]\r\n---\r\n';
  const body = `Before\r\n${START}\r\nold\r\n${END}\r\nAfter\r\n`;
  const result = updateBlock(yaml + body, yaml.length, 'owner/repo', fixture);
  assert.ok(result.startsWith(yaml + 'Before\r\n' + START));
  assert.ok(result.endsWith(END + '\r\nAfter\r\n'));
  assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(updateBlock(result, yaml.length, 'owner/repo', fixture), result);
  assert.ok(result.indexOf('Done [#1]') < result.indexOf('Keep context [#2]'));
});
test('first insertion appends; successful empty snapshot clears only owned contents', () => {
  const initial = 'Existing content\n';
  const result = updateBlock(initial, 0, 'o/r', fixture);
  assert.ok(result.startsWith(initial)); assert.ok(result.includes('## GitHub Issues'));
  assert.equal(updateBlock(result, 0, 'o/r', []), `Existing content\n\n## GitHub Issues\n\n${START}\n${END}\n`);
});
test('malformed, duplicate, reversed, nested and fenced markers never write', () => {
  for (const text of [START, END, END + '\n' + START, `${START}\n${START}\n${END}`, `${START}\n${END}\n${START}\n${END}`, '```\n' + START + '\n' + END + '\n```', 'text ' + START + '\n' + END, '```unclosed\ntext']) assert.throws(() => updateBlock(text, 0, 'o/r', fixture));
});
test('unclosed or invalid marker text in frontmatter is never scanned as body', () => {
  const frontmatter = `---\nexample: '${START}'\n---\n`;
  assert.ok(updateBlock(frontmatter + 'Note\n', frontmatter.length, 'o/r', fixture).startsWith(frontmatter));
});
test('duplicate mappings and notification baseline rules', () => {
  assert.deepEqual([...duplicateRepos([{ repo: 'o/r', path: 'a', content: '', bodyOffset: 0 }, { repo: 'o/r', path: 'b', content: '', bodyOffset: 0 }])], ['o/r']);
  assert.deepEqual(newIssueNumbers(undefined, [1, 2]), []);
  assert.deepEqual(newIssueNumbers([1], [1, 2]), [2]);
  assert.deepEqual(newIssueNumbers([], [1]), [1]);
});
test('issue pagination includes closed issues, excludes PRs and fetches all pages', async () => {
  const paths: string[] = [];
  const http: Http = async request => {
    paths.push(request.url);
    return ok(paths.length === 1 ? Array.from({ length: 100 }, (_, i) => i === 99 ? { pull_request: {} } : issue(i + 1)) : [issue(101, 'closed')]);
  };
  const result = await new GitHubClient(http, 'fake').assignedIssues('o/r', 'tester');
  assert.equal(result.length, 100); assert.equal(result.at(-1)?.state, 'closed');
  assert.ok(paths[1].endsWith('page=2')); assert.ok(paths[0].includes('state=all&assignee=tester'));
});
test('partial page failures, mismatched assignee, duplicate IDs and invalid data fail the snapshot', async () => {
  let calls = 0;
  await assert.rejects(new GitHubClient(async () => ++calls === 1 ? ok(Array.from({ length: 100 }, (_, i) => issue(i + 1))) : { status: 500, json: [] }, 'fake').assignedIssues('o/r', 'tester'));
  for (const page of [[{ ...issue(1), assignees: [] }], [{ ...issue(1), state: 'surprise' }], [issue(1), issue(1)], { message: 'not an array' }]) {
    await assert.rejects(new GitHubClient(async () => ok(page), 'fake').assignedIssues('o/r', 'tester'));
  }
});
test('rate limits supply backoff and do not disclose response bodies or token', async () => {
  const client = new GitHubClient(async () => ({ status: 429, json: { message: 'SECRET_TOKEN' }, headers: { 'Retry-After': '120' } }), 'SECRET_TOKEN');
  await assert.rejects(client.currentUser(), error => error instanceof ApiError && error.retryAt >= Date.now() + 119_000 && !error.message.includes('SECRET_TOKEN'));
});
test('cancelled fetches cannot produce usable snapshots', async () => {
  let active = true;
  await assert.rejects(new GitHubClient(async () => { active = false; return ok([issue(1)]); }, 'fake', () => active).assignedIssues('o/r', 'tester'), /cancelled/);
});
test('device flow validates destination and uses no upstream app or client secret', async () => {
  let body: Record<string, unknown> = {};
  const device = { device_code: 'fake-device', user_code: 'ABCD', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 };
  assert.deepEqual(await requestDeviceCode(async req => { body = JSON.parse(req.body!); return ok(device); }, 'IvOurApp'), device);
  assert.deepEqual(body, { client_id: 'IvOurApp' });
  await assert.rejects(requestDeviceCode(async () => ok({ ...device, verification_uri: 'https://evil.test' }), 'IvOurApp'));
  await assert.rejects(requestDeviceCode(async () => ok({ error: 'bad', error_description: 'SECRET_TOKEN' }), 'IvOurApp'), error => error instanceof Error && !error.message.includes('SECRET_TOKEN'));
});
test('device polling respects slow_down, pending, expiry and cancellation', async () => {
  let now = 0;
  const waits: number[] = [], replies = [{ error: 'slow_down' }, { error: 'authorization_pending' }, { access_token: 'fake' }];
  const device = { device_code: 'd', user_code: 'u', verification_uri: 'https://github.com/login/device', expires_in: 60, interval: 5 };
  const token = await pollForToken(async () => ok(replies.shift()), 'IvOwn', device, new AbortController().signal, async ms => { waits.push(ms); now += ms; }, () => now);
  assert.equal(token.access_token, 'fake'); assert.deepEqual(waits, [5000, 10000, 10000]);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(pause(1000, abort.signal), /cancelled/);
  now = 0; let requests = 0;
  await assert.rejects(pollForToken(async () => { requests++; return ok({ access_token: 'fake' }); }, 'IvOwn', { ...device, expires_in: 1 }, new AbortController().signal, async ms => { now += ms; }, () => now), /expired/);
  assert.equal(requests, 0);
});
function store() {
  const values = new Map<string, string>();
  return { values, getSecret: (id: string) => values.get(id) ?? null, setSecret: (id: string, value: string) => { values.set(id, value); } };
}
test('refresh exchange needs no secret and the session persists rotated credentials together', async () => {
  const secrets = store(); let calls = 0;
  const http: Http = async req => {
    calls++; const body = JSON.parse(req.body!);
    assert.equal(body.client_id, 'IvOur'); assert.equal(body.refresh_token, 'fake-refresh'); assert.equal(body.client_secret, undefined);
    return ok({ access_token: 'fake-new', refresh_token: 'fake-rotated', expires_in: 3600, refresh_token_expires_in: 7200 });
  };
  const session = new Session(http, secrets, 'issue-bridge-test', () => true);
  session.save('IvOur', 'tester', { access_token: 'fake-old', refresh_token: 'fake-refresh', expires_in: 1 });
  assert.deepEqual(await Promise.all([session.token(), session.token()]), ['fake-new', 'fake-new']);
  assert.equal(calls, 1); assert.equal(session.read()?.refreshToken, 'fake-rotated');
  assert.equal(secrets.values.size, 1);
});
test('disconnect or unload during refresh cannot restore credentials', async () => {
  for (const disconnect of [true, false]) {
    const secrets = store(); let active = true;
    let reply!: (value: { status: number; json: unknown }) => void;
    const session = new Session(() => new Promise(resolve => { reply = resolve; }), secrets, 'issue-bridge-test', () => active);
    session.save('IvOur', 'tester', { access_token: 'fake-old', refresh_token: 'fake-refresh', expires_in: 1 });
    const pending = session.token();
    if (disconnect) session.disconnect(); else active = false;
    reply(ok({ access_token: 'fake-new', refresh_token: 'fake-rotated' }));
    await assert.rejects(pending);
    assert.notEqual(session.read()?.accessToken, 'fake-new');
  }
});
test('invalid token and failed renewal do not leak provider error descriptions', async () => {
  await assert.rejects(refreshAccessToken(async () => ok({ error: 'bad', error_description: 'SECRET_TOKEN' }), 'IvOur', 'fake'), error => error instanceof Error && !error.message.includes('SECRET_TOKEN'));
});

// Exercise the actual plugin synchronization method against an in-memory host.
// The stub deliberately covers no live editor, mobile or network behavior.
function runtime() {
  const file = new TFile() as TFile; file.path = 'notes/project.md';
  const docs = new Map<string, string>([[file.path, '---\ngithub_repo: https://github.com/o/r\n---\nUser text\n']]);
  let writes = 0, activeIssues = [issue(1)], fail = false;
  let beforeFetch: (() => void) | undefined;
  const secret = store();
  const local = { secretId: 'issue-bridge-test', snapshots: {}, unread: [], lastSync: 0, summary: '' };
  const app: any = {
    vault: {
      getMarkdownFiles: () => [...docs.keys()].map(path => path === file.path ? file : Object.assign(new TFile(), { path })),
      read: async (f: TFile) => docs.get(f.path)!,
      getAbstractFileByPath: (path: string) => path === file.path ? file : null,
      process: async (f: TFile, fn: (value: string) => string) => { const result = fn(docs.get(f.path)!); writes++; docs.set(f.path, result); }
    },
    workspace: { getLeavesOfType: () => [] },
    saveLocalStorage: () => {},
  };
  const plugin = new IssueBridge(app, {} as any);
  const internal = plugin as any;
  internal.alive = true; internal.local = local;
  const http: Http = async req => {
    if (req.url.endsWith('/user')) return ok({ login: 'tester' });
    beforeFetch?.();
    if (fail) return { status: 500, json: { message: 'SECRET_TOKEN' } };
    return ok(activeIssues);
  };
  internal.http = http;
  internal.session = new Session(http, secret, 'issue-bridge-test', () => internal.alive);
  internal.session.save('IvOur', 'tester', { access_token: 'fake' });
  Notice.messages.length = 0;
  return { plugin, internal, docs, file, app, local: local as any, writes: () => writes,
    setIssues: (issues: ReturnType<typeof issue>[]) => { activeIssues = issues; }, setFail: () => { fail = true; },
    beforeFetch: (fn: () => void) => { beforeFetch = fn; } };
}

test('declarative settings are searchable and share controls with the legacy renderer', async () =>
{
  const r = runtime(); let saves = 0;
  r.plugin.saveSettings = async () =>
  {
    saves++;
  };
  const tab = new IssueBridgeSettings(r.app, r.plugin);
  const host = tab as unknown as { containerEl: { rows: Setting[] }; updates: number };
  const definitions = tab.getSettingDefinitions();
  assert.ok(definitions.some(d => d.name === 'Repository property'));
  assert.ok(definitions.some(d => d.name === 'Respect Obsidian Tasks'));
  assert.ok(definitions.some(d => d.name === 'Check interval (minutes)'));
  assert.equal(r.writes(), 0); assert.equal(saves, 0);
  // Match the host's render callback path, without a live settings window.
  for (const definition of definitions) {
    const row = new Setting(host.containerEl).setName(definition.name);
    definition.render(row as unknown as ObsidianSetting, {} as SettingGroup);
  }
  assert.equal(host.containerEl.rows[0].heading, true);
  await host.containerEl.rows.find(row => row.name === 'Repository property')!.controls[0].change!(' urls ');
  assert.equal(r.plugin.settings.repositoryProperty, 'urls'); assert.equal(saves, 1);
  await host.containerEl.rows.find(row => row.name === 'Check interval (minutes)')!.controls[0].change!('0');
  assert.equal(saves, 1);
  await host.containerEl.rows.find(row => row.name === 'Check interval (minutes)')!.controls[0].change!('7');
  assert.equal(r.plugin.settings.intervalMinutes, 7); assert.equal(saves, 2);
  const disconnect = host.containerEl.rows.find(row => row.name === 'Connection')!.controls[1];
  settingsHost.modern = true;
  disconnect.click!();
  assert.equal(host.updates, 1);
  try {
    settingsHost.modern = false;
    tab.display();
    assert.equal(host.containerEl.rows.length, definitions.length);
    assert.equal(host.containerEl.rows[0].heading, true);
    assert.ok(String(host.containerEl.rows.at(-1)!.desc).includes('urls:'));
    host.containerEl.rows.find(row => row.name === 'Connection')!.controls[1].click!();
    assert.equal(host.updates, 1);
  } finally { settingsHost.modern = true; }
});

test('runtime reserves IDs from unmapped non-excluded notes before generating an imported ID', async () =>
{
  const r = runtime();
  r.docs.set('notes/planning.md', '- [ ] Existing local task 🆔 4fzzzx');
  const original = Math.random;
  let calls = 0;
  Math.random = () => ++calls === 1 ? 0.123456789 : 0.234567891;
  try { await r.plugin.sync(false); }
  finally { Math.random = original; }
  assert.equal(r.writes(), 1); assert.equal(calls, 2);
  const ids = taskIds(r.docs.get(r.file.path)!);
  assert.equal(ids.length, 1); assert.match(ids[0], /^[a-z\d]{6}$/);
  assert.notEqual(ids[0], '4fzzzx');
  const before = r.docs.get(r.file.path);
  await r.plugin.sync(false);
  assert.equal(r.docs.get(r.file.path), before); assert.equal(r.writes(), 1);
});

test('runtime uses the custom list property for sync and README, reads Tasks configuration and preserves planning', async () =>
{
  const r = runtime(); r.plugin.settings.repositoryProperty = 'urls';
  r.docs.set(r.file.path, '---\n' + JSON.stringify({ urls: ['https://example.org', 'https://github.com/o/r', 'https://github.com/other/repo'] }) + '\n---\nLocal text\n');
  r.app.vault.configDir = '.custom-config';
  r.app.vault.adapter = {
    exists: async (path: string) =>
    {
      assert.equal(path, '.custom-config/plugins/obsidian-tasks-plugin/data.json'); return true;
    },
    read: async () => JSON.stringify({ taskFormat: 'dataview', globalFilter: '#task' })
  };
  await r.plugin.sync(false);
  let content = r.docs.get(r.file.path)!;
  assert.ok(content.includes('[created:: 2026-11-01]')); assert.ok(content.includes('#task'));
  assert.equal(r.writes(), 1);
  await r.plugin.sync(false); assert.equal(r.writes(), 1);
  content = content.replace('[created:: 2026-11-01]', '[created:: 2026-11-01] [scheduled:: 2026-12-01]');
  r.docs.set(r.file.path, content);
  r.setIssues([issue(1, 'closed')]); await r.plugin.sync(false);
  assert.ok(r.docs.get(r.file.path)!.includes('[scheduled:: 2026-12-01]'));
  r.internal.http = async () => ok(markdownFile());
  assert.equal((await r.internal.repositoryPreview(r.file.path, 'README.md', false)).markdown, '# Hello\n\nWorld');
});

test('runtime refuses writes when Tasks configuration is unreadable or settings change during fetch', async () =>
{
  const r = runtime();
  r.app.vault.adapter = { exists: async () => true, read: async () => '{broken' };
  await r.plugin.sync(false); assert.equal(r.writes(), 0);
  r.plugin.settings.respectTasks = false;
  await r.plugin.sync(false); assert.equal(r.writes(), 1);
  const other = runtime();
  other.beforeFetch(() => { other.plugin.settings.respectTasks = false; });
  await other.plugin.sync(false); assert.equal(other.writes(), 0);
});
test('runtime initial import is quiet, subsequent additions remain unread, and unchanged sync never processes', async () => {
  const r = runtime();
  await r.plugin.sync(false);
  assert.equal(r.writes(), 1); assert.deepEqual(r.local.unread, []); assert.equal(Notice.messages.length, 0);
  await r.plugin.sync(false); assert.equal(r.writes(), 1);
  r.setIssues([issue(1), issue(2)]); await r.plugin.sync(false);
  assert.equal(r.local.unread.length, 1); assert.equal(r.local.unread[0].number, 2);
  assert.equal(Notice.messages.filter(m => m.includes('1 new assigned')).length, 1);
  await r.plugin.sync(false); assert.equal(r.local.unread.length, 1); assert.equal(r.writes(), 2);
});
test('runtime close/reopen/unassign/empty snapshots replace only managed tasks', async () => {
  const r = runtime(); await r.plugin.sync(false);
  r.setIssues([issue(1, 'closed')]); await r.plugin.sync(false); assert.ok(r.docs.get(r.file.path)!.includes('- [x]'));
  r.setIssues([issue(1)]); await r.plugin.sync(false); assert.ok(r.docs.get(r.file.path)!.includes('- [ ]'));
  r.setIssues([]); await r.plugin.sync(false);
  assert.ok(r.docs.get(r.file.path)!.includes('User text')); assert.ok(!r.docs.get(r.file.path)!.includes('#1'));
});
test('runtime failure retains previous tasks and notification baseline', async () => {
  const r = runtime(); await r.plugin.sync(false);
  const before = r.docs.get(r.file.path), baseline = JSON.stringify(r.local.snapshots);
  r.setFail(); await r.plugin.sync(false);
  assert.equal(r.docs.get(r.file.path), before); assert.equal(JSON.stringify(r.local.snapshots), baseline); assert.equal(r.writes(), 1);
});
test('runtime duplicate mappings present initially or created during fetch skip writes', async () => {
  for (const during of [false, true]) {
    const r = runtime();
    const duplicate = () => r.docs.set('notes/duplicate.md', '---\ngithub_repo: https://github.com/O/R.git/\n---\nOther user text');
    if (during) r.beforeFetch(duplicate); else duplicate();
    await r.plugin.sync(false); assert.equal(r.writes(), 0); assert.deepEqual(r.local.snapshots, {});
  }
});
test('runtime concurrent edits and unload after fetch prevent writes and notification commits', async () => {
  for (const unload of [false, true]) {
    const r = runtime();
    r.beforeFetch(() => { if (unload) r.internal.alive = false; else r.docs.set(r.file.path, r.docs.get(r.file.path)! + 'Concurrent user edit'); });
    await r.plugin.sync(false); assert.equal(r.writes(), 0); assert.deepEqual(r.local.snapshots, {});
  }
});
test('runtime malformed markers are retained and excluded folders are not imported', async () => {
  const r = runtime(); r.docs.set(r.file.path, r.docs.get(r.file.path)! + START);
  await r.plugin.sync(false); assert.equal(r.writes(), 0);
  const other = runtime(); other.plugin.settings.excludedFolders = 'notes';
  await other.plugin.sync(false); assert.equal(other.writes(), 0);
});
test('runtime unsaved editor buffers defer updates', async () => {
  const r = runtime();
  r.app.workspace.getLeavesOfType = () => [{ view: new MarkdownView(r.file, 'Unsaved user text') }];
  await r.plugin.sync(false); assert.equal(r.writes(), 0); assert.deepEqual(r.local.snapshots, {});
});

const markdownFile = (text = '# Hello\n\nWorld') => ({ type: 'file', encoding: 'base64', size: Buffer.byteLength(text),
  content: Buffer.from(text).toString('base64'), path: 'README.md', html_url: 'https://github.com/o/r/blob/main/README.md' });
test('preview paths accept relative Markdown files and reject URLs/traversal/multiple instructions', () => {
  assert.equal(previewPath('README.md\n'), 'README.md');
  assert.equal(previewPath('docs/Getting started.md'), 'docs/Getting started.md');
  for (const value of ['', '../README.md', '/README.md', 'https://evil.test/r.md', 'README.md\nother.md', 'a/../README.md', 'a\\README.md', 'README.md?x=1', 'main.js']) assert.throws(() => previewPath(value));
});
test('repository Markdown uses the default branch and decodes UTF-8 without sending anonymous credentials', async () => {
  let url = '';
  const result = await new GitHubClient(async req => {
    url = req.url; assert.equal(req.method, 'GET'); assert.equal(req.headers.Authorization, undefined);
    return ok(markdownFile('# Grüße 🌉'));
  }, '').repositoryMarkdown('o/r', 'README.md');
  assert.equal(url, 'https://api.github.com/repos/o/r/contents/README.md');
  assert.equal(result.markdown, '# Grüße 🌉'); assert.ok(result.url.startsWith('https://github.com/o/r/blob/'));
});
test('repository Markdown rejects directories, oversized/invalid content and unrelated source URLs', async () => {
  for (const file of [[], { ...markdownFile(), type: 'dir' }, { ...markdownFile(), size: 205000 }, { ...markdownFile(), content: '!' },
    { ...markdownFile(), content: '/w==' }, { ...markdownFile(), html_url: 'https://evil.test/r.md' }, { ...markdownFile(), path: 'other.md' }]) {
    await assert.rejects(new GitHubClient(async () => ok(file), '').repositoryMarkdown('o/r', 'README.md'));
  }
});
test('remote Markdown keeps formatting and relative links without executing HTML/code or loading images', () => {
  const html = previewHtml('# Intro\n\n**Bold** [Docs](docs/guide.md)\n\n![badge](https://tracker.test/a.png)\n\n<script>alert(1)</script>\n\n```dataviewjs\nalert(2)\n```\n\n- [ ] remote task\n\n[Bad](javascript:alert(3))', 'https://github.com/o/r/blob/main/README.md');
  assert.ok(html.includes('<h1>Intro</h1>')); assert.ok(html.includes('<strong>Bold</strong>'));
  assert.ok(html.includes('https://github.com/o/r/blob/main/docs/guide.md'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('<input'));
  assert.ok(!html.includes('href="javascript:')); assert.ok(html.includes('<pre><code class="language-dataviewjs">'));
});
test('preview cache shares requests, expires, refreshes, evicts failures and bounds retained content', async () => {
  let now = 1, calls = 0;
  const cache = new PreviewCache(() => now);
  const fetch = async () => { calls++; return { markdown: 'test', url: 'https://github.com/o/r/blob/main/README.md' }; };
  await Promise.all([cache.get('one', false, fetch), cache.get('one', true, fetch)]); assert.equal(calls, 1);
  await cache.get('one', false, fetch); assert.equal(calls, 1);
  await cache.get('one', true, fetch); assert.equal(calls, 2);
  now += 300001; await cache.get('one', false, fetch); assert.equal(calls, 3);
  await assert.rejects(cache.get('fail', false, async () => { throw new Error('offline'); }));
  await cache.get('fail', false, fetch); assert.equal(calls, 4);
  for (let i = 0; i < 33; i++) await cache.get(`key-${i}`, false, fetch);
  await cache.get('one', false, fetch); assert.equal(calls, 38);
  cache.clear(); await cache.get('one', false, fetch); assert.equal(calls, 39);
});
test('runtime repository previews never modify notes and allow public reads while signed out', async () => {
  const r = runtime(), before = r.docs.get(r.file.path);
  r.internal.session.disconnect();
  r.internal.http = async (req: { headers: Record<string, string> }) => { assert.equal(req.headers.Authorization, undefined); return ok(markdownFile()); };
  const result = await r.internal.repositoryPreview(r.file.path, 'README.md', false);
  assert.equal(result.markdown, '# Hello\n\nWorld'); assert.equal(r.writes(), 0); assert.equal(r.docs.get(r.file.path), before);
});
test('private preview retries with the connected token and reports missing Contents permission', async () => {
  const r = runtime(); const requests: any[] = [];
  r.internal.http = async (req: any) => { requests.push(req); return req.headers.Authorization ? ok(markdownFile()) : { status: 404, json: {} }; };
  await r.internal.repositoryPreview(r.file.path, 'README.md', false);
  assert.equal(requests.length, 2); assert.equal(requests[1].headers.Authorization, 'Bearer fake'); assert.equal(r.writes(), 0);
  r.internal.http = async () => ({ status: 404, json: {} });
  await assert.rejects(r.internal.repositoryPreview(r.file.path, 'README.md', true), /Contents: read-only/);
});
test('preview results are discarded if connection or repository mapping changes during fetch', async () => {
  for (const disconnect of [true, false]) {
    const r = runtime();
    r.internal.http = async () => {
      if (disconnect) r.internal.epoch++;
      else r.docs.set(r.file.path, '---\ngithub_repo: https://github.com/other/repo\n---\n');
      return ok(markdownFile());
    };
    await assert.rejects(r.internal.repositoryPreview(r.file.path, 'README.md', false)); assert.equal(r.writes(), 0);
  }
});
class PreviewElement {
  children: PreviewElement[] = [];
  events = new Map<string, () => void>();
  text = ''; open = false; disabled = false; hidden = false;
  constructor(public tag = 'div', public cls = '') {}
  createEl(tag: string, options: { text?: string; cls?: string } = {}) { const el = new PreviewElement(tag, options.cls); el.text = options.text ?? ''; this.children.push(el); return el; }
  createDiv(options: { cls?: string } = {}) { return this.createEl('div', options); }
  setText(text: string) { this.text = text; }
  empty() { this.children = []; this.text = ''; }
  appendChild(value: { html: string }) { this.text += value.html; }
  addEventListener(name: string, handler: () => void) { this.events.set(name, handler); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('collapsible preview loads lazily, refreshes on request, retains content on errors and ignores unload', async () => {
  const el = new PreviewElement(); let initial = 0, refresh = 0, fail = false;
  const component = new RepositoryPreview(el as unknown as HTMLElement, 'README.md', async () => {
    initial++; return { markdown: '# First', url: markdownFile().html_url };
  }, async () => { refresh++; if (fail) throw new Error('offline'); return { markdown: '# Updated', url: markdownFile().html_url }; });
  component.onload();
  assert.equal(initial, 0);
  const details = el.children[0], tools = details.children[1], button = tools.children[0], status = details.children[2], body = details.children[3];
  assert.equal(details.open, false); details.open = true; details.events.get('toggle')!(); await settle();
  assert.equal(initial, 1); assert.ok(body.text.includes('First'));
  details.events.get('toggle')!(); await settle(); assert.equal(initial, 1);
  button.events.get('click')!(); await settle(); assert.equal(refresh, 1); assert.ok(body.text.includes('Updated'));
  fail = true; button.events.get('click')!(); await settle(); assert.ok(status.text.includes('Previous preview retained')); assert.ok(body.text.includes('Updated'));
  component.onunload(); button.events.get('click')!(); await settle(); assert.equal(refresh, 2);
});
