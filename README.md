# Issue Bridge for Obsidian

**Connect your issues. Keep your context.**

Issue Bridge connects GitHub repositories to existing Obsidian notes and synchronizes assigned issues as native Markdown tasks. Keep development work in the notes where your projects live, with tasks that Obsidian Tasks can query.

Developed by **Committed Sins — Michael J. Stallinger**.

**Status: development preview 0.1.0, deployed to the Test vault. Automated checks pass; real GitHub App sign-in and live desktop/mobile validation are pending. No public release yet.**

## Preview behavior

- Link a note to a repository through the `github_repo` frontmatter property.
- Import issues assigned to the connected GitHub account, including closed issues.
- Synchronize issue titles, URLs and open/closed states in a dedicated managed section.
- Keep frontmatter and all content outside that section unchanged.
- Support manual and periodic synchronization, retaining the last successful result on errors.
- Target desktop and mobile, with one GitHub account per installation in the MVP.

The settings page configures GitHub App sign-in, startup/resume checks, the polling interval, notifications and excluded folders. The first import establishes a device-local baseline. Later newly assigned issues produce one notice per sync and remain in an unread list until acknowledged through the status bar or **Show new assigned issues** command. Default polling is every five minutes while Obsidian is running; no background push service is included.

GitHub is the source of truth in v0.1. Local edits to imported tasks, including checkbox changes, are replaced by the next successful sync. Closed assigned issues remain visible; issues no longer assigned to the account are removed only after a complete successful fetch.

```yaml
---
github_repo: https://github.com/committed-sins/obsidian-plugin-issue-bridge
---
```

Illustrative generated section; the issues below are examples:

```markdown
## GitHub Issues

<!-- issue-bridge:start -->
- [ ] [#12 Support multiple repositories](https://github.com/committed-sins/obsidian-plugin-issue-bridge/issues/12)
- [x] [#8 Improve authentication](https://github.com/committed-sins/obsidian-plugin-issue-bridge/issues/8)
<!-- issue-bridge:end -->
```

The initial design allows one active note per repository in a vault. Duplicate mappings produce a warning and leave all affected notes unchanged.

## Identity and scope

- Name: **Issue Bridge**
- Plugin ID: `issue-bridge`
- Repository: `committed-sins/obsidian-plugin-issue-bridge`
- Implementation language: TypeScript
- License: MIT
- Platform target: desktop and mobile; live verification is pending.

The repository name follows the existing `obsidian-plugin-*` convention. The original concept used the shorter `obsidian-issue-bridge` spelling.

Bidirectional synchronization, multiple accounts, other trackers, pull requests, GitHub Projects, label/milestone mapping and custom task templates remain future work. Issue Bridge is independent of the other Committed Sins plugins.

## Setup and development

See [test preview setup](docs/setup.md) for GitHub App registration, sign-in, repository-note mapping and live acceptance checks. Enable/reload **Issue Bridge** manually in the **Test** vault after deployment.

```sh
npm ci
npm run check
npm run deploy
```

Deployment uses `OBSIDIAN_VAULT` or ignored `.env.local`, copying only the three build artifacts and preserving settings, activation and notes. This checkout targets `C:/Users/mj/Obsidian/Test`.

Authentication and its dialog are adapted from a pinned MIT-licensed GitHub Enterprise Sync commit. See [third-party notices](THIRD_PARTY_NOTICES.md). The upstream app identity and plaintext token store are not used.

## Documents

- [MVP requirements and acceptance criteria](docs/requirements.md)
- [Architecture, authentication decisions and planned source layout](docs/architecture.md)
- [Implementation roadmap](docs/roadmap.md)

Authentication uses GitHub App device authorization with user access tokens and renewal. The registered **Issue Bridge by Committed Sins** app is the default; its initial installation scope is limited to Committed Sins. Select **Choose repositories on GitHub** in settings to install or request access before signing in. Access/refresh tokens are stored together in Obsidian SecretStorage, never in note files or plugin settings. SecretStorage's platform protections are provided by Obsidian; this is not a claim of encryption at rest on every platform. No client secret is embedded. GitHub.com is the only supported host in this initial preview.
