# Issue Bridge for Obsidian

**Connect your issues. Keep your context.**

Issue Bridge connects GitHub repositories to existing Obsidian notes and synchronizes assigned issues as native Markdown tasks. Keep development work in the notes where your projects live, with tasks that Obsidian Tasks can query.

Developed by **Committed Sins — Michael J. Stallinger**.

**Status: design repository. No working plugin, release, GitHub App registration or vault deployment yet.**

## Intended behavior

- Link a note to a repository through the `github_repo` frontmatter property.
- Import issues assigned to the connected GitHub account, including closed issues.
- Synchronize issue titles, URLs and open/closed states in a dedicated managed section.
- Keep frontmatter and all content outside that section unchanged.
- Support manual and periodic synchronization, retaining the last successful result on errors.
- Target desktop and mobile, with one GitHub account per installation in the MVP.

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
- Platform target: desktop and mobile; neither is implemented or live-tested yet.

The repository name follows the existing `obsidian-plugin-*` convention. The original concept used the shorter `obsidian-issue-bridge` spelling.

Bidirectional synchronization, multiple accounts, other trackers, pull requests, GitHub Projects, label/milestone mapping and custom task templates remain future work. Issue Bridge is independent of the other Committed Sins plugins.

## Design documents

- [MVP requirements and acceptance criteria](docs/requirements.md)
- [Architecture, authentication decisions and planned source layout](docs/architecture.md)
- [Implementation roadmap](docs/roadmap.md)

Authentication is intended to use a GitHub App with user access tokens. The login flow, renewal mechanism and device-local secure storage still need validation before implementation. Credentials must never be committed or stored as plaintext in synced vault files.
