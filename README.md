# Issue Bridge

Sync GitHub issues assigned to you into existing Obsidian notes. Includes closed issues, new-assignment notifications and collapsible README previews.

## Setup

1. Install with BRAT or copy `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/committed-sins/obsidian-plugin-issue-bridge/releases/latest) into `<vault>/.obsidian/plugins/issue-bridge/`.
2. Enable Issue Bridge, choose repository access in settings and sign in.
3. Set **Repository property** to your frontmatter property (`github_repo` by default, for example `urls`):

```yaml
urls:
  - https://example.org
  - https://github.com/owner/repository
```

A single URL works too. The first valid GitHub repository URL wins. Use one note per repository; duplicate mappings are skipped.

## Tasks

Imported tasks display an Octocat, a plain title, a linked issue number, then Tasks metadata. **Respect Obsidian Tasks** is enabled by default: it adds a stable six-character ID and the issue's creation date (UTC), using the saved Tasks emoji or Dataview format and global filter. New IDs are checked against existing IDs in non-excluded notes; older IDs remain unchanged. Without Tasks, it uses emoji. Local scheduling, priorities, dependencies and tags survive synchronization. Disabling the option stops adding metadata and retains existing metadata.

```markdown
- [ ] :octocat: Fix login [#42](https://github.com/owner/repository/issues/42) 🆔 a7k2m9 ➕ 2026-11-19
```

Type `:octocat:` in any note to display the Octocat in Live Preview, Reading view and rendered task lists. Source mode shows the original shortcode.

Under **Source tags → GitHub issues tag**, optionally set a tag such as `#source/github`. Default: empty. The tag is appended on sync, including with Tasks integration disabled, without duplicating an existing identical tag. Changing or clearing the setting preserves tags already stored in notes.

GitHub controls issue titles and open/closed status. Unassigned issues disappear after a successful complete fetch. Notes outside the managed section remain unchanged. Recurring tasks and automatic deletion are unsuitable for imported issues because GitHub controls their lifecycle.

Checks run every five minutes while Obsidian is open, with startup/resume checks and manual sync. New assignments appear in a notice and the status-bar unread list; the first import is quiet.

## README preview

Add this block to a mapped note:

````markdown
```issue-bridge
README.md
```
````

Expand to load; refresh or open the source on GitHub. Other relative `.md` paths work. The preview is read-only. Public files work without sign-in; private files require **Contents: read-only**. Remote images are links, and remote HTML or plugin code is not executed.

## Access and verification

The built-in GitHub App currently supports **Committed Sins only**. For other accounts, configure your own Device Flow-enabled GitHub App with **Issues: read-only**. Tokens stay in Obsidian SecretStorage; imported issue titles and links are saved in your vault.

Release artifacts have SHA-256 checksums and GitHub build-provenance attestations starting with 0.1.3:

```sh
gh attestation verify main.js --repo committed-sins/obsidian-plugin-issue-bridge
```

Settings are searchable on Obsidian 1.13+. The minimum version is 1.11.4. Version 0.1.8 was tested on Windows in Obsidian 1.15.1. See the [release notes](docs/releases/0.1.8.md) for the tested scenarios. Mobile, live token renewal and private README access remain unverified.

## Development

```sh
npm ci
npm run check
npm run deploy
```

Deployment uses `OBSIDIAN_VAULT` or ignored `.env.local` and preserves settings and notes. See [setup](docs/setup.md), [changelog](CHANGELOG.md) and [third-party notices](THIRD_PARTY_NOTICES.md). MIT, Committed Sins / Michael J. Stallinger.
