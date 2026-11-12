import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, END, duplicateRepos, normalizeRepo, renderTasks, updateBlock, newIssueNumbers } from '../src/sync/core';
import { GitHubClient, ApiError, type Issue } from '../src/github/client';
import { pollForToken, requestDeviceCode, refreshAccessToken, pause, type Http } from '../src/github/auth';
import { Session } from '../src/github/session';
import IssueBridge from '../src/main';
import { TFile, MarkdownView, Notice } from './obsidian';
const fixture: Issue[] = [{ number: 2, title: 'Keep context', state: 'open' }, { number: 1, title: 'Done', state: 'closed' }];
const issue = (number: number, state = 'open') => ({ number, title: `Issue ${number}`, state, assignees: [{ login: 'tester' }] });
const ok = (json: unknown) => ({ status: 200, json });

test('repository normalization rejects credentials, arbitrary hosts and subpaths', () => {
  assert.equal(normalizeRepo('https://github.com/Owner/Repo.git/'), 'owner/repo');
  for (const value of [undefined, ['https://github.com/o/r'], 'https://evil.test/o/r', 'http://github.com/o/r', 'https://user@github.com/o/r', 'https://github.com/o/r/issues', 'https://github.com/o/r?q=x', 'https://github.com/o/r#x']) assert.throws(() => normalizeRepo(value));
});
test('task renderer handles state and escapes hostile Markdown and Tasks metadata', () => {
  const result = renderTasks('owner/repo', [{ number: 1, title: 'A](https://evil.test)\n- [ ] 📅 2030-01-01 <!-- issue-bridge:end --> <script>', state: 'closed' }]);
  assert.equal(result.split('\n').length, 1);
  assert.ok(result.startsWith('- [x] [#1 A&#93;'));
  assert.ok(!result.includes('📅')); assert.ok(!result.includes('<script>')); assert.ok(!result.includes(END));
  assert.ok(result.endsWith('](https://github.com/owner/repo/issues/1)'));
});
test('managed update preserves YAML, surrounding bytes and CRLF; repeated update is identical', () => {
  const yaml = '---\r\nid: keep\r\ncontexts: ["[[A]]"]\r\n---\r\n';
  const body = `Before\r\n${START}\r\nold\r\n${END}\r\nAfter\r\n`;
  const result = updateBlock(yaml + body, yaml.length, 'owner/repo', fixture);
  assert.ok(result.startsWith(yaml + 'Before\r\n' + START));
  assert.ok(result.endsWith(END + '\r\nAfter\r\n'));
  assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(updateBlock(result, yaml.length, 'owner/repo', fixture), result);
  assert.ok(result.indexOf('#1 Done') < result.indexOf('#2 Keep context'));
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
