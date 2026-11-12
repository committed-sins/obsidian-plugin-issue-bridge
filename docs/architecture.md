# Architecture

## Data flow

`github_repo` in an existing note → validated repository mapping → authenticated GitHub issue fetch → complete assigned-issue snapshot → task renderer → guarded managed-block update.

GitHub supplies the synchronized issue data for v0.1. Obsidian owns surrounding note content. Keep the provider client separate from Markdown synchronization so another tracker can be added later without changing note-write safeguards.

## Planned source layout

```text
src/
  main.ts                 Plugin lifecycle and commands
  settings.ts             Configuration and settings UI
  github/
    auth.ts               Authorization, renewal and secure-store adapter
    client.ts             GitHub API, pagination and error handling
    types.ts              Provider data models
  sync/
    scanner.ts            Explicit repository mappings and duplicate detection
    renderer.ts           Deterministic, escaped Markdown tasks
    synchronizer.ts       Complete snapshots and safe note updates
tests/                    Synthetic unit and integration fixtures
```

This is a planned layout; source files, manifest and build tooling are not created during design initialization. Keep business logic out of `main.ts` and avoid tracker abstractions without a concrete use.

## Synchronization boundary

1. Scan current mappings and reject conflicting repository ownership.
2. Fetch every page for one repository, including closed issues; filter by the connected account and exclude pull requests.
3. Produce a complete snapshot only when all requests succeed. Track errors separately from successful empty results.
4. Render stable issue links/tasks with safe text escaping and a deterministic order.
5. Recheck the mapping and note content, validate one marker pair and apply only the managed-block update through an appropriate Obsidian file API.
6. Skip unchanged content. Defer conflicting edits. Never share incomplete provider results with the writer.

Serialize writes per note and prevent overlapping sync jobs. Coalesce repeated triggers. Do not write or renew credentials after plugin shutdown. Choose ordering, first insertion and mapping-removal behavior before freezing fixtures.

## Authentication decisions still open

The concept selects a GitHub App with user access tokens, but does not establish a working public-client authentication design. Before implementation, verify current GitHub requirements for authorization, token exchange, refresh and app installation, together with Obsidian's desktop/mobile capabilities.

Evaluate authorization-code/PKCE and device authorization where supported. Determine whether token exchange/renewal needs a backend. A distributed plugin must not contain a confidential client secret; introducing a backend requires a documented deployment, privacy and maintenance decision.

Select a secure device-local credential store with defined behavior on both target platforms. Do not silently fall back to plaintext plugin `data.json`, note frontmatter or synced files. Define account identity, renewal, disconnect, revoked access and missing app-installation behavior. Request the minimum permissions needed for the MVP.

## Open product decisions

- Exact supported repository URL forms and case/rename handling.
- Initial managed-section placement and behavior after a mapping is removed or changed.
- Task ordering, closed-task completion metadata and compatibility with Tasks auto-added metadata.
- Default interval, rate-limit/backoff behavior and user-visible sync status.
- Concrete authorization, renewal and secure-storage implementation on desktop and mobile.

The initial single-note-per-repository rule follows the latest concept's proposed MVP default. It can be revisited explicitly before implementation.
